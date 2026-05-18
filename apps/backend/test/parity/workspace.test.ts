/**
 * Property-Based Test — Property 1: Workspace Separation
 *
 * **Validates: Requirements 1.1, 1.2, 1.3 (Property 1 — design.md "Correctness Properties")**
 *
 * Property 1 statement (design.md):
 *   "Untuk semua operasi tulis file `f`, `f` harus berada di bawah $OPENCRM_APP.
 *    Pelanggaran = bug."
 *
 * System under test:
 *   `$OPENCRM_APP/scripts/spec/check-write-path.sh <path>` — the canonical
 *   write-path guardrail. It is the only gate that enforces the workspace
 *   separation rule for the spec workflow, so its behaviour is what Property 1
 *   actually constrains.
 *
 * Property (formalised):
 *   For every input path `p`,
 *     check-write-path.sh exits 0   iff   realpath -m p starts with $OPENCRM_APP/
 *                                          (or equals $OPENCRM_APP exactly)
 *     check-write-path.sh exits 1   iff   that prefix relation does NOT hold.
 *
 * Generator:
 *   We mix six families of randomly generated paths so the test exercises the
 *   real input space of the guardrail — not just trivially-inside or trivially-
 *   outside paths.
 *
 *     1. plain inside   — direct descendants of $OPENCRM_APP
 *     2. nested inside  — multi-segment descendants under $OPENCRM_APP
 *     3. parent-escape  — paths under $OPENCRM_APP that contain `../../...`
 *                         and resolve OUTSIDE $OPENCRM_APP
 *     4. /tmp paths     — clearly outside, may or may not exist
 *     5. builder-class  — paths under $OPENCRM_BUILDER_CLASS (read-only sibling)
 *     6. random parent  — paths under random parent dirs of $OPENCRM_APP
 *                         (e.g. /home/ubuntu/.openclaw/workspace/...)
 *
 * Random generation uses a deterministic Mulberry32 PRNG seeded from the
 * env var `OPENCRM_PROP_SEED` (default 0xC0FFEE) so failing runs are
 * reproducible. NO new npm dependency is added (parity rule).
 *
 * Test runner: `bun test` (matches apps/backend/test/* convention).
 */

import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

// ---------- locate $OPENCRM_APP and the SUT ----------

const OPENCRM_APP =
	process.env.OPENCRM_APP ?? '/home/ubuntu/.openclaw/workspace/opencrm-app'

// Canonicalize APP root (handles symlinks). The guardrail itself uses
// `realpath -m`, so we mirror that here.
const APP_ROOT = existsSync(OPENCRM_APP)
	? realpathSync(OPENCRM_APP).replace(/\/+$/, '')
	: resolvePath(OPENCRM_APP).replace(/\/+$/, '')

const BUILDER_CLASS =
	process.env.OPENCRM_BUILDER_CLASS ??
	'/home/ubuntu/.openclaw/workspace/skills/opencrm-builder-class/opencrm-builder-class'

const SCRIPT = resolvePath(APP_ROOT, 'scripts/spec/check-write-path.sh')

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

function randSegment(): string {
	const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789-_.'
	const len = 1 + Math.floor(rng() * 12)
	let out = ''
	for (let i = 0; i < len; i++) out += alpha[Math.floor(rng() * alpha.length)]
	// avoid empty / dot-only segments which realpath -m would collapse oddly
	if (out === '' || out === '.' || out === '..') return 'a'
	return out
}

function randSegments(min: number, max: number): string[] {
	const n = min + Math.floor(rng() * (max - min + 1))
	const out: string[] = []
	for (let i = 0; i < n; i++) out.push(randSegment())
	return out
}

// ---------- path generators (six families) ----------

type GenKind =
	| 'inside-direct'
	| 'inside-nested'
	| 'parent-escape'
	| 'tmp'
	| 'builder-class'
	| 'random-parent'

interface GenPath {
	raw: string
	kind: GenKind
}

function genInsideDirect(): GenPath {
	return { raw: `${APP_ROOT}/${randSegment()}`, kind: 'inside-direct' }
}

function genInsideNested(): GenPath {
	const segs = randSegments(2, 6).join('/')
	return { raw: `${APP_ROOT}/${segs}`, kind: 'inside-nested' }
}

function genParentEscape(): GenPath {
	// Start inside APP_ROOT, then escape with N `..` followed by extra segments.
	// realpath -m collapses `..` so the result will live OUTSIDE APP_ROOT.
	const insideSegs = randSegments(1, 3).join('/')
	const escapes = 4 + Math.floor(rng() * 6) // 4..9 escapes — guaranteed to leave APP_ROOT
	const escapePart = Array(escapes).fill('..').join('/')
	const tailSegs = randSegments(1, 3).join('/')
	return {
		raw: `${APP_ROOT}/${insideSegs}/${escapePart}/${tailSegs}`,
		kind: 'parent-escape',
	}
}

function genTmp(): GenPath {
	const segs = randSegments(1, 4).join('/')
	return { raw: `/tmp/${segs}`, kind: 'tmp' }
}

function genBuilderClass(): GenPath {
	const segs = randSegments(1, 4).join('/')
	return { raw: `${BUILDER_CLASS}/${segs}`, kind: 'builder-class' }
}

