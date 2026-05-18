import { beforeEach, describe, expect, it } from 'bun:test'

const { __test__ } = await import('../src/modules/commerce/service')

describe('Pakasir settings webhook URL', () => {
	beforeEach(() => {
		delete process.env.API_PUBLIC_URL
		delete process.env.PUBLIC_API_BASE_URL
		delete process.env.BACKEND_URL
		delete process.env.BETTER_AUTH_URL
	})

	it('uses forwarded HTTPS origin behind a proxy', () => {
		const baseUrl = __test__.resolvePublicApiBaseUrl(
			'http://api-crm.scalebiz.chat/api/commerce/settings/pakasir',
			{
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'api-crm.scalebiz.chat',
			},
		)

		expect(baseUrl).toBe('https://api-crm.scalebiz.chat')
	})

	it('keeps the configured public API URL as the source of truth', () => {
		process.env.API_PUBLIC_URL = 'https://api-crm.scalebiz.chat/'

		const baseUrl = __test__.resolvePublicApiBaseUrl(
			'http://internal:3000/api/commerce/settings/pakasir',
			{
				'x-forwarded-proto': 'http',
				'x-forwarded-host': 'internal:3000',
			},
		)

		expect(baseUrl).toBe('https://api-crm.scalebiz.chat')
	})
})
