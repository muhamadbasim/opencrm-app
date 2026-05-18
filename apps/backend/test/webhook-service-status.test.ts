import { describe, expect, it, vi } from 'bun:test'

vi.mock('../src/lib/prisma', () => ({
	default: {},
}))
vi.mock('../src/lib/queue', () => ({
	webhookQueue: {},
	maintenanceQueue: {},
}))
vi.mock('../src/lib/realtime', () => ({
	getRealtimeIO: () => null,
}))
vi.mock('../src/modules/chatbot/service', () => ({
	ChatbotService: {},
}))
vi.mock('../src/modules/chatbot/followup-service', () => ({
	ChatbotFollowupService: {},
}))
vi.mock('../src/modules/flow/runtime-service', () => ({
	FlowRuntimeService: {},
}))
vi.mock('../src/modules/message/service', () => ({
	MessageService: {},
}))
vi.mock('../src/modules/business-webhooks/dispatch-service', () => ({
	BusinessWebhookDispatchService: {},
}))
vi.mock('../src/modules/business-webhooks/constants', () => ({
	BUSINESS_WEBHOOK_EVENTS: {},
}))
vi.mock('../src/lib/s3', () => ({
	s3: {},
	BUCKET_NAME: 'test-bucket',
	buildS3PublicUrl: () => 'https://example.com/file.jpg',
	isS3UploadConfigured: () => false,
}))

const { __test__ } = await import('../src/modules/webhook/service')

describe('WebhookService status timeline helper', () => {
	it('extracts status entries and preserves first-seen order', () => {
		const result = __test__.extractStatusTimelineTexts([
			{ type: 'status', text: 'Successfully executed tool calls' },
			{ type: 'text', content: 'Halo Kak' },
			{ type: 'status', text: 'Successfully labeled conversation with: Promo/price' },
		])

		expect(result).toEqual([
			'Successfully executed tool calls',
			'Successfully labeled conversation with: Promo/price',
		])
	})

	it('deduplicates repeated status text and ignores blank values', () => {
		const result = __test__.extractStatusTimelineTexts([
			{ type: 'status', text: 'Successfully executed tool calls' },
			{ type: 'status', text: 'Successfully executed tool calls' },
			{ type: 'status', text: '   ' },
			{ type: 'status' },
			{ type: 'image', url: 'https://files.cekat.ai/a.jpg' },
		])

		expect(result).toEqual(['Successfully executed tool calls'])
	})

	it('splitAssistantTextForDelivery removes ### delimiters and splits into clean chunks', () => {
		const chunks = __test__.splitAssistantTextForDelivery([
			'###',
			'IPL Acne berfungsi untuk mengeringkan jerawat.',
			'###',
			'Kalau boleh tahu, Kakak domisili di mana?',
		].join('\n'))

		expect(chunks).toEqual([
			'IPL Acne berfungsi untuk mengeringkan jerawat.',
			'Kalau boleh tahu, Kakak domisili di mana?',
		])
	})

	it('splitAssistantTextForDelivery strips leading ### heading marker from a line', () => {
		const chunks = __test__.splitAssistantTextForDelivery(
			'### IPL Acne berfungsi untuk mengeringkan jerawat.',
		)

		expect(chunks).toEqual(['IPL Acne berfungsi untuk mengeringkan jerawat.'])
	})

	it('marks conversation as handed off when assignee is present', () => {
		expect(
			__test__.isConversationHandoffActive({
				assignee_id: '11111111-1111-4111-8111-111111111111',
				additional_attributes: {},
			}),
		).toBe(true)
	})

	it('marks conversation as handed off when handoff flag is set in additional attributes', () => {
		expect(
			__test__.isConversationHandoffActive({
				assignee_id: null,
				additional_attributes: {
					ai_handoff_active: 'true',
				},
			}),
		).toBe(true)
		expect(
			__test__.isConversationHandoffActive({
				assignee_id: null,
				additional_attributes: {
					human_handoff_active: true,
				},
			}),
		).toBe(true)
	})

	it('keeps chatbot active when no assignee and no handoff flag', () => {
		expect(
			__test__.isConversationHandoffActive({
				assignee_id: null,
				additional_attributes: {},
			}),
		).toBe(false)
		expect(__test__.isConversationHandoffActive(null)).toBe(false)
	})

})
