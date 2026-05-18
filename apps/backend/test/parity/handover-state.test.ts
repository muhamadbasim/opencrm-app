/**
 * Property-Based Test — Property 8: Handover non-`expired` persistence
 *
 * **Validates: Requirements 14.5 (Property 8 — design.md "Correctness Properties")**
 *
 * Property 8 statement (design.md):
 *   "Tidak ada conversation handover dengan status `expired` yang persist;
 *    status `expired` hanya boleh muncul sebagai event escalate/triage saat
 *    masih pending."
 *
 * Per $OPENCRM_BUILDER_CLASS/backend/STATE-MACHINES.md "Handover Request Status":
 *
 *   "There is no persisted `expired` request status in source; timeout
 *    becomes escalation/triage while status remains `pending`."
 *
 * Two complementary checks:
 *
 *   1. STATE-MACHINE SIMULATOR (random lifecycle sequences)
 *      Build the documented handover state machine over
 *      `'pending' | 'approved' | 'rejected'` (no `expired` member).
 *      Generate ≥100 random sequences (length 5–20) of operations
 *      (`approve`, `reject`, `timeout`, `escalate`) starting from
 *      `status='pending'`. Assert that no operation EVER produces a state
 *      labelled `'expired'`. Timeouts must produce one of:
 *        - escalation: state stays `pending`, escalation_count increments,
 *          escalated_to is set to a supervisor id.
 *        - triage:    state stays `pending`, triage_status flips to
 *          `'pending_supervisor_note'`.
 *
 *   2. STATIC SOURCE SCAN (truth-of-the-codebase)
 *      a. `apps/backend/src/modules/handover/service.ts` MUST NOT contain
 *         the literal `'expired'` (or `"expired"`) ANYWHERE. The persisted
 *         `handover_requests.status` enum in source is exactly
 *         `'pending' | 'approved' | 'rejected'`.
 *      b. The exported type alias `HandoverStatus` MUST be exactly
 *         `'pending' | 'approved' | 'rejected'`.
 *      c. The documented timeout-handling logic in handover/service.ts
 *         (the section that increments `escalation_count` / sets
 *         `triage_status='pending_supervisor_note'`, around lines 792–873)
 *         MUST NOT contain `status: 'expired'` or any update that flips the
 *         row to `expired`.
 *
 * Random generation uses a deterministic Mulberry32 PRNG seeded from the env
 * var `OPENCRM_PROP_SEED` (default 0xC0FFEE). NO new npm dependency is added
 * (parity rule).
 *
 * Test runner: `bun test` (matches apps/backend/test/* convention).
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

// ---------- locate $OPENCRM_APP and source files ----------

const OPENCRM_APP =
	process.env.OPENCRM_APP ?? '/home/ubuntu/.openclaw/workspace/opencrm-app'

const APP_ROOT = existsSync(OPENCRM_APP)
	? realpathSync(OPENCRM_APP).replace(/\/+$/, '')
	: resolvePath(OPENCRM_APP).replace(/\/+$/, '')

const HANDOVER_SERVICE = resolvePath(
	APP_ROOT,
	'apps/backend/src/modules/handover/service.ts',
)

// ---------- deterministic PRNG (Mulberry32) ----------

function makeRng(seed: number) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const SEED = Number(process.env.OPENCRM_PROP_SEED ?? 0xc0ffee)
const rng = makeRng(SEED)

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(rng() * arr.length)] as T
}

// ---------- handover state machine (per STATE-MACHINES.md) ----------

type HandoverStatus = 'pending' | 'approved' | 'rejected'
type TriageStatus = null | 'pending_supervisor_note'

interface HandoverRow {
	status: HandoverStatus
	escalation_count: number
	escalated_to: string | null
	triage_status: TriageStatus
}

type Op = 'approve' | 'reject' | 'timeout' | 'escalate'

const ALL_OPS: readonly Op[] = ['approve', 'reject', 'timeout', 'escalate']

const ESCALATION_BUDGET = 2 // matches handover/service.ts: `if (escalationCount < 2 && supervisorIds.length > 0)`

/**
 * Apply an operation to a handover row, producing the next row state.
 * Mirrors handover/service.ts logic at the documented lines.
 *
 * Invariants enforced:
 *   - status ∈ { pending, approved, rejected } at every step (NEVER 'expired')
 *   - approve / reject only valid from pending
 *   - timeout / escalate only valid from pending; both keep status='pending'
 *   - timeout under escalation budget: escalation_count++, escalated_to set
 *   - timeout over budget: triage_status='pending_supervisor_note'
 *   - escalate is a synonym for timeout-under-budget for the simulator
 */
