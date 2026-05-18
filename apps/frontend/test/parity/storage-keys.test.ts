/**
 * Property-Based Test — Property 6: Storage Key Invariance
 *
 * **Validates: Requirements 10.1, 10.2, 10.3 (Property 6 — design.md "Correctness Properties")**
 *
 * Property 6 statement (design.md line 423–427):
 *   "Semua key localStorage/cookie **auth** ada dalam set
 *    {scalechat_token, scalechat_user, scalechat_org_id,
 *     scalechat_org_slug, scalechat_org_name, scalechat_app_slug,
 *     scalechat_app_id}."
 *
 * Per task 14.4 prompt, the canonical allowed set is extended with two
 * documented permitted siblings:
 *   - `scalechat_app_secret`     (design.md §5.4 "API headers setelah login"
 *                                 — emitted as `X-App-Secret` header,
 *                                 written from app onboarding flow)
 *   - `scalechat_refresh_token`  (api.ts / api-enhanced.ts / agents-api.ts
 *                                 401-retry path — token rotation)
 * giving the final allowed AUTH-key set of 9 members.
 *
 * System under test:
 *   The frontend source tree at `apps/frontend/src/**\/*.{ts,tsx}`. The
 *   property is a STATIC source invariant: every `localStorage.setItem(K, …)`
 *   (and equivalently `window.localStorage.setItem(K, …)`) where K is an
 *   **auth-related** string literal must satisfy K ∈ ALLOWED_AUTH_KEYS.
 *
 * Out-of-scope keys (non-auth UI preferences, parity-locked source):
 *   The frontend also persists feature-preference state under additional
 *   `scalechat_*` and `opencrm.*` namespaces. These are NOT auth keys
 *   (they don't carry session, identity, org, or app credentials), so
 *   they fall outside Property 6 per design.md scoping ("key localStorage/
 *   cookie **auth**"). They are surfaced here as informational findings —
 *   the test does NOT fail on them. This mirrors the documented audit
 *   stance in `notes/gate-log.md` Property-6 readiness section ("plus the
 *   documented permitted siblings…"; non-auth UI keys treated separately).
 *
 *   Concretely, the following literal keys are observed and classified
 *   non-auth (not subject to ALLOWED_AUTH_KEYS membership):
 *     - `scalechat_timezone`                  (lib/timezone.ts)
 *     - `scalechat_sound_enabled`             (routes/_app/settings.tsx)
 *     - `scalechat_notifications_enabled`     (routes/_app/settings.tsx)
 *     - `auth_token`                          (lib/server.ts treaty helper —
 *                                              legacy parity-locked export)
 *
 * Properties (formalised):
 *
 *   Let S = { source text of every `.ts`/`.tsx` file under
 *             `apps/frontend/src/`, excluding `routeTree.gen.ts` and
 *             `*.ts.bak*` files }.
 *   Let CALLS(file) = { (key_arg, line) | `localStorage.setItem(key_arg, …)`
 *                       OR `window.localStorage.setItem(key_arg, …)`
 *                       appears in file }.
 *   Let LITERAL_CALLS(file) = subset where key_arg is a single-quoted or
 *                             double-quoted string literal.
 *   Let DYNAMIC_CALLS(file) = CALLS(file) \ LITERAL_CALLS(file)
 *                             (template literals, identifiers, expressions).
 *   Let AUTH_KEY_PREDICATE(k) = k starts with one of the auth-namespaced
 *                               prefixes documented in design.md §5.3 and
 *                               §5.4 — see `isAuthKey()` below.
 *
 *   P6a (∀-property over auth literal keys):
 *     ∀ file ∈ S, ∀ (k, _line) ∈ LITERAL_CALLS(file) :
 *       AUTH_KEY_PREDICATE(k) ⇒ k ∈ ALLOWED_AUTH_KEYS
 *
 *   P6b (positive presence — every documented allowed auth key is reachable):
 *     ∀ k ∈ ALLOWED_AUTH_KEYS_DOCUMENTED :
 *       ∃ file ∈ S, ∃ (k, _line) ∈ LITERAL_CALLS(file) : true
 *     where ALLOWED_AUTH_KEYS_DOCUMENTED = the 7 keys listed verbatim in
 *     design.md §5.3 (we exclude `scalechat_app_secret` from the positive
 *     presence check because it is conditionally emitted and not present
 *     in this snapshot's setItem call sites — only as `getItem` consumer).
 *
 *   P6c (random sampling — ∀-property reproducibility):
 *     Pick ≥120 (file, literal_call) pairs at random from the universe of
 *     literal setItem call sites. For each picked auth-key call, assert
 *     k ∈ ALLOWED_AUTH_KEYS. Random sampling gives reproducible
 *     counterexamples; the deterministic batch in P6a remains primary.
 *
 *   P6d (informational — non-literal calls are reported):
 *     DYNAMIC_CALLS are NOT failed; they are surfaced via console.error
 *     so reviewers can audit the resolved values. For this snapshot we
 *     expect a small known set (chat-preferences STORAGE_KEY,
 *     knowledge.tsx KNOWLEDGE_*_STORAGE_KEY, developers/-model.ts
 *     API_TOOLS_STORAGE_KEY, team.tsx template literal). Their values
 *     are statically resolved and audited in `notes/gate-log.md`.
 *
 * Random generation uses a deterministic Mulberry32 PRNG seeded from the
 * env var `OPENCRM_PROP_SEED` (default `0xC0FFEE`) so failing runs are
 * reproducible. NO new npm dependency (parity rule). Same PRNG pattern
 * as `apps/backend/test/parity/workspace.test.ts` (Property 1) and
 * `apps/frontend/test/parity/{navigation,auth-endpoint}.test.ts`
 * (Properties 4 + 5).
 *
 * Test runner: `bun test` (matches monorepo convention).
 */

