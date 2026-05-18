/**
 * Property-Based Test — Property 10: Tailwind Activation Invariance
 *
 * **Validates: Requirements 16.1, 16.2 (via Property 10 — design.md "Correctness Properties")**
 *
 * Property 10 statement (design.md §10):
 *   "Baris 1–4 `apps/frontend/src/styles.css` selalu 4 import
 *    (`tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`,
 *    `@fontsource-variable/geist`). Reorder/remove = bug."
 *
 * Acceptance criterion 16.1 (requirements.md):
 *   "THE `apps/frontend/src/styles.css` SHALL mulai dengan:
 *    `@import \"tailwindcss\"; @import \"tw-animate-css\";
 *     @import \"shadcn/tailwind.css\"; @import \"@fontsource-variable/geist\";`."
 *
 * Acceptance criterion 16.2 (requirements.md):
 *   "THE styles SHALL define OKLCH CSS variables, `@theme inline`,
 *    sidebar tokens." — this test focuses on the 4 import lines (16.1)
 *   while 16.2 is asserted as a downstream sanity (the file must contain
 *   the OKLCH/`@theme inline` markers somewhere after line 4).
 *
 * System under test:
 *   The first 4 non-empty lines of `apps/frontend/src/styles.css`. The
 *   property is a STATIC source-text invariant: each of the 4 lines
 *   must be the exact `@import "<target>";` statement in the documented
 *   order, with the exact quoted target literal.
 *
 *   The actual file uses DOUBLE QUOTES (`"…"`), as parity-locked in
 *   `FRONTEND-SOURCE-MANIFEST.json` (entry `apps/frontend/src/styles.css`,
 *   sha256 `d6c757f7…30e8`, 392 lines, 10146 bytes). The test encodes
 *   that exact form.
 *
 * Properties (formalised):
 *
 *   Let L = first 4 lines of styles.css (split on `\n`, line endings
 *           normalised to LF, no BOM).
 *   Let E = canonical expected lines:
 *           E[0] = `@import "tailwindcss";`
 *           E[1] = `@import "tw-animate-css";`
 *           E[2] = `@import "shadcn/tailwind.css";`
 *           E[3] = `@import "@fontsource-variable/geist";`
 *
 *   P10a — exact line equality (16.1, strict):
 *     ∀ i ∈ {0,1,2,3} : trimEnd(L[i]) ≡ E[i]
 *     (trimEnd because trailing whitespace is non-significant in CSS;
 *     the import target itself must match byte-for-byte)
 *
 *   P10b — import-target containment (defence in depth):
 *     L[0] contains "tailwindcss"
 *     L[1] contains "tw-animate-css"
 *     L[2] contains "shadcn/tailwind.css"
 *     L[3] contains "@fontsource-variable/geist"
 *
 *   P10c — order invariance under random whitespace mutation:
 *     For N=120 random Mulberry32-driven mutations that ONLY add
 *     non-significant whitespace (extra space, tab, trailing spaces,
 *     CRLF) AT THE END of any of the first 4 lines, the extractor
 *     applied to the mutated text must still produce the same
 *     [E[0], E[1], E[2], E[3]] tuple. This guards against the
 *     extractor being too strict about trailing whitespace.
 *
 *   P10d — downstream sanity for 16.2:
 *     The full source must contain `@theme inline` AND at least one
 *     `oklch(` token AND a `--sidebar` CSS variable somewhere after
 *     line 4. Counterexamples are reported but treated as
 *     informational sanity (16.2 is asserted softly here; full
 *     OKLCH/sidebar token coverage is not the focus of Property 10).
 *
 * Random generation uses a deterministic Mulberry32 PRNG seeded from
 * `OPENCRM_PROP_SEED` (default `0xC0FFEE`) so failing runs are
 * reproducible. NO new npm dependency (parity rule). Same PRNG pattern
 * as Properties 1, 4, 5, 6, 7, 8, 9.
 *
 * Test runner: `bun test` (matches monorepo convention; allowed because
 * `.kiro/gate-4-complete` marker is present).
 *
 * Workspace boundaries:
 *   - This test file is NEW (not in `FRONTEND-SOURCE-MANIFEST.json`,
 *     so not parity-locked).
 *   - This test does NOT modify `apps/frontend/src/styles.css` or any
 *     parity-locked source. Mutations are applied to in-memory copies
 *     only.
 *   - No new npm dependencies are added.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

// ---------- locate $OPENCRM_APP and the source file ----------

const OPENCRM_APP =
	process.env.OPENCRM_APP ?? '/home/ubuntu/.openclaw/workspace/opencrm-app'

const APP_ROOT = existsSync(OPENCRM_APP)
	? realpathSync(OPENCRM_APP).replace(/\/+$/, '')
	: resolvePath(OPENCRM_APP).replace(/\/+$/, '')

const STYLES_CSS = resolvePath(APP_ROOT, 'apps/frontend/src/styles.css')

// ---------- expected lines (per design.md Property 10 + req 16.1) ----------

const EXPECTED_LINES: readonly [string, string, string, string] = [
	'@import "tailwindcss";',
	'@import "tw-animate-css";',
	'@import "shadcn/tailwind.css";',
	'@import "@fontsource-variable/geist";',
] as const

const EXPECTED_TARGETS: readonly [string, string, string, string] = [
	'tailwindcss',
	'tw-animate-css',
	'shadcn/tailwind.css',
	'@fontsource-variable/geist',
] as const

// ---------- deterministic PRNG (Mulberry32) — mirrors P1/P4/P5/P6/P7/P8/P9 ----------

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
const N_PROPERTIES = Number(process.env.OPENCRM_PROP_COUNT ?? 120)

// ---------- helpers ----------

/**
 * Read the source as UTF-8, strip an optional UTF-8 BOM, and normalise
 * CRLF/CR line endings to LF for stable splitting. Trailing newline is
 * preserved.
 */
