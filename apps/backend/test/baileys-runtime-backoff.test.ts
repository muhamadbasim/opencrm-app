/**
 * Unit test — embedded Baileys runtime reconnect backoff.
 *
 * Validates the exponential-with-cap reconnect delay used by
 * `BaileysRuntimeService` so a persistently failing channel cannot hammer
 * WhatsApp servers (and our DB) at a fixed tight interval. Pairs with the
 * bounded retry caps (MAX_RECONNECT_ATTEMPTS / MAX_QR_RETRY_ATTEMPTS) that
 * prevent infinite restart loops.
 */

import { describe, expect, it } from 'bun:test'
import {
	computeReconnectDelay,
	MAX_QR_RETRY_ATTEMPTS,
	MAX_RECONNECT_ATTEMPTS,
	PRE_QR_RETRY_DELAY_MS,
	RECONNECT_BASE_DELAY_MS,
	RECONNECT_MAX_DELAY_MS,
} from '../src/modules/whatsapp/baileys-runtime'

describe('Baileys runtime reconnect backoff', () => {
	it('first attempt uses the base delay', () => {
		expect(computeReconnectDelay(1)).toBe(RECONNECT_BASE_DELAY_MS)
	})

	it('doubles the delay on each subsequent attempt until the cap', () => {
		expect(computeReconnectDelay(2)).toBe(RECONNECT_BASE_DELAY_MS * 2)
		expect(computeReconnectDelay(3)).toBe(RECONNECT_BASE_DELAY_MS * 4)
		expect(computeReconnectDelay(4)).toBe(RECONNECT_BASE_DELAY_MS * 8)
	})

	it('never exceeds the maximum delay cap', () => {
		for (let attempt = 1; attempt <= 50; attempt++) {
			const delay = computeReconnectDelay(attempt)
			expect(delay).toBeLessThanOrEqual(RECONNECT_MAX_DELAY_MS)
			expect(delay).toBeGreaterThan(0)
		}
	})

	it('is monotonically non-decreasing as attempts grow', () => {
		let previous = 0
		for (let attempt = 1; attempt <= 20; attempt++) {
			const delay = computeReconnectDelay(attempt)
			expect(delay).toBeGreaterThanOrEqual(previous)
			previous = delay
		}
	})

	it('clamps non-positive attempt counts to the base delay', () => {
		expect(computeReconnectDelay(0)).toBe(RECONNECT_BASE_DELAY_MS)
		expect(computeReconnectDelay(-5)).toBe(RECONNECT_BASE_DELAY_MS)
	})

	it('exposes sane retry caps', () => {
		expect(MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(0)
		expect(MAX_QR_RETRY_ATTEMPTS).toBeGreaterThan(0)
		expect(PRE_QR_RETRY_DELAY_MS).toBeGreaterThan(0)
		// Pre-QR retry should be faster than a fully backed-off reconnect.
		expect(PRE_QR_RETRY_DELAY_MS).toBeLessThan(RECONNECT_MAX_DELAY_MS)
	})
})
