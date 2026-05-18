/**
 * Property-Based Test — Property 9: Plugin order invariance
 *
 * **Validates: Requirements 12.1 (via Property 9 — design.md "Correctness Properties")**
 *
 * Property 9 statement (design.md):
 *   "Elysia plugin order di `apps/backend/src/index.ts` selalu
 *    `cors → betterAuth → openapi → socket → appContext → routes`.
 *    Reorder = bug."
 *
 * Acceptance criterion 12.1 (requirements.md):
 *   "THE backend `src/index.ts` SHALL mengikuti plugin order:
 *    `cors({ credentials: true })` → `betterAuthPlugin` → `openapiPlugin`
 *    → `socketPlugin` (when `IS_API_MODE`) → `appContext` → `/health`
 *    → `.group('/api', ...)` → `.group('/api/v1', ...)`."
 *
 * Approach: parse `apps/backend/src/index.ts` as text and extract the
 * chain of TOP-LEVEL `.use(...)` calls between `new Elysia()` and the
 * first `.group(` (so that nested `.use()` inside route groups are
 * ignored). For each top-level `.use(...)` argument, extract the plugin
 * name:
 *
 *   - `cors({ ... })`               → `cors` (function-call form)
 *   - `betterAuthPlugin`            → `betterAuthPlugin` (bare identifier)
 *   - `openapiPlugin`               → `openapiPlugin`
 *   - `IS_API_MODE ? socketPlugin   → `socketPlugin` (ternary consequent)
 *      : (app) => app`
 *   - `appContext`                  → `appContext`
 *
 * The expected order is exactly:
 *   ['cors', 'betterAuthPlugin', 'openapiPlugin', 'socketPlugin', 'appContext']
 *
 * The check is mostly deterministic (single source file, single state),
 * but a property loop seeded with Mulberry32 is included to verify that
 * the extractor is invariant under random non-significant whitespace
 * insertions. Seed defaults to `0xC0FFEE` (overridable via
 * `OPENCRM_PROP_SEED`); iteration count via `OPENCRM_PROP_COUNT`
 * (default 120). NO new npm dependency is added (parity rule).
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

const BACKEND_INDEX = resolvePath(APP_ROOT, 'apps/backend/src/index.ts')

// ---------- deterministic PRNG (Mulberry32) — mirrors P1/P4/P5/P6/P7/P8 ----------

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

// ---------- expected plugin order (per design.md §10 Property 9 + req 12.1) ----------

const EXPECTED_ORDER: readonly string[] = [
	'cors',
	'betterAuthPlugin',
	'openapiPlugin',
	'socketPlugin',
	'appContext',
] as const

// ---------- chain extractor ----------

/**
 * Strip line and block comments from a TypeScript source slice. Used so
 * that comments like `// Plugins` between `.use(...)` calls do not
 * confuse the paren-balanced walker.
 */
function stripComments(src: string): string {
	let out = ''
	let i = 0
	const n = src.length
	let inSingle = false
	let inDouble = false
	let inBacktick = false
	let inLine = false
	let inBlock = false
	while (i < n) {
		const c = src[i]!
		const c2 = src[i + 1] ?? ''
		if (inLine) {
			if (c === '\n') {
				inLine = false
				out += c
			}
			i++
			continue
		}
		if (inBlock) {
			if (c === '*' && c2 === '/') {
				inBlock = false
				i += 2
				continue
			}
			i++
			continue
		}
		if (inSingle) {
			out += c
			if (c === '\\' && i + 1 < n) {
				out += c2
				i += 2
				continue
			}
			if (c === "'") inSingle = false
			i++
			continue
		}
		if (inDouble) {
			out += c
			if (c === '\\' && i + 1 < n) {
				out += c2
				i += 2
				continue
			}
			if (c === '"') inDouble = false
			i++
			continue
		}
		if (inBacktick) {
			out += c
			if (c === '\\' && i + 1 < n) {
				out += c2
				i += 2
				continue
			}
			if (c === '`') inBacktick = false
			i++
			continue
		}
		// not in any string/comment
		if (c === '/' && c2 === '/') {
			inLine = true
			i += 2
			continue
		}
		if (c === '/' && c2 === '*') {
			inBlock = true
			i += 2
			continue
		}
		if (c === "'") {
			inSingle = true
			out += c
			i++
			continue
		}
		if (c === '"') {
			inDouble = true
			out += c
			i++
			continue
		}
		if (c === '`') {
			inBacktick = true
			out += c
			i++
			continue
		}
		out += c
		i++
	}
	return out
}

