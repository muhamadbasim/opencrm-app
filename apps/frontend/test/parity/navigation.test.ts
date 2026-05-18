/**
 * Property-Based Test — Property 4: Sidebar Disjoint
 *
 * **Validates: Requirements 15.1, 15.2, 15.3 (Property 4 — design.md "Correctness Properties")**
 *
 * Property 4 statement (design.md):
 *   "Himpunan menu sidebar visible ∩ menu hidden = ∅. Visible set =
 *    {Dashboard, Inbox, Handover, Orders, Pelanggan, Products, Broadcast,
 *     Workflow, AI Agents, AI Playground, Knowledge Base, Settings}."
 *
 * System under test:
 *   `apps/frontend/src/lib/opencrm-navigation.ts` — the SINGLE nav source
 *   (per Requirement 15.1). It exports `OPENCRM_NAV_ITEMS`, the array that
 *   Sidebar.tsx and BottomNav.tsx render. Property 4 is a structural
 *   invariant on that array.
 *
 * Property (formalised):
 *   Let V = { item.path : item ∈ OPENCRM_NAV_ITEMS } ∪
 *           { item.label : item ∈ OPENCRM_NAV_ITEMS }
 *   Let H = HIDDEN_PATHS ∪ HIDDEN_LABELS  (compatibility-only routes/labels)
 *   Property 4 ⇔  V ∩ H = ∅
 *
 * The hidden compat menus (per task 6.2 & task 14.2) are routes that exist
 * as files under `apps/frontend/src/routes/_app/*` but must NEVER appear in
 * the sidebar. They exist solely so legacy deep-links don't 404.
 *
 *   Hidden paths : /analytics, /metrics, /pipeline, /help, /integration,
 *                  /team, /templates, /product-stock, /outbound,
 *                  /developers, /apps
 *   Hidden labels: Analytics, Metrics, Pipeline, Help, Integration, Team,
 *                  Templates, Product Stock, Outbound, Developers, Apps
 *
 * We test two complementary properties:
 *
 *   P4a (deterministic): for every item currently in OPENCRM_NAV_ITEMS,
 *        item.path ∉ HIDDEN_PATHS AND item.label ∉ HIDDEN_LABELS.
 *
 *   P4b (random sampling): pick ≥100 elements at random from HIDDEN_PATHS,
 *        and for each picked path p assert
 *          OPENCRM_NAV_ITEMS.find(i => i.path === p) === undefined.
 *        Same for HIDDEN_LABELS vs item.label. Random sampling is included
 *        because Property 4 is a ∀-property over the hidden set, and the
 *        random batch + a fixed seed gives a reproducible counterexample
 *        if a hidden item ever leaks into the nav.
 *
 *   We also assert the visible set V matches the canonical set from
 *   design.md exactly — this catches drift in either direction (a hidden
 *   item appearing, or a visible item disappearing).
 *
 * Random generation uses a deterministic Mulberry32 PRNG seeded from the
 * env var `OPENCRM_PROP_SEED` (default 0xC0FFEE) so failing runs are
 * reproducible. NO new npm dependency is added (parity rule). Same PRNG
 * pattern as `apps/backend/test/parity/workspace.test.ts` (Property 1).
 *
 * Test runner: `bun test` (matches monorepo test convention; frontend has
 * no separate Vitest setup).
 */

import { describe, expect, it } from 'bun:test'
import { OPENCRM_NAV_ITEMS } from '../../src/lib/opencrm-navigation'

// ---------- canonical sets (from design.md + task 6.2) ----------

const HIDDEN_PATHS: readonly string[] = [
	'/analytics',
	'/metrics',
	'/pipeline',
	'/help',
	'/integration',
	'/team',
	'/templates',
	'/product-stock',
	'/outbound',
	'/developers',
	'/apps',
] as const

const HIDDEN_LABELS: readonly string[] = [
	'Analytics',
	'Metrics',
	'Pipeline',
	'Help',
	'Integration',
	'Team',
	'Templates',
	'Product Stock',
	'Outbound',
	'Developers',
	'Apps',
] as const

const CANONICAL_VISIBLE_LABELS: readonly string[] = [
	'Dashboard',
	'Inbox',
	'Handover',
	'Orders',
	'Pelanggan',
	'Products',
	'Broadcast',
	'Workflow',
	'AI Agents',
	'AI Playground',
	'Knowledge Base',
	'Settings',
] as const

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

// ---------- the property test ----------

const N_PROPERTIES = Number(process.env.OPENCRM_PROP_COUNT ?? 120)