function genRandomParent(): GenPath {
	const parents = [
		'/home/ubuntu/.openclaw/workspace',
		'/home/ubuntu/.openclaw',
		'/home/ubuntu',
		'/var/log',
		'/etc',
		'/opt/somewhere',
		'/srv/data',
		'/usr/local/lib',
	]
	const base = pick(parents)
	const segs = randSegments(1, 4).join('/')
	return { raw: `${base}/${segs}`, kind: 'random-parent' }
}

const generators: Array<() => GenPath> = [
	genInsideDirect,
	genInsideDirect,
	genInsideNested,
	genInsideNested,
	genParentEscape,
	genParentEscape,
	genTmp,
	genBuilderClass,
	genRandomParent,
	genRandomParent,
]

function generateOne(): GenPath {
	return pick(generators)()
}

// ---------- oracle: the canonical truth Property 1 demands ----------

function canonicalize(p: string): string {
	// Mirror `realpath -m`: resolve symlinks where possible, but tolerate
	// non-existent paths. Node's `path.resolve` collapses `..`/`.` segments,
	// which is exactly what realpath -m does for non-existent paths.
	return resolvePath(p).replace(/\/+$/, '')
}

function isInsideAppRoot(p: string): boolean {
	const canon = canonicalize(p)
	return canon === APP_ROOT || canon.startsWith(`${APP_ROOT}/`)
}

// ---------- run the SUT ----------

interface RunResult {
	exit: number
	stderr: string
}

function runGuardrail(path: string): RunResult {
	const r = spawnSync('bash', [SCRIPT, path], {
		env: {
			...process.env,
			OPENCRM_APP,
			OPENCRM_BUILDER_CLASS: BUILDER_CLASS,
		},
		encoding: 'utf8',
	})
	return {
		exit: r.status ?? -1,
		stderr: r.stderr ?? '',
	}
}

// ---------- the property test ----------

const N_PROPERTIES = Number(process.env.OPENCRM_PROP_COUNT ?? 120)

describe('Property 1 — Workspace Separation (check-write-path.sh)', () => {
	it('SUT exists and is executable', () => {
		expect(existsSync(SCRIPT)).toBe(true)
	})

	it(`exit code matches realpath-prefix oracle for ${N_PROPERTIES} random paths`, () => {
		const counterexamples: Array<{
			input: string
			kind: GenKind
			canonical: string
			expectedInside: boolean
			actualExit: number
			stderr: string
		}> = []

		const kindCounts: Record<GenKind, number> = {
			'inside-direct': 0,
			'inside-nested': 0,
			'parent-escape': 0,
			tmp: 0,
			'builder-class': 0,
			'random-parent': 0,
		}

		for (let i = 0; i < N_PROPERTIES; i++) {
			const { raw, kind } = generateOne()
			kindCounts[kind] += 1

			const expectedInside = isInsideAppRoot(raw)
			const expectedExit = expectedInside ? 0 : 1

			const { exit, stderr } = runGuardrail(raw)

			if (exit !== expectedExit) {
				counterexamples.push({
					input: raw,
					kind,
					canonical: canonicalize(raw),
					expectedInside,
					actualExit: exit,
					stderr: stderr.slice(0, 500),
				})
			}
		}

		// Useful diagnostic when something goes wrong.
		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 1] ${counterexamples.length} counterexample(s) of ${N_PROPERTIES}:\n` +
					counterexamples
						.slice(0, 5)
						.map(
							(c, idx) =>
								`  #${idx + 1} [${c.kind}] input=${c.input}\n` +
								`     canonical=${c.canonical}\n` +
								`     expectedInside=${c.expectedInside} actualExit=${c.actualExit}\n` +
								`     stderr=${c.stderr.replace(/\n/g, ' | ')}`,
						)
						.join('\n'),
			)
			// eslint-disable-next-line no-console
			console.error(`\n[Property 1] Family distribution: ${JSON.stringify(kindCounts)}`)
		}

		expect(counterexamples).toEqual([])
	})

	// A few hand-picked spot checks make failures more localizable than the
	// purely random batch above. They also double as a smoke test that the
	// oracle and the SUT agree on canonical, well-known examples.
	it('spot-checks the boundary cases', () => {
		const cases: Array<{ p: string; expectInside: boolean; label: string }> = [
			{ p: APP_ROOT, expectInside: true, label: 'APP_ROOT itself' },
			{ p: `${APP_ROOT}/`, expectInside: true, label: 'APP_ROOT with trailing slash' },
			{ p: `${APP_ROOT}/apps/backend/test/parity/x.ts`, expectInside: true, label: 'deep inside' },
			{ p: `${APP_ROOT}/../foo`, expectInside: false, label: 'sibling of APP_ROOT' },
			{ p: `${APP_ROOT}/a/../../b`, expectInside: false, label: 'escape via ..' },
			{ p: `${APP_ROOT}/a/../b`, expectInside: true, label: 'self-cancel .. stays inside' },
			{ p: '/tmp/whatever', expectInside: false, label: '/tmp' },
			{ p: BUILDER_CLASS, expectInside: false, label: 'builder class root' },
			{ p: `${BUILDER_CLASS}/database/schema.sql`, expectInside: false, label: 'inside builder class' },
		]

		for (const { p, expectInside, label } of cases) {
			const { exit, stderr } = runGuardrail(p)
			const expected = expectInside ? 0 : 1
			expect({ label, exit, stderr: stderr.slice(0, 200) }).toEqual({
				label,
				exit: expected,
				stderr: stderr.slice(0, 200),
			})
		}
	})
})
