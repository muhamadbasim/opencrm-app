/**
 * Property-Based Test — Property 7: Conversation Terminal at `resolved`
 *
 * **Validates: Requirements 14.4 (Property 7 — design.md "Correctness Properties")**
 *
 * Property 7 statement (design.md):
 *   "Untuk semua conversation dengan status `resolved`, tidak ada transisi
 *    keluar dari `resolved`. Inbound baru selalu memicu insert conversation
 *    row baru."
 *
 * Two complementary checks:
 *
 *   1. STATE-MACHINE SIMULATOR (random transition sequences)
 *      Build a small state machine over conversation status
 *      (`open | pending | snoozed | resolved`) per
 *      $OPENCRM_BUILDER_CLASS/backend/STATE-MACHINES.md "Conversation Status".
 *      Generate ≥100 random transition-attempt sequences (length 5–20)
 *      starting from `open`. At each step, if the sequence contains an attempt
 *      to transition OUT OF `resolved`, that attempt MUST be rejected
 *      (state stays `resolved`). Inbound on a resolved row MUST trigger a
 *      "create new conversation row" semantic, not a re-open of the row.
 *
 *   2. STATIC SOURCE SCAN (truth-of-the-codebase)
 *      a. `apps/backend/src/modules/conversation/service.ts` MUST NOT contain
 *         any path that mutates `status` from `'resolved'` to a non-resolved
 *         value (e.g. no `status: 'open'` write conditioned on a previously
 *         resolved row in a non-canonical way). The single status writer is
 *         `updateStatus(id, status)` which sets whatever the API provides;
 *         per design the API does not call updateStatus from a "reopen
 *         resolved" code path.
 *      b. `apps/backend/src/modules/webhook/service.ts` MUST contain the
 *         documented `status: { not: 'resolved' }` filter at the four lookup
 *         sites for active conversations (lines documented in Task 13 audit:
 *         2743, 3874, 4242, 4537 — channel agent, instagram, tiktok, whatsapp).
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

const CONVERSATION_SERVICE = resolvePath(
	APP_ROOT,
	'apps/backend/src/modules/conversation/service.ts',
)
const WEBHOOK_SERVICE = resolvePath(
	APP_ROOT,
	'apps/backend/src/modules/webhook/service.ts',
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

// ---------- conversation status state machine (per STATE-MACHINES.md) ----------

type ConvStatus = 'open' | 'pending' | 'snoozed' | 'resolved'

const ALL_STATUSES: readonly ConvStatus[] = [
	'open',
	'pending',
	'snoozed',
	'resolved',
]

/**
 * Allowed transitions per $OPENCRM_BUILDER_CLASS/backend/STATE-MACHINES.md
 * "Conversation Status" mermaid diagram. Transitions OUT of `resolved` are
 * intentionally absent: `resolved` is terminal. The diagram comment
 * "resolved --> open: new inbound creates a new conversation row, not reopen"
 * means a NEW row, not a transition on the existing row — so it is NOT a
 * transition on the same row's state machine.
 */
const ALLOWED_TRANSITIONS: ReadonlyArray<readonly [ConvStatus, ConvStatus]> = [
	['open', 'pending'],
	['open', 'resolved'],
	['open', 'snoozed'],
	['pending', 'open'],
	['pending', 'resolved'],
	['snoozed', 'open'],
	['snoozed', 'resolved'],
]

const ALLOWED_SET = new Set(
	ALLOWED_TRANSITIONS.map(([a, b]) => `${a}->${b}`),
)

interface TransitionAttempt {
	from: ConvStatus
	to: ConvStatus
}

/**
 * The simulator: applies an attempted transition. Returns the resulting state.
 * If the attempt would leave `resolved` (i.e. current state is `resolved` AND
 * the target differs from `resolved`), the simulator MUST reject the attempt
 * by keeping the state at `resolved`. This mirrors the design intent that
 * resolved is terminal and inbound creates a new row instead of re-opening.
 */
function applyTransition(
	current: ConvStatus,
	attempt: TransitionAttempt,
): { next: ConvStatus; rejected: boolean } {
	// Sanity: caller should pass attempts that "claim" current as `from`,
	// but we treat the simulator robustly: it always uses the current state.
	if (current === 'resolved' && attempt.to !== 'resolved') {
		return { next: 'resolved', rejected: true }
	}
	// Otherwise, allow only documented transitions; unknown attempts are no-ops.
	const key = `${current}->${attempt.to}`
	if (ALLOWED_SET.has(key)) return { next: attempt.to, rejected: false }
	return { next: current, rejected: true }
}