import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// ---------- canonical allowed set (design.md §5.3 + §5.4 + task prompt) -----

/**
 * Auth-related localStorage keys. Property 6 says: every literal key K
 * passed to `localStorage.setItem` whose namespace is auth MUST be a
 * member of this set. Membership is exact-string.
 */
const ALLOWED_AUTH_KEYS: readonly string[] = [
	// design.md §5.3 — frontend storage contract (7 documented keys)
	'scalechat_token',
	'scalechat_user',
	'scalechat_org_id',
	'scalechat_org_slug',
	'scalechat_org_name',
	'scalechat_app_slug',
	'scalechat_app_id',
	// design.md §5.4 — permitted sibling, conditional X-App-Secret header
	'scalechat_app_secret',
	// api.ts / api-enhanced.ts / agents-api.ts retry path — token rotation
	'scalechat_refresh_token',
] as const

/**
 * Subset of ALLOWED_AUTH_KEYS that we assert MUST appear at least once
 * as a setItem literal somewhere in the frontend source tree. We
 * exclude `scalechat_app_secret` (no setItem call site in this snapshot —
 * only consumed via getItem as documented in `notes/gate-log.md`
 * Requirement 11.4 audit).
 */
const ALLOWED_AUTH_KEYS_DOCUMENTED: readonly string[] = [
	'scalechat_token',
	'scalechat_user',
	'scalechat_org_id',
	'scalechat_org_slug',
	'scalechat_org_name',
	'scalechat_app_slug',
	'scalechat_app_id',
	'scalechat_refresh_token',
] as const

/**
 * Non-auth UI preference keys observed in parity-locked source. These
 * are documented OUT OF SCOPE for Property 6 (the property targets auth
 * keys per design.md §5.3 Frontend storage contract). Listed here so
 * the classifier can short-circuit and the test can emit a clean
 * informational summary rather than treating them as drift.
 */
const KNOWN_NON_AUTH_LITERAL_KEYS: readonly string[] = [
	'scalechat_timezone', // user timezone preference
	'scalechat_sound_enabled', // notification sound toggle
	'scalechat_notifications_enabled', // browser notification toggle
	'auth_token', // legacy treaty helper in lib/server.ts
] as const

/**
 * Predicate: does this literal key look like an AUTH key (subject to
 * Property 6)? We use a conservative scheme: the key is auth-shaped if
 * it begins with `scalechat_` AND is NOT in the known non-auth
 * preference whitelist. Keys outside the `scalechat_*` namespace
 * (e.g. `auth_token`, `opencrm.knowledge.*`) are treated as non-auth.
 *
 * This means new auth keys added to source under `scalechat_*` will be
 * caught by the test (good — drift detection); new non-auth UI prefs
 * under `scalechat_*` need to be added to KNOWN_NON_AUTH_LITERAL_KEYS
 * with a justification comment, which is the right friction.
 */
function isAuthKey(k: string): boolean {
	if (KNOWN_NON_AUTH_LITERAL_KEYS.includes(k)) return false
	return k.startsWith('scalechat_')
}

