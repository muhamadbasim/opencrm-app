import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockWebhooksFindMany = vi.fn()
const mockFormatMessageWebhookPayload = vi.fn()
const mockBuildMessageWebhookPayloadFallback = vi.fn()

const mockPrisma = {
	webhooks: {
		findMany: mockWebhooksFindMany,
	},
}

vi.mock('../src/lib/prisma', () => ({ default: mockPrisma }))
vi.mock('../src/modules/business-webhooks/message-event-formatter', () => ({
	formatMessageWebhookPayload: mockFormatMessageWebhookPayload,
	buildMessageWebhookPayloadFallback: mockBuildMessageWebhookPayloadFallback,
	isMessageWebhookEvent: (eventName: string) =>
		eventName === 'message.received' || eventName === 'message.sent',
}))

const { BusinessWebhookDispatchService } = await import(
	'../src/modules/business-webhooks/dispatch-service'
)

describe('BusinessWebhookDispatchService', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => '',
		}) as unknown as typeof fetch
		mockBuildMessageWebhookPayloadFallback.mockReturnValue({
			id: 'fallback-id',
			object: 'message',
			timestamp: 1775901561,
			event_name: 'message.received',
			data: {
				id: 'fallback-message',
			},
		})
	})

	it('uses hard-switch payload for message events', async () => {
		mockWebhooksFindMany.mockResolvedValue([
			{
				id: 'webhook-1',
				url: 'https://example.com/hook',
				subscriptions: ['message.received'],
				inbox_id: null,
				secret: 'my-secret',
				headers: { 'x-custom-header': 'custom-value' },
				is_hidden: false,
			},
		])
		mockFormatMessageWebhookPayload.mockImplementation(async (args: any) => ({
			id: args.deliveryId,
			object: 'message',
			timestamp: 1775901561,
			event_name: args.eventName,
			data: {
				id: 'message-1',
			},
		}))

		await BusinessWebhookDispatchService.dispatch({
			event: 'message.received',
			appId: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			inboxId: '879083bd-ba0e-4fdc-8ddd-3c1479e5b81e',
			payload: {
				message: { id: 'message-1' },
			},
		})

		expect(mockFormatMessageWebhookPayload).toHaveBeenCalledTimes(1)
		expect(mockFormatMessageWebhookPayload).toHaveBeenCalledWith({
			deliveryId: expect.any(String),
			eventName: 'message.received',
			appId: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			inboxId: '879083bd-ba0e-4fdc-8ddd-3c1479e5b81e',
			payload: { message: { id: 'message-1' } },
			dispatchedAt: expect.any(Date),
		})

		expect(globalThis.fetch).toHaveBeenCalledTimes(1)
		const [, requestInit] = (globalThis.fetch as any).mock.calls[0]
		const body = JSON.parse(String(requestInit.body))
		const headers = requestInit.headers as Record<string, string>

		expect(body).toMatchObject({
			webhookUrl: 'https://example.com/hook',
			events: 'message.received',
			payload: {
				object: 'message',
				event_name: 'message.received',
				data: { id: 'message-1' },
			},
		})
		expect(body).not.toHaveProperty('event')
		expect(body).not.toHaveProperty('app_id')
		expect(body.payload).not.toHaveProperty('event')
		expect(body.payload).not.toHaveProperty('app_id')

		expect(headers['x-scalebiz-event']).toBe('message.received')
		expect(headers['x-scalebiz-delivery-id']).toEqual(expect.any(String))
		expect(headers['x-scalebiz-signature-256']).toMatch(/^sha256=/)
		expect(headers['x-custom-header']).toBe('custom-value')
	})

	it('keeps legacy envelope for non-message events', async () => {
		mockWebhooksFindMany.mockResolvedValue([
			{
				id: 'webhook-1',
				url: 'https://example.com/hook',
				subscriptions: ['conversation.created'],
				inbox_id: null,
				secret: null,
				headers: null,
				is_hidden: false,
			},
		])

		await BusinessWebhookDispatchService.dispatch({
			event: 'conversation.created',
			appId: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			inboxId: null,
			payload: {
				source: 'whatsapp',
				conversation: { id: 'conversation-1' },
			},
		})

		expect(mockFormatMessageWebhookPayload).not.toHaveBeenCalled()
		expect(globalThis.fetch).toHaveBeenCalledTimes(1)

		const [, requestInit] = (globalThis.fetch as any).mock.calls[0]
		const body = JSON.parse(String(requestInit.body))
		const headers = requestInit.headers as Record<string, string>

		expect(body).toMatchObject({
			webhookUrl: 'https://example.com/hook',
			events: 'conversation.created',
			payload: {
				id: expect.any(String),
				event: 'conversation.created',
				timestamp: expect.any(String),
				app_id: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
				inbox_id: null,
				payload: {
					source: 'whatsapp',
					conversation: { id: 'conversation-1' },
				},
			},
		})
		expect(body.payload).not.toHaveProperty('object')
		expect(body.payload).not.toHaveProperty('event_name')
		expect(headers['x-scalebiz-event']).toBe('conversation.created')
	})

	it('deduplicates active targets that share the same url and inbox', async () => {
		mockWebhooksFindMany.mockResolvedValue([
			{
				id: 'webhook-new',
				url: 'https://example.com/hook',
				subscriptions: ['message.received'],
				inbox_id: null,
				secret: null,
				headers: null,
				is_hidden: false,
			},
			{
				id: 'webhook-old',
				url: 'https://example.com/hook',
				subscriptions: ['message.received'],
				inbox_id: null,
				secret: null,
				headers: null,
				is_hidden: false,
			},
		])
		mockFormatMessageWebhookPayload.mockResolvedValue({
			id: 'delivery-id',
			object: 'message',
			timestamp: 1775901561,
			event_name: 'message.received',
			data: { id: 'message-1' },
		})

		await BusinessWebhookDispatchService.dispatch({
			event: 'message.received',
			appId: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			inboxId: null,
			payload: {
				message: { id: 'message-1' },
			},
		})

		expect(globalThis.fetch).toHaveBeenCalledTimes(1)
		expect((globalThis.fetch as any).mock.calls[0][0]).toBe(
			'https://example.com/hook',
		)
	})

	it('falls back to safe message payload if enricher throws', async () => {
		mockWebhooksFindMany.mockResolvedValue([
			{
				id: 'webhook-1',
				url: 'https://example.com/hook',
				subscriptions: ['message.received'],
				inbox_id: null,
				secret: null,
				headers: null,
				is_hidden: false,
			},
		])
		mockFormatMessageWebhookPayload.mockRejectedValue(new Error('db timeout'))

		await BusinessWebhookDispatchService.dispatch({
			event: 'message.received',
			appId: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			inboxId: null,
			payload: {
				message: { id: 'message-1' },
			},
		})

		expect(mockBuildMessageWebhookPayloadFallback).toHaveBeenCalledTimes(1)
		expect(globalThis.fetch).toHaveBeenCalledTimes(1)
		const [, requestInit] = (globalThis.fetch as any).mock.calls[0]
		const body = JSON.parse(String(requestInit.body))
		expect(body).toMatchObject({
			webhookUrl: 'https://example.com/hook',
			events: 'message.received',
			payload: {
				object: 'message',
				event_name: 'message.received',
				data: { id: 'fallback-message' },
			},
		})
	})

	it('retries /webhook-test endpoint when /webhook is not registered', async () => {
		mockWebhooksFindMany.mockResolvedValue([
			{
				id: 'webhook-1',
				url: 'https://n8n.example.com/webhook/get-location-branch',
				subscriptions: ['message.received'],
				inbox_id: null,
				secret: null,
				headers: null,
				is_hidden: false,
			},
		])
		mockFormatMessageWebhookPayload.mockResolvedValue({
			id: 'delivery-id',
			object: 'message',
			timestamp: 1775901561,
			event_name: 'message.received',
			data: { id: 'message-1' },
		})
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 404,
				text: async () =>
					'The requested webhook "get-location-branch" is not registered.',
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => '',
			}) as unknown as typeof fetch

		await BusinessWebhookDispatchService.dispatch({
			event: 'message.received',
			appId: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			inboxId: null,
			payload: {
				message: { id: 'message-1' },
			},
		})

		expect(globalThis.fetch).toHaveBeenCalledTimes(2)
		expect((globalThis.fetch as any).mock.calls[0][0]).toBe(
			'https://n8n.example.com/webhook/get-location-branch',
		)
		expect((globalThis.fetch as any).mock.calls[1][0]).toBe(
			'https://n8n.example.com/webhook-test/get-location-branch',
		)
	})
})
