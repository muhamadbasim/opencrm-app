import { beforeEach, describe, expect, it, vi } from 'bun:test'

const { PakasirClient } = await import('../src/modules/commerce/pakasir-client')

describe('PakasirClient', () => {
	beforeEach(() => {
		process.env.PAKASIR_BASE_URL = 'https://pakasir.example/api'
		process.env.PAKASIR_PROJECT_SLUG = 'demo-shop'
		process.env.PAKASIR_API_KEY = 'pakasir-secret-key'
		process.env.PAKASIR_REDIRECT_URL = 'https://app.example/chat'
		process.env.PAKASIR_MODE = 'sandbox'
		;(PakasirClient as any).config = null
	})

	it('normalizes nested transaction payload fields', () => {
		const normalized = PakasirClient.normalizeTransaction({
			data: {
				transaction_id: 'trx-123',
				reference_id: 'ref-abc',
				status: 'completed',
				payment_url: 'https://pay.example/link',
				payment_method: 'qris',
				payment_number: '000201010212',
			},
		})

		expect(normalized.providerInvoiceId).toBe('trx-123')
		expect(normalized.referenceId).toBe('ref-abc')
		expect(normalized.status).toBe('COMPLETED')
		expect(normalized.paymentLink).toBe('https://pay.example/link')
		expect(normalized.method).toBe('qris')
		expect(normalized.paymentNumber).toBe('000201010212')
	})

	it('is configured when API key is present even without project slug', () => {
		delete process.env.PAKASIR_PROJECT_SLUG
		delete process.env.PAKASIR_PROJECT
		;(PakasirClient as any).config = null

		expect(PakasirClient.isConfigured()).toBe(true)
	})

	it('requires amount for hosted payment url fallback', () => {
		const url = PakasirClient.buildHostedPaymentUrl('trx-7788')
		expect(url).toBe(null)
	})

	it('builds hosted payment url from amount and order id', () => {
		const url = PakasirClient.buildHostedPaymentUrl('trx-7788', undefined, {
			amount: 250000,
			orderId: 'order-7788',
			method: 'qris',
		})
		expect(url).toBe(
			'https://pakasir.example/pay/demo-shop/250000?order_id=order-7788&qris_only=1',
		)
	})

	it('sends transaction create request to method-specific endpoint', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				transaction_id: 'trx-99',
				reference_id: 'order-99',
				status: 'pending',
				payment_url: 'https://pay.example/order-99',
			}),
		})

		globalThis.fetch = fetchMock as unknown as typeof fetch

		const response = await PakasirClient.createTransaction('qris', {
			external_id: 'order-99',
			amount: 250000,
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://pakasir.example/api/transactioncreate/qris',
		)
		const requestInit = fetchMock.mock.calls[0][1] as RequestInit
		expect(requestInit.method).toBe('POST')
		const parsedBody = JSON.parse(String(requestInit.body))
		expect(parsedBody).toMatchObject({
			external_id: 'order-99',
			amount: 250000,
			project_slug: 'demo-shop',
			redirect_url: 'https://app.example/chat',
		})

		expect(response.providerInvoiceId).toBe('trx-99')
		expect(response.referenceId).toBe('order-99')
		expect(response.status).toBe('PENDING')
	})

	it('falls back to default base URL and keeps sandbox mode payload', async () => {
		delete process.env.PAKASIR_BASE_URL
		;(PakasirClient as any).config = null

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				transaction_id: 'trx-sbx-1',
				reference_id: 'order-sbx-1',
				status: 'pending',
			}),
		})
		globalThis.fetch = fetchMock as unknown as typeof fetch

		await PakasirClient.createTransaction('qris', {
			external_id: 'order-sbx-1',
			amount: 99000,
		})

		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://app.pakasir.com/api/transactioncreate/qris',
		)
		const requestInit = fetchMock.mock.calls[0][1] as RequestInit
		const parsedBody = JSON.parse(String(requestInit.body))
		expect(parsedBody.mode).toBe('sandbox')
		expect(parsedBody.project).toBe('demo-shop')
	})

	it('sends request without project fields when project slug is not configured', async () => {
		delete process.env.PAKASIR_PROJECT_SLUG
		delete process.env.PAKASIR_PROJECT
		;(PakasirClient as any).config = null

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				transaction_id: 'trx-100',
				reference_id: 'order-100',
				status: 'pending',
			}),
		})
		globalThis.fetch = fetchMock as unknown as typeof fetch

		await PakasirClient.createTransaction('qris', {
			external_id: 'order-100',
			amount: 10000,
		})

		const requestInit = fetchMock.mock.calls[0][1] as RequestInit
		const parsedBody = JSON.parse(String(requestInit.body))
		expect(parsedBody.project).toBeUndefined()
		expect(parsedBody.project_slug).toBeUndefined()
		expect(parsedBody.api_key).toBe('pakasir-secret-key')
	})
})
