import { beforeEach, describe, expect, it, vi } from 'bun:test'

const fetchMock = vi.fn()
globalThis.fetch = fetchMock as unknown as typeof fetch

const mockSendWhatsAppMessage = vi.fn()

vi.mock('bullmq', () => ({
	Worker: class Worker {},
}))
vi.mock('../src/lib/meta-api', () => ({
	sendWhatsAppMessage: mockSendWhatsAppMessage,
	sendInstagramMessage: vi.fn(),
}))
vi.mock('../src/lib/tiktok-api', () => ({
	sendTikTokMessage: vi.fn(),
}))
vi.mock('../src/lib/prisma', () => ({
	default: {},
}))
vi.mock('../src/lib/realtime-emitter', () => ({
	emitRealtimeToRoom: vi.fn(),
}))
vi.mock('../src/lib/queue', () => ({
	maintenanceQueue: { add: vi.fn() },
	outboundMessageQueue: { add: vi.fn() },
	webhookQueue: { add: vi.fn() },
}))
vi.mock('../src/lib/redis', () => ({
	redis: {},
}))
vi.mock('../src/modules/chatbot/followup-service', () => ({
	ChatbotFollowupService: {},
}))
vi.mock('../src/modules/chatbot/response-log-service', () => ({
	AIResponseLogService: {},
}))
vi.mock('../src/modules/instagram/service', () => ({
	InstagramService: {},
}))
vi.mock('../src/modules/business-webhooks/dispatch-service', () => ({
	BusinessWebhookDispatchService: {},
}))
vi.mock('../src/modules/knowledge/indexing-service', () => ({
	KnowledgeIndexService: {},
}))
vi.mock('../src/modules/webhook/service', () => ({
	WebhookService: {},
}))
vi.mock('../src/modules/conversation/bulk-service', () => ({
	ConversationBulkEditService: {},
}))
vi.mock('../src/modules/broadcast/service', () => ({
	resolveBroadcastAudience: vi.fn(),
}))

const { __test__ } = await import('../src/workers/index')

describe('workers WhatsApp provider dispatch', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		fetchMock.mockReset()
		mockSendWhatsAppMessage.mockReset()
	})

	it('uses Meta Graph API for official WhatsApp channels', async () => {
		mockSendWhatsAppMessage.mockResolvedValue({
			messages: [{ id: 'wamid.official.1' }],
		})

		const result = await __test__.dispatchWhatsAppProviderSend({
			provider: 'whatsapp_cloud',
			phoneNumberId: '123456',
			apiKey: 'meta-token',
			to: '6281234567890',
			content: 'Halo dari official',
			contentAttributes: { type: 'text' },
			type: 'text',
			messageId: 'msg-official-1',
		})

		expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
		expect(fetchMock).not.toHaveBeenCalled()
		expect(mockSendWhatsAppMessage).toHaveBeenCalledWith({
			phoneNumberId: '123456',
			to: '6281234567890',
			content: 'Halo dari official',
			apiKey: 'meta-token',
			type: 'text',
			components: undefined,
			templateLanguage: undefined,
			replyToWamid: undefined,
			interactive: undefined,
			media: undefined,
		})
		expect(result).toEqual({
			provider: 'whatsapp_cloud',
			externalId: 'wamid.official.1',
		})
	})

	it('uses the Baileys bridge webhook for non-official channels', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({ externalId: 'baileys-msg-1' }),
		})

		const result = await __test__.dispatchWhatsAppProviderSend({
			provider: 'baileys',
			apiKey: 'bridge-secret',
			providerChannelKey: 'session-sales-1',
			providerWebhookUrl: 'https://bridge.example.com/opencrm/outbound',
			to: '6281234567890',
			content: 'promo_template',
			contentAttributes: {
				type: 'template',
				template_preview_text: 'Halo Kak, ini promo terbaru kami.',
			},
			type: 'template',
			messageId: 'msg-baileys-1',
		})

		expect(mockSendWhatsAppMessage).not.toHaveBeenCalled()
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('https://bridge.example.com/opencrm/outbound')
		expect(init.method).toBe('POST')
		expect(init.headers).toMatchObject({
			'Content-Type': 'application/json',
			Authorization: 'Bearer bridge-secret',
			'X-OpenCRM-Channel-Secret': 'bridge-secret',
		})
		expect(JSON.parse(String(init.body))).toEqual({
			event: 'message.send',
			channelKey: 'session-sales-1',
			recipientWhatsAppId: '6281234567890',
			messageId: 'msg-baileys-1',
			type: 'text',
			text: {
				body: 'Halo Kak, ini promo terbaru kami.',
			},
		})
		expect(result).toEqual({
			provider: 'baileys',
			externalId: 'baileys-msg-1',
		})
	})

	it('passes the resolved Baileys recipient JID through the bridge payload', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({ externalId: 'baileys-msg-2' }),
		})

		await __test__.dispatchWhatsAppProviderSend({
			provider: 'baileys',
			apiKey: 'bridge-secret',
			providerChannelKey: 'session-sales-1',
			providerWebhookUrl: 'https://bridge.example.com/opencrm/outbound',
			to: '186732343513187',
			recipientJid: '186732343513187@lid',
			recipientAddressingMode: 'lid',
			content: 'Halo dari AI',
			contentAttributes: { type: 'text' },
			type: 'text',
			messageId: 'msg-baileys-2',
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [, init] = fetchMock.mock.calls[0]
		expect(JSON.parse(String(init.body))).toEqual({
			event: 'message.send',
			channelKey: 'session-sales-1',
			recipientWhatsAppId: '186732343513187@lid',
			recipientJid: '186732343513187@lid',
			recipientAddressingMode: 'lid',
			messageId: 'msg-baileys-2',
			type: 'text',
			text: {
				body: 'Halo dari AI',
			},
		})
	})
})