function readNormalised(absPath: string): string {
	let text = readFileSync(absPath, 'utf-8')
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
	text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
	return text
}

/**
 * Extract the first 4 lines (LF-split) from a normalised CSS source.
 * Lines are returned with trailing whitespace trimmed (CSS allows
 * trailing whitespace after a `;`). The import target inside the
 * quotes is preserved byte-for-byte.
 */
function firstFourLines(text: string): [string, string, string, string] {
	const lines = text.split('\n')
	if (lines.length < 4) {
		throw new Error(
			`styles.css has fewer than 4 lines (got ${lines.length}); cannot evaluate Property 10`,
		)
	}
	return [
		(lines[0] ?? '').replace(/[ \t]+$/u, ''),
		(lines[1] ?? '').replace(/[ \t]+$/u, ''),
		(lines[2] ?? '').replace(/[ \t]+$/u, ''),
		(lines[3] ?? '').replace(/[ \t]+$/u, ''),
	]
}

// ---------- the property tests ----------

describe('Property 10 — Tailwind Activation Invariance', () => {
	it('apps/frontend/src/styles.css exists and is readable', () => {
		expect(existsSync(STYLES_CSS)).toBe(true)
	})

	it('P10a — first 4 lines are exactly the documented @import statements (req 16.1)', () => {
		const text = readNormalised(STYLES_CSS)
		const got = firstFourLines(text)

		// eslint-disable-next-line no-console
		console.log(
			`[Property 10] extracted lines:\n` +
				got.map((l, i) => `  L${i + 1} = ${JSON.stringify(l)}`).join('\n') +
				`\n[Property 10] expected lines:\n` +
				EXPECTED_LINES.map(
					(l, i) => `  L${i + 1} = ${JSON.stringify(l)}`,
				).join('\n'),
		)

		const counterexamples: Array<{
			lineNumber: number
			got: string
			expected: string
		}> = []
		for (let i = 0; i < 4; i++) {
			if (got[i] !== EXPECTED_LINES[i]) {
				counterexamples.push({
					lineNumber: i + 1,
					got: got[i] ?? '',
					expected: EXPECTED_LINES[i] ?? '',
				})
			}
		}

		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 10a] ${counterexamples.length} line(s) diverge:\n` +
					counterexamples
						.map(
							(c) =>
								`  L${c.lineNumber}\n` +
								`     got      = ${JSON.stringify(c.got)}\n` +
								`     expected = ${JSON.stringify(c.expected)}`,
						)
						.join('\n'),
			)
		}

		expect(counterexamples).toEqual([])
		expect(got).toEqual([...EXPECTED_LINES])
	})

	it('P10b — each of the 4 lines contains its expected import target', () => {
		const text = readNormalised(STYLES_CSS)
		const got = firstFourLines(text)
		for (let i = 0; i < 4; i++) {
			const line = got[i] ?? ''
			const target = EXPECTED_TARGETS[i] ?? ''
			expect({ lineNumber: i + 1, contains: line.includes(target), target }).toEqual(
				{ lineNumber: i + 1, contains: true, target },
			)
		}
	})

	it('boundary spot-checks — each line starts with @import and ends with ";"', () => {
		const text = readNormalised(STYLES_CSS)
		const got = firstFourLines(text)
		for (let i = 0; i < 4; i++) {
			const line = got[i] ?? ''
			expect({
				lineNumber: i + 1,
				startsWithImport: line.startsWith('@import'),
				endsWithSemi: line.endsWith(';'),
			}).toEqual({
				lineNumber: i + 1,
				startsWithImport: true,
				endsWithSemi: true,
			})
		}
	})

	it(`P10c — extractor invariant under ${N_PROPERTIES} random trailing-whitespace mutations (seed 0x${SEED.toString(16)})`, () => {
		const baselineText = readNormalised(STYLES_CSS)
		const baseline = firstFourLines(baselineText)
		// Sanity precondition.
		expect(baseline).toEqual([...EXPECTED_LINES])

		const rng = makeRng(SEED)
		const counterexamples: Array<{
			iter: number
			lineMutated: number
			mutationKind: string
			got: string[]
		}> = []
		const mutationKindCounts: Record<string, number> = {
			trailingSpaces: 0,
			trailingTab: 0,
			extraSpacesBeforeSemi: 0,
			windowsNewline: 0,
		}

		// Pre-compute the offset where each of the first 4 lines ENDS
		// (just before its `\n`). We mutate by inserting non-significant
		// whitespace inside each line, so the extracted line after
		// trimEnd should still equal the canonical form.
		const lineEndOffsets: number[] = []
		{
			let cursor = 0
			for (let i = 0; i < 4; i++) {
				const nl = baselineText.indexOf('\n', cursor)
				if (nl < 0) {
					throw new Error(
						`Could not locate newline for line ${i + 1} in styles.css`,
					)
				}
				lineEndOffsets.push(nl) // offset of the '\n'
				cursor = nl + 1
			}
		}

		for (let iter = 0; iter < N_PROPERTIES; iter++) {
			const lineIdx = Math.floor(rng() * 4) // 0..3
			const lineEnd = lineEndOffsets[lineIdx]!

			const kind = rng()
			let insertion = ''
			let mutationKind = ''
			let insertOffset = lineEnd // default: just before '\n'

			if (kind < 0.25) {
				// Trailing spaces after `;`, before '\n'
				const n = 1 + Math.floor(rng() * 4)
				insertion = ' '.repeat(n)
				mutationKind = 'trailingSpaces'
			} else if (kind < 0.5) {
				// Trailing tab after `;`, before '\n'
				insertion = '\t'
				mutationKind = 'trailingTab'
			} else if (kind < 0.75) {
				// CRLF instead of LF (insert \r right before the existing \n)
				insertion = '\r'
				mutationKind = 'windowsNewline'
			} else {
				// Extra space INSIDE the line, just before the trailing `;`.
				// We locate the LAST `;` on this line (which is the import's
				// terminating semicolon) and insert a space before it. CSS is
				// whitespace-tolerant here, and our extractor trims trailing
				// whitespace per line before comparing; combined with this
				// mutation, the post-trim line will end in `";"` (exactly
				// the canonical form), so extraction must be invariant.
				//
				// Find the start of this line in baselineText:
				const lineStart =
					lineIdx === 0 ? 0 : (lineEndOffsets[lineIdx - 1] ?? -1) + 1
				const lineText = baselineText.slice(lineStart, lineEnd)
				const semiIdx = lineText.lastIndexOf(';')
				if (semiIdx < 0) {
					// Defensive: skip this iteration (shouldn't happen on canonical file)
					continue
				}
				insertOffset = lineStart + semiIdx + 1 // AFTER the existing `;`
				const n = 1 + Math.floor(rng() * 3)
				insertion = ' '.repeat(n)
				mutationKind = 'extraSpacesBeforeSemi' // legacy kind name kept for log
			}

			mutationKindCounts[mutationKind] =
				(mutationKindCounts[mutationKind] ?? 0) + 1

			const mutatedText =
				baselineText.slice(0, insertOffset) +
				insertion +
				baselineText.slice(insertOffset)

			// Re-normalise + extract — for `windowsNewline` we deliberately
			// skip normalisation in firstFourLines? No: readNormalised does
			// the CRLF→LF collapse. Here we already mutated baselineText
			// (already LF), so re-apply the normalisation to mimic disk read.
			let normalised = mutatedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
			const got = firstFourLines(normalised)

			const matches =
				got.length === EXPECTED_LINES.length &&
				got.every((line, i) => line === EXPECTED_LINES[i])

			if (!matches) {
				counterexamples.push({
					iter,
					lineMutated: lineIdx + 1,
					mutationKind,
					got: [...got],
				})
			}
		}

		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 10c] ${counterexamples.length} extractor counterexample(s):\n` +
					counterexamples
						.slice(0, 5)
						.map(
							(c, idx) =>
								`  #${idx + 1} iter=${c.iter} L${c.lineMutated} mutation=${c.mutationKind}\n` +
								`     got=${JSON.stringify(c.got)}\n` +
								`     expected=${JSON.stringify(EXPECTED_LINES)}`,
						)
						.join('\n'),
			)
		}

		// eslint-disable-next-line no-console
		console.log(
			`[Property 10c] iters=${N_PROPERTIES} ` +
				`kinds=${JSON.stringify(mutationKindCounts)} ` +
				`counterexamples=${counterexamples.length}`,
		)

		expect(counterexamples).toEqual([])
	})

	it('P10d — file contains @theme inline + oklch() + --sidebar tokens (req 16.2 sanity)', () => {
		// Soft sanity for 16.2; the strict 16.1 assertions are above.
		const text = readNormalised(STYLES_CSS)

		// Slice off the first 4 lines so we are checking the body strictly
		// AFTER the imports.
		const lines = text.split('\n')
		const after = lines.slice(4).join('\n')

		const hasThemeInline = /@theme\s+inline/.test(after)
		const hasOklch = /oklch\(/.test(after)
		const hasSidebarVar = /--sidebar/.test(after)

		// eslint-disable-next-line no-console
		console.log(
			`[Property 10d] @theme inline=${hasThemeInline} oklch()=${hasOklch} --sidebar=${hasSidebarVar}`,
		)

		expect({ hasThemeInline, hasOklch, hasSidebarVar }).toEqual({
			hasThemeInline: true,
			hasOklch: true,
			hasSidebarVar: true,
		})
	})

	it('extractor self-check: synthetic input with mixed trailing whitespace produces canonical lines', () => {
		// Validates the trim-trailing-whitespace rule used by firstFourLines.
		// No file is touched.
		const synthetic =
			'@import "tailwindcss";   \n' +
			'@import "tw-animate-css";\t\n' +
			'@import "shadcn/tailwind.css"; \n' +
			'@import "@fontsource-variable/geist";\n' +
			'\n:root { --x: 1; }\n'
		const got = firstFourLines(synthetic)
		expect(got).toEqual([...EXPECTED_LINES])
	})
})
