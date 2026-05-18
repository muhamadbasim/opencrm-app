import { afterEach, describe, expect, it } from 'bun:test'
import {
	getBaileysProviderWebhookUrl,
	getBaileysWhatsappWebhookCallbackUrl,
} from '../src/modules/whatsapp/webhook-config'

describe('whatsapp webhook config helpers', () => {
	const originalProviderUrl = process.env.BAILEYS_PROVIDER_WEBHOOK_URL
	const originalProviderPath = process.env.BAILEYS_PROVIDER_WEBHOOK_PATH
	const originalApiPublicUrl = process.env.API_PUBLIC_URL

	afterEach(() => {
		process.env.BAILEYS_PROVIDER_WEBHOOK_URL = originalProviderUrl
		process.env.BAILEYS_PROVIDER_WEBHOOK_PATH = originalProviderPath
		process.env.API_PUBLIC_URL = originalApiPublicUrl
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

	it('defaults provider webhook URL to the internal backend send route', () => {
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_URL
		delete process.env.BAILEYS_PROVIDER_WEBHOOK_PATH

		const result = getBaileysProviderWebhookUrl(
			new Request('http://localhost:3010/api/v1/whatsapp-channels/baileys'),
			{},
		)

		expect(result).toBe('http://localhost:3010/api/v1/whatsapp-channels/baileys/send')
	})
})