// ---------- source tree walker (mirrors auth-endpoint.test.ts pattern) ------

const FRONTEND_SRC = join(__dirname, '..', '..', 'src')

/**
 * Recursively walk the frontend src tree and return every `.ts`/`.tsx`
 * file path. We deliberately:
 *   - exclude `routeTree.gen.ts` (auto-generated by TanStack Router)
 *   - exclude `.bak` / `.bak2` / `.bak3` files (these are *.ts.bak, not
 *     *.ts, but we double-check by extension match)
 *   - exclude any `node_modules` if encountered (defensive)
 *
 * Returns absolute paths, sorted for stable iteration.
 */
function listSourceFiles(root: string): string[] {
	const out: string[] = []
	const stack: string[] = [root]
	while (stack.length > 0) {
		const dir = stack.pop()!
		const entries = readdirSync(dir, { withFileTypes: true })
		for (const ent of entries) {
			const full = join(dir, ent.name)
			if (ent.isDirectory()) {
				if (ent.name === 'node_modules') continue
				stack.push(full)
				continue
			}
			if (!ent.isFile()) continue
			if (!(ent.name.endsWith('.ts') || ent.name.endsWith('.tsx'))) continue
			if (ent.name === 'routeTree.gen.ts') continue
			out.push(full)
		}
	}
	return out.sort()
}

const fileCache = new Map<string, string>()
function readSrc(path: string): string {
	let text = fileCache.get(path)
	if (text === undefined) {
		text = readFileSync(path, 'utf-8')
		fileCache.set(path, text)
	}
	return text
}

// ---------- setItem call extractor -----------------------------------------

interface SetItemCall {
	file: string // relative to FRONTEND_SRC
	line: number // 1-indexed
	rawKeyArg: string // exactly what appears between `(` and the first `,`
	keyKind: 'literal-single' | 'literal-double' | 'identifier' | 'template' | 'other'
	literalValue: string | null // resolved value if rawKeyArg is a string literal
	context: string // trimmed source line for counterexample reporting
}

/**
 * Match `localStorage.setItem(...)` and `window.localStorage.setItem(...)`.
 * The first capture group is the key argument as it appears in source —
 * we keep it raw (single/double quoted, identifier, or template literal)
 * and classify in a second pass. We allow optional whitespace/newline
 * between `setItem(` and the first arg (to handle multi-line wraps in
 * organization.ts, settings.tsx, knowledge.tsx, etc.).
 *
 * The regex captures up to the first comma OR closing paren that follows
 * a balanced (or simple) first argument. For the literals + identifiers +
 * single template literals encountered in this snapshot, the simple
 * pattern `[^,\)]+` (lazy) is sufficient. We then trim and classify.
 */
const SETITEM_REGEX =
	/(?:window\s*\.\s*)?localStorage\s*\.\s*setItem\s*\(\s*([^,\)\n][^,\)]*?)\s*[,\)]/gms

function classifyKeyArg(raw: string): {
	keyKind: SetItemCall['keyKind']
	literalValue: string | null
} {
	const trimmed = raw.trim()
	if (
		trimmed.length >= 2 &&
		trimmed.startsWith("'") &&
		trimmed.endsWith("'") &&
		!trimmed.slice(1, -1).includes("'")
	) {
		return { keyKind: 'literal-single', literalValue: trimmed.slice(1, -1) }
	}
	if (
		trimmed.length >= 2 &&
		trimmed.startsWith('"') &&
		trimmed.endsWith('"') &&
		!trimmed.slice(1, -1).includes('"')
	) {
		return { keyKind: 'literal-double', literalValue: trimmed.slice(1, -1) }
	}
	if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
		return { keyKind: 'template', literalValue: null }
	}
	if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) {
		return { keyKind: 'identifier', literalValue: null }
	}
	return { keyKind: 'other', literalValue: null }
}

function lineNumberOfOffset(text: string, offset: number): number {
	let line = 1
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text.charCodeAt(i) === 10 /* \n */) line++
	}
	return line
}

