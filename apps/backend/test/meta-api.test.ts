import { beforeEach, describe, expect, it, vi } from 'bun:test'

const fetchMock = vi.fn()
globalThis.fetch = fetchMock as unknown as typeof fetch

const { sendWhatsAppMessage } = await import('../src/lib/meta-api')

describe('sendWhatsAppMessage', () => {
	beforeEach(() => {
		fetchMock.mockReset()
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				messages: [{ id: 'wamid.mock' }],
			}),
		})
	})

	it('sends interactive payload for WhatsApp buttons', async () => {
		await sendWhatsAppMessage({
			phoneNumberId: '123',
			to: '628123456789',
			apiKey: 'token',
			type: 'interactive',
			interactive: {
				type: 'button',
				body: {
					text: 'Pilih opsi',
				},
				action: {
					buttons: [
						{
							type: 'reply',
							reply: { id: 'btn_1', title: 'A' },
						},
					],
				},
			},
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [, init] = fetchMock.mock.calls[0]
		const body = JSON.parse(String(init.body))
		expect(body.type).toBe('interactive')
		expect(body.interactive).toMatchObject({
			type: 'button',
			body: { text: 'Pilih opsi' },
		})
	})

	it('sends image payload for WhatsApp media message', async () => {
		await sendWhatsAppMessage({
			phoneNumberId: '123',
			to: '628123456789',
			apiKey: 'token',
			type: 'image',
			media: {
				link: 'https://cdn.example.com/image.jpg',
				caption: 'Promo terbaru',
			},
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [, init] = fetchMock.mock.calls[0]
		const body = JSON.parse(String(init.body))
		expect(body.type).toBe('image')
		expect(body.image).toEqual({
			link: 'https://cdn.example.com/image.jpg',
			caption: 'Promo terbaru',
		})
	})

	it('defaults template language to en_US when templateLanguage is missing', async () => {
		await sendWhatsAppMessage({
			phoneNumberId: '123',
			to: '628123456789',
			apiKey: 'token',
			type: 'template',
			content: 'promo_template',
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [, init] = fetchMock.mock.calls[0]
		const body = JSON.parse(String(init.body))
		expect(body.type).toBe('template')
		expect(body.template.language.code).toBe('en_US')
	})
})