/**
 * Find the index of the substring `needle` in `hay` only when it occurs
 * at depth 0 with respect to (), [], {} balances and not inside a string
 * literal. Returns -1 if not found.
 *
 * Uses cleaned (comment-stripped) source. Does NOT re-track comments
 * because we feed it `stripComments(src)`.
 */
function findAtDepth0(hay: string, startFrom: number, needle: string): number {
	let depthRound = 0
	let depthSquare = 0
	let depthCurly = 0
	let inSingle = false
	let inDouble = false
	let inBacktick = false
	for (let i = startFrom; i < hay.length; i++) {
		const c = hay[i]!
		const prev = i > 0 ? hay[i - 1] : ''
		if (inSingle) {
			if (c === "'" && prev !== '\\') inSingle = false
			continue
		}
		if (inDouble) {
			if (c === '"' && prev !== '\\') inDouble = false
			continue
		}
		if (inBacktick) {
			if (c === '`' && prev !== '\\') inBacktick = false
			continue
		}
		if (c === "'") {
			inSingle = true
			continue
		}
		if (c === '"') {
			inDouble = true
			continue
		}
		if (c === '`') {
			inBacktick = true
			continue
		}
		if (c === '(') depthRound++
		else if (c === ')') depthRound--
		else if (c === '[') depthSquare++
		else if (c === ']') depthSquare--
		else if (c === '{') depthCurly++
		else if (c === '}') depthCurly--

		if (
			depthRound === 0 &&
			depthSquare === 0 &&
			depthCurly === 0 &&
			hay.startsWith(needle, i)
		) {
			return i
		}
	}
	return -1
}

interface UseCall {
	startIndex: number // index of '.' in `.use(`
	argSrc: string
	pluginName: string
}

/**
 * Walk the chain region (text after `new Elysia()` and before the first
 * top-level `.group(`) and collect every TOP-LEVEL `.use(...)` call with
 * its argument expression.
 *
 * "Top-level" here means depth = 0 with respect to (), [], {} —
 * `.use(...)` calls inside `.group('/api', (app) => app.use(...))` are
 * automatically excluded because they live inside a parenthesised
 * `.group(...)` expression that comes after the chain region.
 */
function collectTopLevelUseCalls(chainText: string): UseCall[] {
	const out: UseCall[] = []
	const n = chainText.length
	let depthRound = 0
	let depthSquare = 0
	let depthCurly = 0
	let inSingle = false
	let inDouble = false
	let inBacktick = false

	for (let i = 0; i < n; i++) {
		const c = chainText[i]!
		const prev = i > 0 ? chainText[i - 1] : ''
		if (inSingle) {
			if (c === "'" && prev !== '\\') inSingle = false
			continue
		}
		if (inDouble) {
			if (c === '"' && prev !== '\\') inDouble = false
			continue
		}
		if (inBacktick) {
			if (c === '`' && prev !== '\\') inBacktick = false
			continue
		}
		if (c === "'") {
			inSingle = true
			continue
		}
		if (c === '"') {
			inDouble = true
			continue
		}
		if (c === '`') {
			inBacktick = true
			continue
		}

		// Detect `.use(` only at top level (depth 0)
		if (
			depthRound === 0 &&
			depthSquare === 0 &&
			depthCurly === 0 &&
			c === '.' &&
			chainText.startsWith('use(', i + 1)
		) {
			// Match the parenthesised argument by paren balance
			const openIdx = i + 4 // position of '('
			let depth = 0
			let j = openIdx
			let inS = false
			let inD = false
			let inB = false
			for (; j < n; j++) {
				const cj = chainText[j]!
				const pj = j > 0 ? chainText[j - 1] : ''
				if (inS) {
					if (cj === "'" && pj !== '\\') inS = false
					continue
				}
				if (inD) {
					if (cj === '"' && pj !== '\\') inD = false
					continue
				}
				if (inB) {
					if (cj === '`' && pj !== '\\') inB = false
					continue
				}
				if (cj === "'") {
					inS = true
					continue
				}
				if (cj === '"') {
					inD = true
					continue
				}
				if (cj === '`') {
					inB = true
					continue
				}
				if (cj === '(') depth++
				else if (cj === ')') {
					depth--
					if (depth === 0) {
						break
					}
				}
			}
			if (j >= n) {
				throw new Error(
					`Unbalanced .use( parentheses starting at offset ${openIdx}`,
				)
			}
			const argSrc = chainText.slice(openIdx + 1, j)
			const pluginName = extractPluginName(argSrc)
			out.push({ startIndex: i, argSrc, pluginName })
			i = j // continue after the closing ')'
			continue
		}

		// Track depth using brackets OUTSIDE the .use match logic
		if (c === '(') depthRound++
		else if (c === ')') depthRound--
		else if (c === '[') depthSquare++
		else if (c === ']') depthSquare--
		else if (c === '{') depthCurly++
		else if (c === '}') depthCurly--
	}

	return out
}

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/