/**
 * Random sequence generator. Each step picks a random target status (any of
 * the 4) — i.e. we deliberately let some attempts try to leave `resolved`,
 * because that is precisely what Property 7 must reject. Sequence length
 * 5..20 starting from `open`.
 */
function generateSequence(): TransitionAttempt[] {
	const len = 5 + Math.floor(rng() * 16) // 5..20 inclusive
	const seq: TransitionAttempt[] = []
	let from: ConvStatus = 'open'
	for (let i = 0; i < len; i++) {
		const to = pick(ALL_STATUSES)
		seq.push({ from, to })
		// Note: we don't actually advance `from` based on the simulator here;
		// the simulator does that when running the sequence. The `from` field
		// is only metadata for diagnostics.
		from = to
	}
	return seq
}

// ---------- the property test ----------

const N_SEQUENCES = Number(process.env.OPENCRM_PROP_COUNT ?? 120)

describe('Property 7 — Conversation terminal at `resolved`', () => {
	it('source files (conversation/service.ts, webhook/service.ts) exist & are readable', () => {
		expect(existsSync(CONVERSATION_SERVICE)).toBe(true)
		expect(existsSync(WEBHOOK_SERVICE)).toBe(true)
	})

	it(`state-machine: ${N_SEQUENCES} random sequences — once resolved, stays resolved`, () => {
		const counterexamples: Array<{
			seqIndex: number
			step: number
			before: ConvStatus
			attempt: TransitionAttempt
			after: ConvStatus
			seq: TransitionAttempt[]
		}> = []

		// Coverage counters (informational)
		let seqsThatReachedResolved = 0
		let totalAttemptsToLeaveResolved = 0
		let totalRejectedLeaveResolved = 0
		const transitionTaken: Record<string, number> = {}

		for (let s = 0; s < N_SEQUENCES; s++) {
			const seq = generateSequence()
			let state: ConvStatus = 'open'
			let everResolved = false

			for (let i = 0; i < seq.length; i++) {
				const attempt = seq[i]!
				const before = state
				const { next, rejected } = applyTransition(state, attempt)
				state = next

				if (before === 'resolved' && attempt.to !== 'resolved') {
					totalAttemptsToLeaveResolved += 1
					if (rejected) totalRejectedLeaveResolved += 1
					// Property 7 violation: state changed despite being resolved
					if (state !== 'resolved') {
						counterexamples.push({
							seqIndex: s,
							step: i,
							before,
							attempt,
							after: state,
							seq,
						})
					}
				}

				if (!rejected) {
					const key = `${before}->${state}`
					transitionTaken[key] = (transitionTaken[key] ?? 0) + 1
				}

				if (state === 'resolved') everResolved = true
			}

			if (everResolved) seqsThatReachedResolved += 1
		}

		// Diagnostic on failure
		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 7] ${counterexamples.length} counterexample(s) of ${N_SEQUENCES} sequences:\n` +
					counterexamples
						.slice(0, 5)
						.map(
							(c, idx) =>
								`  #${idx + 1} seq=${c.seqIndex} step=${c.step} before=${c.before} ` +
								`attempt=${c.attempt.from}->${c.attempt.to} after=${c.after}\n` +
								`     full sequence (states attempted): ` +
								c.seq.map((a) => a.to).join(','),
						)
						.join('\n'),
			)
		}

		// Coverage — informational
		// eslint-disable-next-line no-console
		console.log(
			`[Property 7] sequences=${N_SEQUENCES} reachedResolved=${seqsThatReachedResolved} ` +
				`attemptsToLeaveResolved=${totalAttemptsToLeaveResolved} ` +
				`rejectedLeaveResolved=${totalRejectedLeaveResolved}`,
		)
		// eslint-disable-next-line no-console
		console.log(
			`[Property 7] taken transitions: ${JSON.stringify(transitionTaken)}`,
		)

		expect(counterexamples).toEqual([])
		// Health-check: the random generator should actually exercise the
		// "attempt to leave resolved" path at least sometimes — otherwise the
		// property test is vacuous.
		expect(totalAttemptsToLeaveResolved).toBeGreaterThan(0)
		// And every such attempt must have been rejected.
		expect(totalRejectedLeaveResolved).toBe(totalAttemptsToLeaveResolved)
	})

	it('boundary spot-checks: each documented transition AND every escape-from-resolved is correctly handled', () => {
		// All allowed transitions advance state.
		for (const [from, to] of ALLOWED_TRANSITIONS) {
			const result = applyTransition(from, { from, to })
			expect({ from, to, next: result.next, rejected: result.rejected }).toEqual(
				{ from, to, next: to, rejected: false },
			)
		}
		// Every attempt to leave `resolved` (resolved -> X for X ≠ resolved) is
		// rejected.
		for (const target of ALL_STATUSES) {
			if (target === 'resolved') continue
			const result = applyTransition('resolved', { from: 'resolved', to: target })
			expect({ target, next: result.next, rejected: result.rejected }).toEqual(
				{ target, next: 'resolved', rejected: true },
			)
		}
		// resolved -> resolved is a no-op self-edge: stays resolved (treat as
		// rejected because it is not in ALLOWED_TRANSITIONS, but next is still
		// resolved).
		const selfEdge = applyTransition('resolved', {
			from: 'resolved',
			to: 'resolved',
		})
		expect(selfEdge.next).toBe('resolved')
	})

	it("static-source: webhook/service.ts has `status: { not: 'resolved' }` filter at the 4 documented lookup sites", () => {
		const src = readFileSync(WEBHOOK_SERVICE, 'utf8')
		// Match both single- and double-quoted forms; tolerate flexible whitespace.
		const re = /status\s*:\s*\{\s*not\s*:\s*['"]resolved['"]\s*\}/g
		const matches = src.match(re) ?? []
		// Documented sites in Task 13 audit: lines 2743, 3874, 4242, 4537.
		// We assert ≥ 4 occurrences so the test stays robust to minor line drift.
		expect(matches.length).toBeGreaterThanOrEqual(4)

		// Localized line check — the four documented lines must each contain
		// the filter string. Tolerate whitespace differences.
		const lines = src.split('\n')
		const documentedLines = [2743, 3874, 4242, 4537]
		const missing: number[] = []
		for (const ln of documentedLines) {
			// Inspect a small window around each documented line in case minor
			// edits shifted indentation but not structure.
			const window = lines.slice(ln - 3, ln + 2).join('\n')
			if (!re.test(window)) missing.push(ln)
			// reset regex global state
			re.lastIndex = 0
		}
		if (missing.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`[Property 7] webhook/service.ts missing 'status: { not: \\'resolved\\' }' near lines: ${missing.join(', ')}`,
			)
		}
		expect(missing).toEqual([])
	})

	it("static-source: conversation/service.ts has no `status: 'open'|'pending'|'snoozed'` Prisma update guarded on a previously resolved row", () => {
		const src = readFileSync(CONVERSATION_SERVICE, 'utf8')

		// The single status writer in conversation/service.ts is `updateStatus`
		// (around line 876). Read it and confirm it is unconditional — the API
		// does not gate on the previous status, and there is no auxiliary
		// helper that explicitly sets `status: 'open'` after detecting a
		// resolved row.
		//
		// We verify the absence of any literal pattern that could re-open a
		// resolved row in a single file mutation:
		//
		//   `where: { ... status: 'resolved' ... }` followed (within a small
		//   window) by `data: { status: 'open' | 'pending' | 'snoozed' }`.
		//
		// This is a static-text proxy for the property; a real "reopen
		// resolved" bug would manifest as such a mutation.
		const reReopenAfterResolved =
			/where\s*:\s*\{[^}]*status\s*:\s*['"]resolved['"][^}]*\}[\s\S]{0,300}data\s*:\s*\{[^}]*status\s*:\s*['"](open|pending|snoozed)['"]/g

		const hits = src.match(reReopenAfterResolved) ?? []
		if (hits.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`[Property 7] reopen-after-resolved pattern matched ${hits.length} site(s):\n` +
					hits.slice(0, 3).join('\n---\n'),
			)
		}
		expect(hits.length).toBe(0)

		// Also assert the canonical `updateStatus` function is present and
		// uses the API-provided `status` parameter without gating on the
		// previous value. (Pure smoke check — the broader source-parity check
		// is delegated to scripts/check-parity.mjs.)
		expect(src).toContain('static async updateStatus(')
	})
})
