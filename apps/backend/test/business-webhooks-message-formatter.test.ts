import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockMessagesFindUnique = vi.fn()
const mockMessagesFindFirst = vi.fn()
const mockOrganizationFindFirst = vi.fn()
const mockConversationRatingsFindUnique = vi.fn()
const mockWhatsappChannelsFindFirst = vi.fn()
const mockUsersFindMany = vi.fn()

const mockPrisma = {
	messages: {
		findUnique: mockMessagesFindUnique,
		findFirst: mockMessagesFindFirst,
	},
	organization: {
		findFirst: mockOrganizationFindFirst,
	},
	conversation_ratings: {
		findUnique: mockConversationRatingsFindUnique,
	},
	whatsapp_channels: {
		findFirst: mockWhatsappChannelsFindFirst,
	},
	users: {
		findMany: mockUsersFindMany,
	},
}

vi.mock('../src/lib/prisma', () => ({ default: mockPrisma }))

const {
	formatMessageWebhookPayload,
	isMessageWebhookEvent,
	buildMessageWebhookPayloadFallback,
} = await import(
	'../src/modules/business-webhooks/message-event-formatter'
)

beforeEach(() => {
	vi.resetAllMocks()
	mockMessagesFindUnique.mockResolvedValue(null)
	mockMessagesFindFirst.mockResolvedValue(null)
	mockOrganizationFindFirst.mockResolvedValue(null)
	mockConversationRatingsFindUnique.mockResolvedValue(null)
	mockWhatsappChannelsFindFirst.mockResolvedValue(null)
	mockUsersFindMany.mockResolvedValue([])
})