/**
 * Extract the plugin name from a single `.use(...)` argument expression.
 *
 * Rules:
 *   1. Strip leading whitespace.
 *   2. If the expression contains a top-level `?` followed by a top-level
 *      `:`, treat it as a ternary; the plugin name is the FIRST IDENTIFIER
 *      inside the consequent (between `?` and `:`).
 *   3. Else the plugin name is the first identifier in the expression.
 *      (For `cors({ ... })`, that identifier is `cors`. For
 *      `betterAuthPlugin`, it is `betterAuthPlugin`.)
 */
function extractPluginName(argSrc: string): string {
	const trimmed = argSrc.trim()

	// Look for top-level `?` that starts a ternary. We must NOT confuse with
	// optional-chaining `?.` or nullish-coalescing `??`. A ternary `?` is
	// followed by something that is neither `?` nor `.`.
	const qIdx = findTopLevelTernary(trimmed)
	if (qIdx >= 0) {
		const cIdx = findTopLevelChar(trimmed, qIdx + 1, ':')
		if (cIdx > qIdx) {
			const consequent = trimmed.slice(qIdx + 1, cIdx)
			const m = consequent.match(IDENT_RE)
			if (m) return m[0]
		}
	}

	// Default: first identifier
	const m = trimmed.match(IDENT_RE)
	if (!m) {
		throw new Error(
			`Could not extract plugin name from .use() argument: ${trimmed.slice(0, 60)}...`,
		)
	}
	return m[0]
}

/**
 * Find the index of a top-level ternary `?` (depth-0 wrt (),[],{}, not
 * `??`, not `?.`, not inside a string). Returns -1 if none.
 */
function findTopLevelTernary(s: string): number {
	let depthRound = 0
	let depthSquare = 0
	let depthCurly = 0
	let inSingle = false
	let inDouble = false
	let inBacktick = false
	for (let i = 0; i < s.length; i++) {
		const c = s[i]!
		const prev = i > 0 ? s[i - 1] : ''
		if (inSingle) {
			if (c === "'" && prev !== '\\') inSingle = false
			continue
		}
		if (inDouble) {
			if (c === '"' && prev !== '\\') inDouble = false
			continue
		}
		if (inBacktick) {
			if (c === '`' && prev !== '\\') inBacktick = false
			continue
		}
		if (c === "'") {
			inSingle = true
			continue
		}
		if (c === '"') {
			inDouble = true
			continue
		}
		if (c === '`') {
			inBacktick = true
			continue
		}
		if (c === '(') depthRound++
		else if (c === ')') depthRound--
		else if (c === '[') depthSquare++
		else if (c === ']') depthSquare--
		else if (c === '{') depthCurly++
		else if (c === '}') depthCurly--

		if (
			c === '?' &&
			depthRound === 0 &&
			depthSquare === 0 &&
			depthCurly === 0
		) {
			const next = s[i + 1] ?? ''
			if (next === '?' || next === '.') continue // ?? or ?.
			return i
		}
	}
	return -1
}

/**
 * Find the index of `target` at depth 0 with respect to brackets and
 * not inside a string, scanning from `start`. Returns -1 if none.
 */
function findTopLevelChar(s: string, start: number, target: string): number {
	let depthRound = 0
	let depthSquare = 0
	let depthCurly = 0
	let inSingle = false
	let inDouble = false
	let inBacktick = false
	for (let i = start; i < s.length; i++) {
		const c = s[i]!
		const prev = i > 0 ? s[i - 1] : ''
		if (inSingle) {
			if (c === "'" && prev !== '\\') inSingle = false
			continue
		}
		if (inDouble) {
			if (c === '"' && prev !== '\\') inDouble = false
			continue
		}
		if (inBacktick) {
			if (c === '`' && prev !== '\\') inBacktick = false
			continue
		}
		if (c === "'") {
			inSingle = true
			continue
		}
		if (c === '"') {
			inDouble = true
			continue
		}
		if (c === '`') {
			inBacktick = true
			continue
		}
		if (c === '(') depthRound++
		else if (c === ')') depthRound--
		else if (c === '[') depthSquare++
		else if (c === ']') depthSquare--
		else if (c === '{') depthCurly++
		else if (c === '}') depthCurly--

		if (
			c === target &&
			depthRound === 0 &&
			depthSquare === 0 &&
			depthCurly === 0
		) {
			return i
		}
	}
	return -1
}