function applyOp(row: HandoverRow, op: Op, supervisorId: string): HandoverRow {
	if (row.status !== 'pending') {
		// approved / rejected are terminal-ish (we treat further ops as no-ops)
		return row
	}
	switch (op) {
		case 'approve':
			return { ...row, status: 'approved' }
		case 'reject':
			return { ...row, status: 'rejected' }
		case 'escalate':
		case 'timeout': {
			if (row.escalation_count < ESCALATION_BUDGET) {
				return {
					...row,
					escalation_count: row.escalation_count + 1,
					escalated_to: supervisorId,
				}
			}
			return {
				...row,
				triage_status: 'pending_supervisor_note',
			}
		}
	}
}

function generateOpSequence(): Op[] {
	const len = 5 + Math.floor(rng() * 16) // 5..20 inclusive
	const seq: Op[] = []
	for (let i = 0; i < len; i++) seq.push(pick(ALL_OPS))
	return seq
}

// ---------- the property test ----------

const N_SEQUENCES = Number(process.env.OPENCRM_PROP_COUNT ?? 120)

describe('Property 8 — Handover non-`expired` persistence', () => {
	it('handover/service.ts exists & is readable', () => {
		expect(existsSync(HANDOVER_SERVICE)).toBe(true)
	})

	it(`state-machine: ${N_SEQUENCES} random op sequences — status never becomes 'expired'`, () => {
		const counterexamples: Array<{
			seqIndex: number
			step: number
			op: Op
			before: HandoverRow
			after: HandoverRow
			seq: Op[]
		}> = []

		// Coverage counters (informational)
		const opCounts: Record<Op, number> = {
			approve: 0,
			reject: 0,
			timeout: 0,
			escalate: 0,
		}
		let seqsThatTimedOut = 0
		let seqsThatTriaged = 0
		let seqsThatApproved = 0
		let seqsThatRejected = 0
		let totalEscalationsApplied = 0
		let totalTriagesApplied = 0

		for (let s = 0; s < N_SEQUENCES; s++) {
			const seq = generateOpSequence()
			let row: HandoverRow = {
				status: 'pending',
				escalation_count: 0,
				escalated_to: null,
				triage_status: null,
			}

			let timedOut = false
			let triaged = false

			for (let i = 0; i < seq.length; i++) {
				const op = seq[i]!
				opCounts[op] += 1
				const before = row
				const after = applyOp(row, op, `supervisor-${(i % 3) + 1}`)

				// Property 8: status MUST never be 'expired'. Cast through any
				// because the type does not allow it — if some future bug ever
				// did, the runtime check would still catch it.
				if ((after.status as string) === 'expired') {
					counterexamples.push({
						seqIndex: s,
						step: i,
						op,
						before,
						after,
						seq,
					})
				}

				if (
					(op === 'timeout' || op === 'escalate') &&
					before.status === 'pending'
				) {
					timedOut = true
					if (after.escalation_count > before.escalation_count) {
						totalEscalationsApplied += 1
					}
					if (
						after.triage_status === 'pending_supervisor_note' &&
						before.triage_status !== 'pending_supervisor_note'
					) {
						totalTriagesApplied += 1
						triaged = true
					}
				}

				row = after
			}

			if (timedOut) seqsThatTimedOut += 1
			if (triaged) seqsThatTriaged += 1
			if (row.status === 'approved') seqsThatApproved += 1
			if (row.status === 'rejected') seqsThatRejected += 1
		}

		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 8] ${counterexamples.length} counterexample(s) of ${N_SEQUENCES} sequences:\n` +
					counterexamples
						.slice(0, 5)
						.map(
							(c, idx) =>
								`  #${idx + 1} seq=${c.seqIndex} step=${c.step} op=${c.op}\n` +
								`     before=${JSON.stringify(c.before)}\n` +
								`     after=${JSON.stringify(c.after)}`,
						)
						.join('\n'),
			)
		}

		// eslint-disable-next-line no-console
		console.log(
			`[Property 8] sequences=${N_SEQUENCES} ` +
				`opCounts=${JSON.stringify(opCounts)} ` +
				`timedOut=${seqsThatTimedOut} triaged=${seqsThatTriaged} ` +
				`approved=${seqsThatApproved} rejected=${seqsThatRejected} ` +
				`escalationsApplied=${totalEscalationsApplied} ` +
				`triagesApplied=${totalTriagesApplied}`,
		)

		expect(counterexamples).toEqual([])
		// Health-check: the random generator must actually exercise the
		// timeout/escalate path; otherwise the test is vacuous.
		expect(seqsThatTimedOut).toBeGreaterThan(0)
		// And both branches of the timeout logic should be exercised across
		// 100+ runs.
		expect(totalEscalationsApplied).toBeGreaterThan(0)
		expect(totalTriagesApplied).toBeGreaterThan(0)
	})

	it('boundary spot-checks: timeout under budget escalates, timeout over budget triages, approve/reject terminal', () => {
		// Under budget — escalate
		const r0: HandoverRow = {
			status: 'pending',
			escalation_count: 0,
			escalated_to: null,
			triage_status: null,
		}
		const r1 = applyOp(r0, 'timeout', 'sup-1')
		expect(r1).toEqual({
			status: 'pending',
			escalation_count: 1,
			escalated_to: 'sup-1',
			triage_status: null,
		})
		const r2 = applyOp(r1, 'timeout', 'sup-2')
		expect(r2).toEqual({
			status: 'pending',
			escalation_count: 2,
			escalated_to: 'sup-2',
			triage_status: null,
		})

		// Over budget — triage; status STILL pending (not 'expired')
		const r3 = applyOp(r2, 'timeout', 'sup-3')
		expect(r3).toEqual({
			status: 'pending',
			escalation_count: 2, // unchanged: budget exhausted
			escalated_to: 'sup-2', // unchanged
			triage_status: 'pending_supervisor_note',
		})
		expect(r3.status).not.toBe('expired')

		// Approve from pending
		const a = applyOp(r0, 'approve', 'sup-1')
		expect(a.status).toBe('approved')

		// Reject from pending
		const j = applyOp(r0, 'reject', 'sup-1')
		expect(j.status).toBe('rejected')

		// Approve when already approved is a no-op (no exotic transitions)
		const a2 = applyOp(a, 'reject', 'sup-1')
		expect(a2).toEqual(a)
	})

	it("static-source: handover/service.ts contains the literal 'expired' ZERO times", () => {
		const src = readFileSync(HANDOVER_SERVICE, 'utf8')
		// Match both single- and double-quoted forms of the literal 'expired'
		// AS A STRING LITERAL. We deliberately avoid matching the bareword
		// (e.g. variable named "expired") since the property specifically
		// concerns the persisted status string. The current snapshot has
		// neither, so both lookups return 0.
		const stringLiteralMatches =
			src.match(/['"]expired['"]/g) ?? []
		const barewordMatches = src.match(/\bexpired\b/g) ?? []

		if (stringLiteralMatches.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`[Property 8] handover/service.ts contains 'expired' string literal ${stringLiteralMatches.length} time(s) — VIOLATION:\n` +
					stringLiteralMatches.slice(0, 5).join('\n'),
			)
		}
		expect(stringLiteralMatches.length).toBe(0)

		// The bareword check is informational — it should also be 0 in the
		// current snapshot.
		// eslint-disable-next-line no-console
		console.log(
			`[Property 8] handover/service.ts: 'expired' string-literal hits=${stringLiteralMatches.length} bareword hits=${barewordMatches.length}`,
		)
		expect(barewordMatches.length).toBe(0)
	})

	it('static-source: HandoverStatus type alias is exactly `pending | approved | rejected`', () => {
		const src = readFileSync(HANDOVER_SERVICE, 'utf8')
		// Tolerate flexible whitespace and quote style; assert no `expired` in the union.
		const re =
			/export\s+type\s+HandoverStatus\s*=\s*['"](pending|approved|rejected)['"](\s*\|\s*['"](pending|approved|rejected)['"]){2}\s*$/m
		const ok = re.test(src)
		if (!ok) {
			// Print the line for diagnostics
			const lines = src.split('\n')
			const idx = lines.findIndex((l) => l.includes('HandoverStatus'))
			// eslint-disable-next-line no-console
			console.error(
				`[Property 8] HandoverStatus alias not matching expected shape. Found at line ${idx + 1}: ${lines[idx]}`,
			)
		}
		expect(ok).toBe(true)
	})

	it("static-source: documented timeout block (escalation + triage) does NOT contain `status: 'expired'`", () => {
		const src = readFileSync(HANDOVER_SERVICE, 'utf8')
		const lines = src.split('\n')
		// Documented timeout-handling block per Task 14.5 prompt: lines 792..873.
		// Tolerate small drift by widening to lines 780..900.
		const block = lines.slice(780, 900).join('\n')

		// Confirm the canonical escalation/triage markers ARE present in the
		// documented region (so we know we are scanning the right code).
		expect(block).toContain('escalation_count')
		expect(block).toContain('pending_supervisor_note')

		// Confirm the forbidden literal is ABSENT.
		const forbidden = /['"]expired['"]/g
		const hits = block.match(forbidden) ?? []
		if (hits.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`[Property 8] timeout block contains 'expired' literal ${hits.length} time(s):\n` +
					hits.join('\n'),
			)
		}
		expect(hits.length).toBe(0)

		// Also confirm we did NOT see a status update to `'expired'` in this
		// region (the prose form `status: 'expired'`).
		const statusExpired = /status\s*:\s*['"]expired['"]/g
		const statusHits = block.match(statusExpired) ?? []
		expect(statusHits.length).toBe(0)
	})
})