describe('message-event-formatter', () => {
	it('formats message.received using enriched records and required reference fields', async () => {
		mockMessagesFindUnique.mockResolvedValue({
			id: '5f13b8b0-a227-4c53-8f95-2c4a5a85b138',
			conversation_id: 'de93f14c-978b-4ad3-bfe2-462f70196087',
			content: 'Weekend sih cuma aku masih demam',
			content_type: 'text',
			sender_id: 'ccd3e569-0444-4fe2-819e-aff7e9460216',
			sender_type: 'contact',
			status: 'sent',
			external_id: 'wamid.HBgNNjI4...',
			content_attributes: {
				interactive: {
					button_reply: { id: 'btn-1', title: 'Pilih' },
				},
			},
			created_at: new Date('2026-04-11T09:59:20.950Z'),
			app_id: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			conversations: {
				id: 'de93f14c-978b-4ad3-bfe2-462f70196087',
				app_id: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
				inbox_id: '879083bd-ba0e-4fdc-8ddd-3c1479e5b81e',
				contact_id: 'ccd3e569-0444-4fe2-819e-aff7e9460216',
				assignee_id: '11111111-1111-1111-1111-111111111111',
				status: 'open',
				stage_id: null,
				unread_count: 1,
				created_at: new Date('2026-04-11T09:52:45.519Z'),
				resolved_at: null,
				source_id: null,
				messaging_window_opened_at: new Date('2026-04-11T09:52:45.519Z'),
				messaging_window_expires_at: new Date('2026-04-12T09:57:03.695Z'),
				additional_attributes: null,
				contacts: {
					id: 'ccd3e569-0444-4fe2-819e-aff7e9460216',
					name: 'Elen Safitri',
					phone_number: '6289528478050',
					identifier: 'wa:40d6b2db:6289528478050',
				},
				inboxes: {
					id: '879083bd-ba0e-4fdc-8ddd-3c1479e5b81e',
					name: 'SOZO Skin Clinic',
					channel_type: 'whatsapp',
					chatbot_id: '852ab0c1-7667-449c-b9a6-810b23d9d00b',
				},
				conversation_labels: [
					{
						labels: {
							id: '667fb95e-32bc-4815-8663-36419ac67e79',
							title: 'Promo/price',
							color: '#3e0470',
						},
					},
				],
			},
		})
		mockMessagesFindFirst
			.mockResolvedValueOnce({
				content: 'Halo SOZO, saya tertarik promo',
				created_at: new Date('2026-04-11T09:52:45.732Z'),
			})
			.mockResolvedValueOnce({
				content: 'Weekend sih cuma aku masih demam',
				created_at: new Date('2026-04-11T09:59:20.954Z'),
			})
		mockOrganizationFindFirst.mockResolvedValue({
			id: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
		})
		mockConversationRatingsFindUnique.mockResolvedValue(null)
		mockWhatsappChannelsFindFirst.mockResolvedValue({
			waba_id: '630892640079269',
			phone_number: '6285191645448',
			display_phone_number: '6285191645448',
		})
		mockUsersFindMany.mockResolvedValue([
			{
				id: '11111111-1111-1111-1111-111111111111',
				name: 'Agent SOZO',
			},
		])

		const body = await formatMessageWebhookPayload({
			deliveryId: 'c2ca3edd-afef-4764-8693-def68dc3441a',
			eventName: 'message.received',
			appId: '40d6b2db-b46c-42b9-9ae2-02c9271d22cc',
			inboxId: '879083bd-ba0e-4fdc-8ddd-3c1479e5b81e',
			payload: {
				message: { id: '5f13b8b0-a227-4c53-8f95-2c4a5a85b138' },
			},
			dispatchedAt: new Date('2026-04-11T10:00:00.000Z'),
		})

		expect(body).toMatchObject({
			id: 'c2ca3edd-afef-4764-8693-def68dc3441a',
			object: 'message',
			timestamp: 1775901600,
			event_name: 'message.received',
		})
		expect(body).not.toHaveProperty('event')
		expect(body).not.toHaveProperty('payload')

		const data = (body as any).data
		expect(data.id).toBe('5f13b8b0-a227-4c53-8f95-2c4a5a85b138')
		expect(data.sent_by_type).toBe('user')
		expect(data.platform_mid).toBe('wamid.HBgNNjI4...')
		expect(data.interactive).toEqual({
			button_reply: { id: 'btn-1', title: 'Pilih' },
		})
		expect(data.business_id).toBe('40d6b2db-b46c-42b9-9ae2-02c9271d22cc')
		expect(data.conversation.labels).toEqual([
			{
				id: '667fb95e-32bc-4815-8663-36419ac67e79',
				color: '#3e0470',
				label_name: 'Promo/price',
			},
		])
		expect(data.conversation.inbox_phone).toBe('6285191645448')
		expect(data.conversation.inbox_waba_id).toBe('630892640079269')
		expect(data.conversation.handled_by_name).toBe('Agent SOZO')
		expect(data.conversation.cd.rating).toBeNull()
	})

	it('keeps full structure and null-safe fallback when source records are missing', async () => {
		const body = await formatMessageWebhookPayload({
			deliveryId: '33b75d42-725e-4ebb-9f95-f1d8899545b3',
			eventName: 'message.sent',
			appId: 'app-fallback',
			inboxId: 'inbox-fallback',
			payload: {
				message: {
					id: 'msg-fallback',
					content: 'fallback payload',
					content_type: 'text',
					status: 'sent',
					sender_type: 'custom_sender',
					created_at: '2026-04-11T10:00:00.000Z',
				},
				conversation: {
					id: 'conv-fallback',
					inbox_id: 'inbox-fallback',
					labels: [{ id: 'label-a', label_name: 'Ads', color: '#0017fe' }],
				},
				contact: {
					id: 'contact-fallback',
					name: 'Fallback Contact',
					phone_number: '628000000000',
				},
			},
			dispatchedAt: new Date('2026-04-11T10:01:00.000Z'),
		})

		expect((body as any).data.business_id).toBe('app-fallback')
		expect((body as any).data.sent_by_type).toBe('custom_sender')
		expect((body as any).data.conversation.labels).toEqual([
			{ id: 'label-a', color: '#0017fe', label_name: 'Ads' },
		])
		expect((body as any).data.conversation.cd.rating).toBeNull()
		expect((body as any).data.conversation.additional_data).toEqual({})
		expect((body as any).data.conversation.unreplied_msg_count).toBe(0)
		expect((body as any).data.conversation.message_last_content).toBe(
			'fallback payload',
		)
	})

	it('recognizes only message events for hard-switch formatter', () => {
		expect(isMessageWebhookEvent('message.received')).toBe(true)
		expect(isMessageWebhookEvent('message.sent')).toBe(true)
		expect(isMessageWebhookEvent('conversation.created')).toBe(false)
	})

	it('builds fallback payload without DB access and keeps complete schema', () => {
		const body = buildMessageWebhookPayloadFallback({
			deliveryId: 'e2ffde4d-1f12-4faf-a6fd-fdb32dd934f2',
			eventName: 'message.received',
			appId: 'app-fallback',
			inboxId: 'inbox-fallback',
			payload: {
				message: {
					id: 'msg-1',
					content: 'hello',
					content_type: 'text',
					sender_type: 'contact',
					created_at: '2026-04-11T10:00:00.000Z',
				},
				conversation: {
					id: 'conv-1',
					inbox_id: 'inbox-fallback',
					unreplied_msg_count: '4',
					additional_data: { source: 'payload-only' },
				},
				contact: {
					id: 'contact-1',
					name: 'Payload Contact',
					phone_number: '628111111111',
				},
			},
			dispatchedAt: new Date('2026-04-11T10:05:00.000Z'),
		})

		expect(body).toMatchObject({
			id: 'e2ffde4d-1f12-4faf-a6fd-fdb32dd934f2',
			object: 'message',
			event_name: 'message.received',
		})
		expect((body as any).data.sent_by_type).toBe('user')
		expect((body as any).data.conversation.unreplied_msg_count).toBe(4)
		expect((body as any).data.conversation.additional_data).toEqual({
			source: 'payload-only',
		})
		expect((body as any).data.conversation.cd.last_session_status).toBe('open')
	})
})