/**
 * Extract the top-level chain region from index.ts source: everything
 * between `new Elysia()` and the first top-level `.group('/api'`.
 */
function extractChainRegion(srcRaw: string): {
	chainText: string
	startOffset: number
	endOffset: number
} {
	const src = stripComments(srcRaw)
	const elysiaIdx = src.indexOf('new Elysia()')
	if (elysiaIdx < 0) {
		throw new Error(`'new Elysia()' not found in source`)
	}
	const after = elysiaIdx + 'new Elysia()'.length
	const groupIdx = findAtDepth0(src, after, ".group('/api'")
	if (groupIdx < 0) {
		throw new Error(
			`Top-level ".group('/api'" not found after new Elysia() — chain region cannot be delimited`,
		)
	}
	return {
		chainText: src.slice(after, groupIdx),
		startOffset: after,
		endOffset: groupIdx,
	}
}

function extractPluginOrder(srcRaw: string): string[] {
	const region = extractChainRegion(srcRaw)
	const calls = collectTopLevelUseCalls(region.chainText)
	return calls.map((c) => c.pluginName)
}

// ---------- the property tests ----------

const N_PROPERTIES = Number(process.env.OPENCRM_PROP_COUNT ?? 120)

describe('Property 9 — Plugin order invariance', () => {
	it('apps/backend/src/index.ts exists & is readable', () => {
		expect(existsSync(BACKEND_INDEX)).toBe(true)
	})

	it('extracts the documented chain region between new Elysia() and the first top-level .group("/api")', () => {
		const src = readFileSync(BACKEND_INDEX, 'utf8')
		const region = extractChainRegion(src)
		// The chain region must not be empty and must contain at least 5 .use(
		// occurrences (sanity).
		const useCount = (region.chainText.match(/\.use\(/g) ?? []).length
		expect(region.chainText.length).toBeGreaterThan(0)
		expect(useCount).toBeGreaterThanOrEqual(5)
	})

	it("plugin order in apps/backend/src/index.ts is exactly ['cors', 'betterAuthPlugin', 'openapiPlugin', 'socketPlugin', 'appContext']", () => {
		const src = readFileSync(BACKEND_INDEX, 'utf8')
		const order = extractPluginOrder(src)
		// eslint-disable-next-line no-console
		console.log(
			`[Property 9] extracted plugin order = ${JSON.stringify(order)}\n` +
				`[Property 9] expected plugin order  = ${JSON.stringify(EXPECTED_ORDER)}`,
		)
		expect(order).toEqual([...EXPECTED_ORDER])
	})

	it('boundary spot-checks: each expected plugin appears at the expected position with no duplicates', () => {
		const src = readFileSync(BACKEND_INDEX, 'utf8')
		const order = extractPluginOrder(src)
		expect(order.length).toBe(EXPECTED_ORDER.length)
		for (let i = 0; i < EXPECTED_ORDER.length; i++) {
			expect(order[i]).toBe(EXPECTED_ORDER[i]!)
		}
		// No duplicates
		expect(new Set(order).size).toBe(order.length)
	})

	it("static-source: the conditional .use() argument is exactly `IS_API_MODE ? socketPlugin : (app) => app`", () => {
		const src = readFileSync(BACKEND_INDEX, 'utf8')
		const region = extractChainRegion(src)
		const calls = collectTopLevelUseCalls(region.chainText)
		// position 3 (0-indexed) is the socketPlugin slot
		expect(calls.length).toBe(EXPECTED_ORDER.length)
		const socketCall = calls[3]!
		expect(socketCall.pluginName).toBe('socketPlugin')
		// The argument MUST be a ternary on IS_API_MODE
		const arg = socketCall.argSrc.replace(/\s+/g, ' ').trim()
		expect(arg).toContain('IS_API_MODE')
		expect(arg).toContain('socketPlugin')
		expect(arg).toContain('?')
		expect(arg).toContain(':')
	})

	it("static-source: cors is invoked as a function call with `credentials: true` (req 12.1)", () => {
		const src = readFileSync(BACKEND_INDEX, 'utf8')
		const region = extractChainRegion(src)
		const calls = collectTopLevelUseCalls(region.chainText)
		const corsCall = calls[0]!
		expect(corsCall.pluginName).toBe('cors')
		// Must be the function-call form, not a bare identifier
		expect(corsCall.argSrc.trim().startsWith('cors(')).toBe(true)
		// Must enable credentials
		expect(corsCall.argSrc).toMatch(/credentials\s*:\s*true/)
	})

	it(`property: extractor is invariant under ${N_PROPERTIES} random non-significant whitespace permutations of the chain region (seed 0x${SEED.toString(16)})`, () => {
		const src = readFileSync(BACKEND_INDEX, 'utf8')
		const baseline = extractPluginOrder(src)

		const rng = makeRng(SEED)
		const counterexamples: Array<{ iter: number; got: string[]; mutationDesc: string }> = []
		let totalMutations = 0
		const mutationKindCounts: Record<string, number> = {
			extraNewline: 0,
			extraSpaces: 0,
			extraTabIndent: 0,
			windowsNewline: 0,
		}

		for (let iter = 0; iter < N_PROPERTIES; iter++) {
			// Apply a random whitespace mutation to the chain text only — never
			// touch character semantics. We splice a random number of safe
			// whitespace insertions at random locations between non-string,
			// non-comment characters. Specifically: insert before a
			// `\n.use(` or `\n\t.use(` location.
			const useStarts: number[] = []
			const re = /\n\s*\.use\(/g
			let m: RegExpExecArray | null
			while ((m = re.exec(src))) {
				useStarts.push(m.index)
			}
			expect(useStarts.length).toBeGreaterThan(0)

			const target = useStarts[Math.floor(rng() * useStarts.length)]!
			const kind = rng()
			let insertion = ''
			let mutationKind = ''
			if (kind < 0.25) {
				insertion = '\n'
				mutationKind = 'extraNewline'
			} else if (kind < 0.5) {
				insertion = '   '
				mutationKind = 'extraSpaces'
			} else if (kind < 0.75) {
				insertion = '\n\t\t'
				mutationKind = 'extraTabIndent'
			} else {
				insertion = '\r\n'
				mutationKind = 'windowsNewline'
			}
			mutationKindCounts[mutationKind]! += 1
			totalMutations++

			const mutatedSrc =
				src.slice(0, target) + insertion + src.slice(target)
			const order = extractPluginOrder(mutatedSrc)

			if (
				order.length !== baseline.length ||
				order.some((p, i) => p !== baseline[i])
			) {
				counterexamples.push({
					iter,
					got: order,
					mutationDesc: `${mutationKind} at offset ${target}`,
				})
			}
		}

		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`[Property 9] ${counterexamples.length} extractor counterexample(s):\n` +
					counterexamples
						.slice(0, 5)
						.map(
							(c, idx) =>
								`  #${idx + 1} iter=${c.iter} mutation=${c.mutationDesc}\n` +
								`     got=${JSON.stringify(c.got)}\n` +
								`     expected=${JSON.stringify(baseline)}`,
						)
						.join('\n'),
			)
		}

		// eslint-disable-next-line no-console
		console.log(
			`[Property 9] property iters=${N_PROPERTIES} mutations=${totalMutations} ` +
				`kinds=${JSON.stringify(mutationKindCounts)} counterexamples=${counterexamples.length}`,
		)

		expect(counterexamples).toEqual([])
		// And the baseline itself must equal the expected order.
		expect(baseline).toEqual([...EXPECTED_ORDER])
	})

	it('extractor self-check: synthetic ternary with `IS_API_MODE ? socketPlugin : (app) => app` resolves to `socketPlugin`', () => {
		// Mini-fixture validates the ternary handling rule used for the
		// real socket slot; if this ever breaks, the main assertion would
		// be misleading. No source file is touched.
		const synthetic = `
import { Elysia } from 'elysia'
const IS_API_MODE = true
export const app = new Elysia()
	.use(cors({ credentials: true, methods: ['GET'] }))
	.use(betterAuthPlugin)
	.use(openapiPlugin)
	.use(IS_API_MODE ? socketPlugin : (app) => app)
	.use(appContext)
	.get('/health', () => ({ ok: true }))
	.group('/api', (app) => app.use(authModule).use(userModule))
`
		const order = extractPluginOrder(synthetic)
		expect(order).toEqual([...EXPECTED_ORDER])
	})
})
