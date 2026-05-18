import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockQueryRaw = vi.fn()
const mockConversationsFindUnique = vi.fn()
const mockConversationsUpdate = vi.fn()
const mockMessagesFindMany = vi.fn()
const mockMessagesFindFirst = vi.fn()
const mockUsersFindFirst = vi.fn()
const mockAssignAgent = vi.fn()
const mockSendMessage = vi.fn()
const mockGetChatbotById = vi.fn()
const mockGenerateAgentReply = vi.fn()
const mockAiResponseLogCreate = vi.fn()
const mockAiResponseLogAttachMessageIds = vi.fn()
const mockMaintenanceQueueAdd = vi.fn()

const mockPrisma = {
	$queryRaw: mockQueryRaw,
	conversations: {
		findUnique: mockConversationsFindUnique,
		update: mockConversationsUpdate,
	},
	messages: {
		findMany: mockMessagesFindMany,
		findFirst: mockMessagesFindFirst,
	},
	users: {
		findFirst: mockUsersFindFirst,
	},
}

vi.mock('../src/lib/prisma', () => ({
	default: mockPrisma,
}))
vi.mock('../src/modules/conversation/service', () => ({
	ConversationService: {
		assignAgent: mockAssignAgent,
	},
}))
vi.mock('../src/modules/message/service', () => ({
	MessageService: {
		sendMessage: mockSendMessage,
	},
}))
vi.mock('../src/modules/chatbot/service', () => ({
	ChatbotService: {
		getChatbotById: mockGetChatbotById,
		generateAgentReply: mockGenerateAgentReply,
	},
}))
vi.mock('../src/modules/chatbot/response-log-service', () => ({
	AIResponseLogService: {
		create: mockAiResponseLogCreate,
		attachMessageIds: mockAiResponseLogAttachMessageIds,
	},
}))
vi.mock('../src/lib/queue', () => ({
	maintenanceQueue: {
		add: mockMaintenanceQueueAdd,
	},
}))

const { ChatbotFollowupService, __test__ } = await import(
	'../src/modules/chatbot/followup-service'
)

