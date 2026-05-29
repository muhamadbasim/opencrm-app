import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
	getBaileysProviderWebhookUrl,
	getBaileysWhatsappWebhookCallbackUrl,
} from '../src/modules/whatsapp/webhook-config'

describe('whatsapp webhook config helpers', () => {
	// Env vars that participate in URL resolution. Bun auto-loads
	// apps/backend/.env, so the test must explicitly control every variable
	// it depends on instead of assuming a clean environment.
	const MANAGED_ENV_KEYS = [
		'BAILEYS_PROVIDER_WEBHOOK_URL',
		'BAILEYS_PROVIDER_WEBHOOK_PATH',
		'BAILEYS_SERVICE_URL',
		'API_PUBLIC_URL',
		'BACKEND_URL',
		'PUBLIC_API_BASE_URL',
		'WHATSAPP_REDIRECT_URI',
		'WHATSAPP_WEBHOOK_CALLBACK_URL',
	] as const

	const originalEnv = new Map<string, string | undefined>(
		MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
	)

	const clearManagedEnv = () => {
		for (const key of MANAGED_ENV_KEYS) delete process.env[key]
	}

	beforeEach(() => {
		// Start every case from a known-empty baseline so loaded .env values
		// (e.g. a real BAILEYS_SERVICE_URL) cannot leak into expectations.
		clearManagedEnv()
	})

	afterEach(() => {
		for (const [key, value] of originalEnv) {
			if (value === undefined) {
				delete process.env[key]
			} else {
				process.env[key] = value
			}
		}
	})

	it('prefers BAILEYS_PROVIDER_WEBHOOK_URL when provided', () => {
		process.env.BAILEYS_PROVIDER_WEBHOOK_URL =
			'https://api.scalebiz.chat/internal/baileys/outbound'
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_PATH

		const result = getBaileysProviderWebhookUrl(
			new Request('http://localhost:3010/api/v1/whatsapp-channels/baileys'),
			{},
		)

		expect(result).toBe('https://api.scalebiz.chat/internal/baileys/outbound')
	})

	it('builds provider webhook URL from public base and configured path', () => {
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_URL
		process.env.API_PUBLIC_URL = 'https://api.scalebiz.chat'
		process.env.BAILEYS_PROVIDER_WEBHOOK_PATH = '/internal/baileys/outbound'

		const result = getBaileysProviderWebhookUrl(
			new Request('http://localhost:3010/api/v1/whatsapp-channels/baileys'),
			{},
		)

		expect(result).toBe('https://api.scalebiz.chat/internal/baileys/outbound')
	})

	it('still builds inbound callback URL from request origin', () => {
		const result = getBaileysWhatsappWebhookCallbackUrl(
			new Request('https://local-api.scalebiz.chat/api/v1/whatsapp-channels/baileys'),
			{},
		)

		expect(result).toBe('https://local-api.scalebiz.chat/api/v1/webhooks/whatsapp/baileys')
	})

	it('defaults provider webhook URL to the internal Baileys service send route', () => {
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_URL
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_PATH
		delete process.env.BAILEYS_SERVICE_URL

		const result = getBaileysProviderWebhookUrl(
			new Request('http://localhost:3010/api/v1/whatsapp-channels/baileys'),
			{},
		)

		// With no explicit URL/path and no BAILEYS_SERVICE_URL, the resolver
		// falls back to the Baileys service send URL default (127.0.0.1:3012).
		expect(result).toBe('http://127.0.0.1:3012/api/v1/send')
	})

	it('uses BAILEYS_SERVICE_URL for the default provider webhook send route', () => {
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_URL
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_PATH
		process.env.BAILEYS_SERVICE_URL = 'https://baileys.scalebiz.chat'

		const result = getBaileysProviderWebhookUrl(
			new Request('http://localhost:3010/api/v1/whatsapp-channels/baileys'),
			{},
		)

		expect(result).toBe('https://baileys.scalebiz.chat/api/v1/send')
	})
})