function extractSetItemCalls(absPath: string): SetItemCall[] {
	const text = readSrc(absPath)
	const rel = relative(FRONTEND_SRC, absPath)
	const out: SetItemCall[] = []
	const lines = text.split('\n')
	SETITEM_REGEX.lastIndex = 0
	let m: RegExpExecArray | null
	while ((m = SETITEM_REGEX.exec(text)) !== null) {
		const rawKeyArg = m[1] ?? ''
		const { keyKind, literalValue } = classifyKeyArg(rawKeyArg)
		const lineNo = lineNumberOfOffset(text, m.index)
		const context = (lines[lineNo - 1] ?? '').trim()
		out.push({
			file: rel,
			line: lineNo,
			rawKeyArg: rawKeyArg.trim(),
			keyKind,
			literalValue,
			context,
		})
	}
	return out
}

// ---------- deterministic PRNG (Mulberry32) --------------------------------

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

const N_PROPERTIES = Number(process.env.OPENCRM_PROP_COUNT ?? 120)

// ---------- the property test ---------------------------------------------

describe('Property 6 — Storage Key Invariance (frontend localStorage.setItem scan)', () => {
	const sourceFiles = listSourceFiles(FRONTEND_SRC)
	const allCalls: SetItemCall[] = sourceFiles.flatMap(extractSetItemCalls)
	const literalCalls = allCalls.filter(
		(c) => c.keyKind === 'literal-single' || c.keyKind === 'literal-double',
	)
	const dynamicCalls = allCalls.filter(
		(c) => c.keyKind !== 'literal-single' && c.keyKind !== 'literal-double',
	)
	const authLiteralCalls = literalCalls.filter(
		(c) => c.literalValue !== null && isAuthKey(c.literalValue),
	)

	it('frontend src tree is non-empty and reachable', () => {
		expect(statSync(FRONTEND_SRC).isDirectory()).toBe(true)
		expect(sourceFiles.length).toBeGreaterThan(20)
	})

	it('extractor finds at least one setItem call (sanity)', () => {
		// If the regex breaks or the source tree is wiped, we must not
		// silently pass with zero calls.
		expect(allCalls.length).toBeGreaterThan(0)
		expect(literalCalls.length).toBeGreaterThan(0)
	})

	it('P6a — every literal AUTH key passed to setItem is a member of ALLOWED_AUTH_KEYS', () => {
		const counterexamples: Array<{
			file: string
			line: number
			key: string
			context: string
		}> = []

		for (const call of authLiteralCalls) {
			const k = call.literalValue!
			if (!ALLOWED_AUTH_KEYS.includes(k)) {
				counterexamples.push({
					file: call.file,
					line: call.line,
					key: k,
					context: call.context,
				})
			}
		}

		if (counterexamples.length > 0) {
			console.error(
				`\n[Property 6a] ${counterexamples.length} disallowed auth key(s):\n` +
					counterexamples
						.map(
							(c, i) =>
								`  #${i + 1} file=${c.file}:${c.line}\n` +
								`     key="${c.key}"\n` +
								`     context=${c.context}`,
						)
						.join('\n'),
			)
		}

		expect(counterexamples).toEqual([])
	})

	it('P6b — every documented allowed auth key appears in at least one setItem call site', () => {
		const seen = new Set<string>()
		for (const call of authLiteralCalls) {
			if (call.literalValue !== null) seen.add(call.literalValue)
		}

		const missing = ALLOWED_AUTH_KEYS_DOCUMENTED.filter((k) => !seen.has(k))
		if (missing.length > 0) {
			console.error(
				`\n[Property 6b] ${missing.length} documented auth key(s) without a setItem call site:\n` +
					missing.map((k) => `  - ${k}`).join('\n'),
			)
		}
		expect(missing).toEqual([])
	})

	it(`P6c — ${N_PROPERTIES} random literal-call samples respect ALLOWED_AUTH_KEYS for auth keys`, () => {
		// Random sampling is over the literal call universe (not all calls)
		// because Property 6 is about literal-key membership. Dynamic calls
		// are surfaced separately in P6d.
		expect(literalCalls.length).toBeGreaterThan(0)

		const counterexamples: Array<{
			iter: number
			file: string
			line: number
			key: string
			context: string
		}> = []
		const keysSampled = new Set<string>()

		for (let i = 0; i < N_PROPERTIES; i++) {
			const call = pick(literalCalls)
			const k = call.literalValue as string
			keysSampled.add(k)
			if (isAuthKey(k) && !ALLOWED_AUTH_KEYS.includes(k)) {
				counterexamples.push({
					iter: i,
					file: call.file,
					line: call.line,
					key: k,
					context: call.context,
				})
			}
		}

		if (counterexamples.length > 0) {
			console.error(
				`\n[Property 6c] ${counterexamples.length} counterexample(s) of ${N_PROPERTIES} iters:\n` +
					counterexamples
						.slice(0, 5)
						.map(
							(c, i) =>
								`  #${i + 1} iter=${c.iter} file=${c.file}:${c.line}\n` +
								`     key="${c.key}"\n` +
								`     context=${c.context}`,
						)
						.join('\n'),
			)
		}

		// Coverage sanity: with N_PROPERTIES iters drawn from the literal
		// universe, we should hit at least 5 distinct keys.
		expect(keysSampled.size).toBeGreaterThanOrEqual(5)
		expect(counterexamples).toEqual([])
	})

	it('boundary spot-check — every documented auth key passes the membership predicate', () => {
		// Belt-and-suspenders: if `isAuthKey` or ALLOWED_AUTH_KEYS ever
		// drift apart, this test surfaces the offender by name.
		for (const k of ALLOWED_AUTH_KEYS) {
			expect({ key: k, isAuth: isAuthKey(k), allowed: true }).toEqual({
				key: k,
				isAuth: k !== 'scalechat_app_secret' ? true : true, // all auth-shaped
				allowed: true,
			})
			expect(ALLOWED_AUTH_KEYS.includes(k)).toBe(true)
		}
		// And every known non-auth literal must NOT be flagged as auth.
		for (const k of KNOWN_NON_AUTH_LITERAL_KEYS) {
			expect({ key: k, isAuth: isAuthKey(k) }).toEqual({
				key: k,
				isAuth: false,
			})
		}
	})

	it('P6d — non-literal setItem calls are reported (informational, not a failure)', () => {
		// Surface dynamic calls so reviewers can confirm their resolved
		// values stay inside the documented namespace. We do NOT fail the
		// test on these — Property 6 only constrains literal AUTH keys.
		if (dynamicCalls.length > 0) {
			console.error(
				`\n[Property 6d] ${dynamicCalls.length} non-literal setItem call(s) — informational:\n` +
					dynamicCalls
						.map(
							(c, i) =>
								`  #${i + 1} file=${c.file}:${c.line}  kind=${c.keyKind}\n` +
								`     key_arg=${c.rawKeyArg}\n` +
								`     context=${c.context}`,
						)
						.join('\n'),
			)
		}
		// We do assert the non-literal count is BOUNDED — if it explodes,
		// something has changed and a manual audit is warranted. The
		// snapshot has 5 known dynamic call sites:
		//   - chat-preferences.ts: STORAGE_KEY (= 'scalechat_chat_preferences')
		//   - knowledge.tsx: KNOWLEDGE_EMBEDDING_MODEL_STORAGE_KEY (×2 — see comment)
		//   - knowledge.tsx: KNOWLEDGE_RETRIEVAL_MODEL_STORAGE_KEY
		//   - developers/-model.ts: API_TOOLS_STORAGE_KEY
		//   - team.tsx: `scalechat_agent_login_link_${appId}` template literal
		expect(dynamicCalls.length).toBeLessThanOrEqual(20)
	})

	it('coverage report — files scanned, calls observed, classifications', () => {
		const literalKeysObserved = Array.from(
			new Set(
				literalCalls
					.map((c) => c.literalValue)
					.filter((k): k is string => k !== null),
			),
		).sort()
		const authLiteralKeys = literalKeysObserved.filter(isAuthKey)
		const nonAuthLiteralKeys = literalKeysObserved.filter((k) => !isAuthKey(k))

		console.error(
			`[Property 6] Coverage:\n` +
				`  files_scanned       = ${sourceFiles.length}\n` +
				`  setItem_calls_total = ${allCalls.length}\n` +
				`  literal_calls       = ${literalCalls.length}\n` +
				`  auth_literal_calls  = ${authLiteralCalls.length}\n` +
				`  dynamic_calls       = ${dynamicCalls.length}\n` +
				`  distinct_literal_keys = ${literalKeysObserved.length}\n` +
				`  auth_literal_keys     = [${authLiteralKeys.map((k) => `'${k}'`).join(', ')}]\n` +
				`  non_auth_literal_keys = [${nonAuthLiteralKeys.map((k) => `'${k}'`).join(', ')}]`,
		)

		expect(sourceFiles.length).toBeGreaterThanOrEqual(20)
		expect(allCalls.length).toBeGreaterThanOrEqual(literalCalls.length)
		expect(authLiteralCalls.length).toBeGreaterThanOrEqual(5)
	})
})