describe('ChatbotFollowupService helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks()

		mockQueryRaw.mockResolvedValue([])
		mockConversationsFindUnique.mockResolvedValue({ additional_attributes: {} })
		mockConversationsUpdate.mockResolvedValue({})
		mockMessagesFindMany.mockResolvedValue([])
		mockMessagesFindFirst.mockResolvedValue(null)
		mockUsersFindFirst.mockResolvedValue(null)
		mockGetChatbotById.mockResolvedValue(null)
		mockGenerateAgentReply.mockResolvedValue({
			content: '',
			meta: {},
		})
		mockSendMessage.mockResolvedValue({ id: 'message-1' })
		mockAiResponseLogCreate.mockResolvedValue({ logId: 'log-1' })
		mockAiResponseLogAttachMessageIds.mockResolvedValue(undefined)
		mockMaintenanceQueueAdd.mockResolvedValue(undefined)
	})

	it('normalizes and filters follow-up rules from saved payload', () => {
		const rules = __test__.normalizeFollowupRules([
			{
				id: 'rule-1',
				prompt: ' Halo, kami follow up ya ',
				time_interval: 30,
				is_in_bot_reply: true,
				options: {
					handoff: true,
					send_exact: false,
				},
			},
			{
				id: 'rule-2',
				prompt: 'Rule inactive',
				time_interval: 10,
				is_in_bot_reply: false,
			},
			{
				id: 'rule-3',
				prompt: 'Rule interval invalid',
				time_interval: 0,
				is_in_bot_reply: true,
				options: {
					handoff: '1',
					send_exact: '1',
				},
			},
		])

		expect(rules).toHaveLength(2)
		expect(rules[0]).toEqual({
			id: 'rule-1',
			prompt: 'Halo, kami follow up ya',
			timeIntervalMinutes: 30,
			isActive: true,
			options: {
				handoff: true,
				sendExact: false,
			},
		})
		expect(rules[1]).toEqual({
			id: 'rule-3',
			prompt: 'Rule interval invalid',
			timeIntervalMinutes: 60,
			isActive: true,
			options: {
				handoff: true,
				sendExact: true,
			},
		})
	})

	it('parses persisted follow-up runtime state', () => {
		const state = __test__.parseFollowupState({
			chatbot_id: 'chatbot-1',
			next_rule_index: '2',
			next_due_at: '2026-04-12T10:00:00.000Z',
			anchor_at: '2026-04-12T09:00:00.000Z',
			last_sent_at: '2026-04-12T09:30:00.000Z',
		})

		expect(state).toEqual({
			chatbot_id: 'chatbot-1',
			next_rule_index: 2,
			next_due_at: '2026-04-12T10:00:00.000Z',
			anchor_at: '2026-04-12T09:00:00.000Z',
			last_sent_at: '2026-04-12T09:30:00.000Z',
			updated_at: expect.any(String),
		})
	})

	it('returns null when persisted follow-up state is incomplete', () => {
		expect(
			__test__.parseFollowupState({
				chatbot_id: 'chatbot-1',
				anchor_at: '2026-04-12T09:00:00.000Z',
			}),
		).toBeNull()
	})

	it('parses boolean-like values consistently', () => {
		expect(__test__.asBoolean('true')).toBe(true)
		expect(__test__.asBoolean('active')).toBe(true)
		expect(__test__.asBoolean('false')).toBe(false)
		expect(__test__.asBoolean('inactive')).toBe(false)
		expect(__test__.asBoolean('unknown', true)).toBe(true)
	})

	it('extracts full assistant follow-up text by combining timeline text blocks', () => {
		const extracted = __test__.extractAssistantTextFromReply({
			content: null,
			preview: {
				timeline: [
					{ type: 'status', text: 'Successfully executed tool calls' },
					{ type: 'text', content: 'Halo Kak 😊' },
					{
						type: 'text',
						content:
							'Kakak juga bisa mendapatkan voucher treatment 50K + konsultasi dokter gratis loh.',
					},
					{
						type: 'text',
						content:
							'Kakak lebih nyaman datang di weekend atau weekdays nih kak?',
					},
				],
			},
		})

		expect(extracted).toBe(
			[
				'Halo Kak 😊',
				'Kakak juga bisa mendapatkan voucher treatment 50K + konsultasi dokter gratis loh.',
				'Kakak lebih nyaman datang di weekend atau weekdays nih kak?',
			].join('\n\n'),
		)
	})

	it('falls back to reply content when timeline has no text block', () => {
		const extracted = __test__.extractAssistantTextFromReply({
			content: 'Fallback content',
			preview: {
				timeline: [{ type: 'status', text: 'Only status' }],
			},
		})

		expect(extracted).toBe('Fallback content')
	})

	it('splits follow-up text into text+image segments for markdown and plain image URLs', () => {
		const segments = __test__.splitTextIntoFollowupSegments(
			[
				'Halo Kak 😊',
				'✨ Acne & Bekas Jerawat',
				'![Acne Promo](https://files.cekat.ai/acne_promo.jpg)',
				'✨ Skin Treatment https://files.cekat.ai/skin_promo.png',
				'Penutup followup',
			].join('\n'),
		)

		expect(segments.map((item: any) => item.type)).toEqual([
			'text',
			'image',
			'text',
			'image',
			'text',
		])
		expect(segments[0]?.content).toContain('Halo Kak 😊')
		expect(segments[0]?.content).toContain('✨ Acne & Bekas Jerawat')
		expect(segments[1]).toEqual({
			type: 'image',
			url: 'https://files.cekat.ai/acne_promo.jpg',
		})
		expect(segments[2]).toEqual({
			type: 'text',
			content: '✨ Skin Treatment',
		})
		expect(segments[3]).toEqual({
			type: 'image',
			url: 'https://files.cekat.ai/skin_promo.png',
		})
		expect(segments[4]).toEqual({
			type: 'text',
			content: 'Penutup followup',
		})
	})

	it('splits markdown image with optional whitespace between ] and (', () => {
		const segments = __test__.splitTextIntoFollowupSegments(
			'Berikut detail:\n![Harga IPL Glow] (https://files.cekat.ai/ipl_glow.jpg)',
		)

		expect(segments).toEqual([
			{ type: 'text', content: 'Berikut detail:' },
			{ type: 'image', url: 'https://files.cekat.ai/ipl_glow.jpg' },
		])
	})

	it('treats files.cekat.ai URL without extension as image segment', () => {
		const segments = __test__.splitTextIntoFollowupSegments(
			[
				'✨ Skin Treatment',
				'https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April_G2elX',
			].join('\n'),
		)

		expect(segments).toEqual([
			{ type: 'text', content: '✨ Skin Treatment' },
			{
				type: 'image',
				url: 'https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April_G2elX',
			},
		])
	})

	it('extractAssistantSegmentsFromReply keeps timeline order and converts image links in text to image segments', () => {
		const segments = __test__.extractAssistantSegmentsFromReply({
			content: null,
			preview: {
				timeline: [
					{ type: 'text', content: 'Halo Kak 😊' },
					{
						type: 'text',
						content:
							'✨ Acne & Bekas Jerawat https://files.cekat.ai/acne_followup.jpg',
					},
					{
						type: 'image',
						url: 'https://files.cekat.ai/skin_followup.png',
					},
					{ type: 'text', content: 'Mau aku bantu booking?' },
				],
			},
		})

		expect(segments).toEqual([
			{ type: 'text', content: 'Halo Kak 😊\n\n✨ Acne & Bekas Jerawat' },
			{ type: 'image', url: 'https://files.cekat.ai/acne_followup.jpg' },
			{ type: 'image', url: 'https://files.cekat.ai/skin_followup.png' },
			{ type: 'text', content: 'Mau aku bantu booking?' },
		])
	})

	it('sanitizeFollowupSegmentsForDelivery keeps image segments by default', () => {
		const sanitized = __test__.sanitizeFollowupSegmentsForDelivery([
			{ type: 'text', content: 'Halo Kak 😊' },
			{ type: 'image', url: 'https://files.cekat.ai/acne_followup.jpg' },
			{ type: 'text', content: 'Mau aku bantu booking?' },
		])

		expect(sanitized).toEqual([
			{ type: 'text', content: 'Halo Kak 😊' },
			{ type: 'image', url: 'https://files.cekat.ai/acne_followup.jpg' },
			{ type: 'text', content: 'Mau aku bantu booking?' },
		])
	})

	it('toTextOnlyFollowupContent strips image markdown and plain image URL tokens', () => {
		const textOnly = __test__.toTextOnlyFollowupContent(
			[
				'Halo Kak 😊',
				'![Promo](https://files.cekat.ai/acne_followup.jpg)',
				'Detail treatment https://files.cekat.ai/skin_followup.png',
				'Mau aku bantu booking?',
			].join('\n'),
		)

		expect(textOnly).toBe(
			['Halo Kak 😊', 'Detail treatment', 'Mau aku bantu booking?'].join(
				'\n\n',
			),
		)
	})

	it('falls back to exact prompt segments when generated reply misses prompt images', () => {
		const shouldFallback = __test__.shouldFallbackToPromptSegments({
			promptSegments: [
				{ type: 'text', content: '✨ Acne & Bekas Jerawat' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
				{ type: 'text', content: '✨ Skin Treatment' },
				{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
			],
			generatedSegments: [
				{ type: 'text', content: 'Promo hari ini ya kak' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
			],
		})

		expect(shouldFallback).toBe(true)
	})

	it('keeps generated segments when all prompt images are preserved', () => {
		const shouldFallback = __test__.shouldFallbackToPromptSegments({
			promptSegments: [
				{ type: 'text', content: '✨ Acne & Bekas Jerawat' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
				{ type: 'text', content: '✨ Skin Treatment' },
				{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
			],
			generatedSegments: [
				{ type: 'text', content: 'Promo hari ini ya kak' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
				{ type: 'text', content: 'Lanjut skin treatment' },
				{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
			],
		})

		expect(shouldFallback).toBe(false)
	})

	it('detects instructional follow-up prompts', () => {
		expect(
			__test__.isInstructionalFollowupPrompt(
				'Jika customer sudah tanya promo lalu menghilang maka kirimkan followup: {Halo Kak}',
			),
		).toBe(true)
		expect(
			__test__.isInstructionalFollowupPrompt(
				'Halo Kak, kami follow up ya. Kakak lebih nyaman weekend atau weekday?',
			),
		).toBe(false)
	})

	it('removes internal rule text from instructional follow-up output', () => {
		const cleaned = __test__.sanitizeInstructionalTextForDelivery(
			[
				'Jika customer sudah tanya promo lalu menghilang maka kirimkan followup:',
				'{Halo Kak 😊',
				'Ini beberapa treatment yang lagi promo hari ini',
				'}',
			].join('\n'),
		)

		expect(cleaned).toBe(
			['Halo Kak 😊', 'Ini beberapa treatment yang lagi promo hari ini'].join(
				'\n',
			),
		)
	})

	it('parseInstructionalFollowupVariants extracts condition-message blocks', () => {
		const variants = __test__.parseInstructionalFollowupVariants(
			[
				'Customer tanya promo lalu menghilang :',
				'{Halo Kak, promo masih available 😊}',
				'Customer tanya lokasi cabang lalu menghilang :',
				'{Halo Kak, mau aku bantu carikan cabang terdekat?}',
			].join('\n'),
		)

		expect(variants).toEqual([
			{
				condition: 'Customer tanya promo lalu menghilang',
				message: 'Halo Kak, promo masih available 😊',
			},
			{
				condition: 'Customer tanya lokasi cabang lalu menghilang',
				message: 'Halo Kak, mau aku bantu carikan cabang terdekat?',
			},
		])
	})

	it('resolveFollowupPromptForConversationContext picks variant that matches latest context', () => {
		const prompt = [
			'Customer tanya promo lalu menghilang :',
			'{Halo Kak, promo masih available 😊}',
			'Customer tanya lokasi cabang lalu menghilang :',
			'{Halo Kak, mau aku bantu carikan cabang terdekat?}',
		].join('\n')

		const resolved = __test__.resolveFollowupPromptForConversationContext({
			rulePrompt: prompt,
			history: [
				{
					role: 'assistant',
					content: 'Kalau boleh tahu, Kakak berdomisili di mana?',
				},
				{
					role: 'user',
					content: 'Di Jakarta Timur',
				},
			],
			conversationTreatment: null,
		})

		expect(resolved).toBe('Halo Kak, mau aku bantu carikan cabang terdekat?')
	})

	it('falls back to generic follow-up when the only user message is an ads lead opener', () => {
		const prompt = [
			'Customer hanya click ads atau hanya chat satu kali :',
			'{Halo Kak, voucher masih bisa dipakai kalau booking hari ini ya 😊}',
			'Customer tanya treatment lalu menghilang :',
			'{Halo Kak, treatment yang Kakak tanyakan masih available 😊}',
			'Customer tanya promo lalu menghilang :',
			'{Halo Kak, promo masih available 😊}',
		].join('\n')

		const resolved = __test__.resolveFollowupPromptForConversationContext({
			rulePrompt: prompt,
			history: [
				{
					role: 'user',
					content: 'Halo Sozo, saya tertarik promo IPL Acne',
				},
			],
			conversationTreatment: 'IPL Acne',
		})

		expect(resolved).toBe(
			'Halo Kak, voucher masih bisa dipakai kalau booking hari ini ya 😊',
		)
	})

	it('uses latest assistant location question to select branch-location follow-up', () => {
		const prompt = [
			'Customer hanya click ads atau hanya chat satu kali :',
			'{Halo Kak, voucher masih bisa dipakai kalau booking hari ini ya 😊}',
			'Customer tanya lokasi cabang lalu menghilang :',
			'{Halo Kak, mau aku bantu carikan cabang terdekat?}',
			'Customer tanya promo lalu menghilang :',
			'{Halo Kak, promo masih available 😊}',
		].join('\n')

		const resolved = __test__.resolveFollowupPromptForConversationContext({
			rulePrompt: prompt,
			history: [
				{
					role: 'user',
					content: 'Halo Sozo, saya tertarik promo PRP Hair',
				},
				{
					role: 'assistant',
					content:
						'Kalau boleh tahu, Kakak berdomisili di mana? Nanti saya bantu carikan cabang terdekat.',
				},
			],
			conversationTreatment: 'PRP Hair',
		})

		expect(resolved).toBe('Halo Kak, mau aku bantu carikan cabang terdekat?')
	})

	it('merges only missing prompt images into generated segments', () => {
		const merged = __test__.mergeMissingPromptImagesIntoGeneratedSegments({
			promptSegments: [
				{ type: 'text', content: '✨ Acne & Bekas Jerawat' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
				{ type: 'text', content: '✨ Skin Treatment' },
				{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
			],
			generatedSegments: [
				{ type: 'text', content: 'Halo Kak 😊' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
			],
		})

		expect(merged).toEqual([
			{ type: 'text', content: 'Halo Kak 😊' },
			{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
			{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
		])
	})

	it('preserves prompt images when generated follow-up becomes text-only', () => {
		const preserved = __test__.preservePromptImagesInSegments({
			promptSegments: [
				{ type: 'text', content: '✨ Acne & Bekas Jerawat' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
				{ type: 'text', content: '✨ Skin Treatment' },
				{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
			],
			followupSegments: [
				{
					type: 'text',
					content:
						'Halo Kak 😊\n\nAku izin share ya kak, beberapa treatment yang lagi paling diminati.',
				},
			],
		})

		expect(preserved.appendedCount).toBe(2)
		expect(preserved.segments).toEqual([
			{
				type: 'text',
				content:
					'Halo Kak 😊\n\nAku izin share ya kak, beberapa treatment yang lagi paling diminati.',
			},
			{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
			{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
		])
	})

	it('does not duplicate prompt images that are already present in generated segments', () => {
		const preserved = __test__.preservePromptImagesInSegments({
			promptSegments: [
				{ type: 'text', content: '✨ Acne & Bekas Jerawat' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
				{ type: 'text', content: '✨ Skin Treatment' },
				{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
			],
			followupSegments: [
				{ type: 'text', content: 'Halo Kak 😊' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
				{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
			],
		})

		expect(preserved.appendedCount).toBe(0)
		expect(preserved.segments).toEqual([
			{ type: 'text', content: 'Halo Kak 😊' },
			{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
			{ type: 'image', url: 'https://files.cekat.ai/skin.jpg' },
		])
	})

	it('enforcePromptImagePolicy keeps images when rule prompt explicitly includes image URL', () => {
		const enforced = __test__.enforcePromptImagePolicy({
			promptSegments: [
				{ type: 'text', content: '✨ Acne & Bekas Jerawat' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
			],
			generatedSegments: [
				{ type: 'text', content: 'Promo hari ini ya kak' },
				{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
			],
		})

		expect(enforced).toEqual([
			{ type: 'text', content: 'Promo hari ini ya kak' },
			{ type: 'image', url: 'https://files.cekat.ai/acne.jpg' },
		])
	})

	it('infers recent treatment context from latest relevant history message', () => {
		const inferred = __test__.inferRecentConversationTreatment([
			{ role: 'user', content: 'Halo kak' },
			{
				role: 'assistant',
				content:
					'Untuk Acne Laser Facial, saat ini harganya Rp 749.000 ya Kak.',
			},
			{ role: 'user', content: 'oke kak noted' },
		])

		expect(inferred).toBe('Acne Laser Facial')
	})

	it('drops mismatched follow-up segments when treatment context is locked', () => {
		const scoped = __test__.alignSegmentsToTreatmentContext({
			contextTreatment: 'Acne Laser Facial',
			segments: [
				{ type: 'text', content: 'Halo Kak, aku follow up ya.' },
				{
					type: 'text',
					content: 'Untuk Ipl Acne, saat ini harganya Rp 199.000 ya Kak.',
				},
				{
					type: 'image',
					url: 'https://files.cekat.ai/IPL_Acne_-_Flash_sale_DQXFEQ.png',
				},
			],
		})

		expect(scoped.hadTreatmentSignals).toBe(true)
		expect(scoped.droppedCount).toBe(2)
		expect(scoped.segments).toEqual([
			{ type: 'text', content: 'Halo Kak, aku follow up ya.' },
		])
	})

	it('keeps matching treatment segments when context matches', () => {
		const scoped = __test__.alignSegmentsToTreatmentContext({
			contextTreatment: 'Acne Laser Facial',
			segments: [
				{
					type: 'text',
					content: 'Untuk Acne Laser Facial, harganya Rp 749.000 ya Kak.',
				},
				{
					type: 'image',
					url: 'https://files.cekat.ai/Flash_Sale_Nov_Acne_Laser_Facial__FY5NaS.png',
				},
			],
		})

		expect(scoped.droppedCount).toBe(0)
		expect(scoped.segments).toEqual([
			{
				type: 'text',
				content: 'Untuk Acne Laser Facial, harganya Rp 749.000 ya Kak.',
			},
			{
				type: 'image',
				url: 'https://files.cekat.ai/Flash_Sale_Nov_Acne_Laser_Facial__FY5NaS.png',
			},
		])
	})

	it('detects leaked internal knowledge scaffolding in generated follow-up text', () => {
		expect(
			__test__.hasFollowupPromptLeakage(
				[
					'Halo, saya New Sales Migration (vKR).',
					'Berdasarkan knowledge "Core Identity", berikut informasinya:',
					'1. Jika casenya adalah customer belum ada uang...',
				].join('\n\n'),
			),
		).toBe(true)
	})

	it('rejects generated follow-up segments when leakage markers are present', () => {
		const shouldReject = __test__.shouldRejectGeneratedFollowupSegments([
			{
				type: 'text',
				content:
					'Halo, saya New Sales Migration (vKR).\n\nBerdasarkan knowledge "Core Identity", berikut informasinya:',
			},
		])

		expect(shouldReject).toBe(true)
	})

	it('processDueConversation skips sending when the same follow-up rule was already delivered', async () => {
		const conversationId = '11111111-1111-4111-8111-111111111111'
		const chatbotId = '22222222-2222-4222-8222-222222222222'
		const appId = '33333333-3333-4333-8333-333333333333'
		const state = {
			chatbot_id: chatbotId,
			next_rule_index: 0,
			next_due_at: '2026-04-14T14:00:00.000Z',
			anchor_at: '2026-04-14T13:55:00.000Z',
			last_sent_at: null,
			updated_at: '2026-04-14T13:55:00.000Z',
		}

		mockConversationsFindUnique
			.mockResolvedValueOnce({
				id: conversationId,
				app_id: appId,
				inbox_id: null,
				assignee_id: null,
				status: 'open',
				additional_attributes: {
					chatbot_followup: state,
				},
				inboxes: {
					chatbot_id: chatbotId,
					channel_config: {},
				},
			})
			.mockResolvedValueOnce({
				additional_attributes: {
					chatbot_followup: state,
				},
			})
		mockGetChatbotById.mockResolvedValue({
			id: chatbotId,
			app_id: appId,
			name: 'SOZO Bot',
			watcher_enabled: true,
			plugin_data: {},
			ai_followups: [
				{
					id: 'rule-1',
					prompt: 'Halo Kak, aku follow up ya.',
					time_interval: 5,
					is_in_bot_reply: true,
					options: {
						handoff: false,
						send_exact: true,
					},
				},
			],
		})
		mockQueryRaw
			.mockResolvedValueOnce([{ id: conversationId }])
			.mockResolvedValueOnce([{ id: 'existing-followup-message' }])

		const result = await ChatbotFollowupService.processDueConversation(
			conversationId,
		)

		expect(result).toBe(false)
		expect(mockSendMessage).not.toHaveBeenCalled()
		expect(mockConversationsUpdate).toHaveBeenCalledTimes(1)
		expect(
			mockConversationsUpdate.mock.calls[0]?.[0]?.data?.additional_attributes,
		).toEqual({})
	})

	it('scheduleFromAiReply queues a delayed maintenance dispatch for the next due follow-up', async () => {
		const conversationId = '11111111-1111-4111-8111-111111111111'
		const chatbotId = '22222222-2222-4222-8222-222222222222'
		const appId = '33333333-3333-4333-8333-333333333333'

		mockConversationsFindUnique.mockResolvedValue({
			additional_attributes: {},
		})
		mockGetChatbotById.mockResolvedValue({
			id: chatbotId,
			app_id: appId,
			name: 'SOZO Bot',
			watcher_enabled: true,
			plugin_data: {},
			ai_followups: [
				{
					id: 'rule-1',
					prompt: 'Halo Kak, aku follow up ya.',
					time_interval: 5,
					is_in_bot_reply: true,
					options: {
						handoff: false,
						send_exact: true,
					},
				},
			],
		})

		await ChatbotFollowupService.scheduleFromAiReply({
			conversationId,
			appId,
			chatbotId,
		})

		expect(mockConversationsUpdate).toHaveBeenCalledTimes(1)
		expect(mockMaintenanceQueueAdd).toHaveBeenCalledTimes(1)
		expect(mockMaintenanceQueueAdd).toHaveBeenCalledWith(
			'dispatch-chatbot-followups',
			expect.objectContaining({
				conversationId,
				source: 'chatbot_followup_schedule',
			}),
			expect.objectContaining({
				delay: expect.any(Number),
				jobId: expect.stringContaining(conversationId),
				removeOnComplete: 500,
				removeOnFail: 500,
			}),
		)
	})
})