describe('Property 4 — Sidebar Disjoint (opencrm-navigation.ts)', () => {
	it('OPENCRM_NAV_ITEMS is non-empty and well-formed', () => {
		expect(Array.isArray(OPENCRM_NAV_ITEMS)).toBe(true)
		expect(OPENCRM_NAV_ITEMS.length).toBeGreaterThan(0)
		for (const item of OPENCRM_NAV_ITEMS) {
			expect(typeof item.id).toBe('string')
			expect(typeof item.path).toBe('string')
			expect(typeof item.label).toBe('string')
			expect(item.path.startsWith('/')).toBe(true)
		}
	})

	it('visible set matches the canonical set from design.md exactly', () => {
		const visibleLabels = OPENCRM_NAV_ITEMS.map((i) => i.label).sort()
		const expected = [...CANONICAL_VISIBLE_LABELS].sort()
		expect(visibleLabels).toEqual(expected)
		expect(OPENCRM_NAV_ITEMS.length).toBe(CANONICAL_VISIBLE_LABELS.length)
	})

	it('P4a — every item in OPENCRM_NAV_ITEMS has path ∉ HIDDEN_PATHS and label ∉ HIDDEN_LABELS', () => {
		const hiddenPathSet = new Set(HIDDEN_PATHS)
		const hiddenLabelSet = new Set(HIDDEN_LABELS)

		const counterexamples: Array<{
			id: string
			path: string
			label: string
			reason: string
		}> = []

		for (const item of OPENCRM_NAV_ITEMS) {
			if (hiddenPathSet.has(item.path)) {
				counterexamples.push({
					id: item.id,
					path: item.path,
					label: item.label,
					reason: `path "${item.path}" is in HIDDEN_PATHS`,
				})
			}
			if (hiddenLabelSet.has(item.label)) {
				counterexamples.push({
					id: item.id,
					path: item.path,
					label: item.label,
					reason: `label "${item.label}" is in HIDDEN_LABELS`,
				})
			}
		}

		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 4a] ${counterexamples.length} counterexample(s):\n` +
					counterexamples
						.map(
							(c, idx) =>
								`  #${idx + 1} id=${c.id} path=${c.path} label=${c.label}\n     reason=${c.reason}`,
						)
						.join('\n'),
			)
		}

		expect(counterexamples).toEqual([])
	})

	it(`P4b — ${N_PROPERTIES} random hidden picks are absent from OPENCRM_NAV_ITEMS`, () => {
		const counterexamples: Array<{
			iter: number
			pickedPath?: string
			pickedLabel?: string
			leakedItem: { id: string; path: string; label: string }
		}> = []

		const pathHits: Record<string, number> = {}
		const labelHits: Record<string, number> = {}

		for (let i = 0; i < N_PROPERTIES; i++) {
			// Each iteration picks ONE hidden path and ONE hidden label
			// independently; both must be absent from the nav.
			const pickedPath = pick(HIDDEN_PATHS)
			const pickedLabel = pick(HIDDEN_LABELS)

			pathHits[pickedPath] = (pathHits[pickedPath] ?? 0) + 1
			labelHits[pickedLabel] = (labelHits[pickedLabel] ?? 0) + 1

			const pathLeak = OPENCRM_NAV_ITEMS.find((it) => it.path === pickedPath)
			if (pathLeak !== undefined) {
				counterexamples.push({
					iter: i,
					pickedPath,
					leakedItem: { id: pathLeak.id, path: pathLeak.path, label: pathLeak.label },
				})
			}

			const labelLeak = OPENCRM_NAV_ITEMS.find((it) => it.label === pickedLabel)
			if (labelLeak !== undefined) {
				counterexamples.push({
					iter: i,
					pickedLabel,
					leakedItem: { id: labelLeak.id, path: labelLeak.path, label: labelLeak.label },
				})
			}
		}

		if (counterexamples.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 4b] ${counterexamples.length} counterexample(s) of ${N_PROPERTIES} iterations:\n` +
					counterexamples
						.slice(0, 5)
						.map(
							(c, idx) =>
								`  #${idx + 1} iter=${c.iter} pickedPath=${c.pickedPath ?? '-'} pickedLabel=${c.pickedLabel ?? '-'}\n` +
								`     leakedItem=${JSON.stringify(c.leakedItem)}`,
						)
						.join('\n'),
			)
			// eslint-disable-next-line no-console
			console.error(
				`\n[Property 4b] Coverage — paths picked: ${JSON.stringify(pathHits)}`,
			)
			// eslint-disable-next-line no-console
			console.error(
				`[Property 4b] Coverage — labels picked: ${JSON.stringify(labelHits)}`,
			)
		}

		// Ensure the random batch actually covered most of the hidden set.
		// With 120 iters across 11 hidden items the probability of missing
		// any one is (10/11)^120 ≈ 1e-5, so this assertion is safe.
		const pathsCovered = Object.keys(pathHits).length
		const labelsCovered = Object.keys(labelHits).length
		expect(pathsCovered).toBeGreaterThanOrEqual(Math.min(HIDDEN_PATHS.length, 8))
		expect(labelsCovered).toBeGreaterThanOrEqual(Math.min(HIDDEN_LABELS.length, 8))

		expect(counterexamples).toEqual([])
	})

	it('boundary spot-checks: each known-hidden path/label is independently absent', () => {
		// Belt-and-suspenders deterministic check that complements the random
		// batch in P4b. If any of these ever leaks into the nav, this test
		// surfaces the offender by name without needing a specific seed.
		for (const p of HIDDEN_PATHS) {
			const leak = OPENCRM_NAV_ITEMS.find((it) => it.path === p)
			expect({ path: p, leak }).toEqual({ path: p, leak: undefined })
		}
		for (const l of HIDDEN_LABELS) {
			const leak = OPENCRM_NAV_ITEMS.find((it) => it.label === l)
			expect({ label: l, leak }).toEqual({ label: l, leak: undefined })
		}
	})
})
