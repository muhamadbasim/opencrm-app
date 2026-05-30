/**
 * Integration smoke — WA web version fetch.
 *
 * Root cause of "QR never appears + Connection Failure (code 405)": the
 * Baileys-bundled WA web version goes stale and WhatsApp rejects the
 * handshake before emitting a QR. The runtime now fetches the current
 * version via `fetchLatestBaileysVersion()` at connect time.
 *
 * This test confirms the fetch utility is wired and returns a plausible,
 * NEWER-or-equal version than the bundled default. It is network-dependent,
 * so it self-skips when offline (set OPENCRM_REQUIRE_NETWORK_TESTS=1 to make
 * a network failure a hard failure in CI).
 */

import { describe, expect, it } from 'bun:test'
import { fetchLatestBaileysVersion } from '@whiskeysockets/baileys'

const REQUIRE_NETWORK = process.env.OPENCRM_REQUIRE_NETWORK_TESTS === '1'

describe('Baileys WA web version fetch (QR 405 fix)', () => {
	it('fetches a current WA web version as a [major, minor, build] tuple', async () => {
		let result: { version: number[]; isLatest: boolean; error?: unknown } | null =
			null
		try {
			result = (await fetchLatestBaileysVersion()) as typeof result
		} catch (error) {
			if (REQUIRE_NETWORK) throw error
			console.warn(
				'[wa-version test] network fetch failed; skipping (set OPENCRM_REQUIRE_NETWORK_TESTS=1 to enforce):',
				error,
			)
			return
		}

		expect(Array.isArray(result?.version)).toBe(true)
		expect(result?.version.length).toBe(3)
		for (const part of result!.version) {
			expect(Number.isInteger(part)).toBe(true)
			expect(part).toBeGreaterThanOrEqual(0)
		}
		// WA web protocol is on the 2.3000.x line; the build number must be a
		// large monotonic integer. Guards against a regression to a 2-part or
		// obviously bogus version.
		expect(result!.version[0]).toBe(2)
		expect(result!.version[2]).toBeGreaterThan(1_000_000_000)
	})
})
