import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockConversationFindMany = vi.fn()
const mockConversationCount = vi.fn()
const mockAutomationFlowFindMany = vi.fn()
const mockResolveAppId = vi.fn()
const mockGetAllowedChannelTypesForUser = vi.fn()

vi.mock('../src/lib/prisma', () => ({
	default: {
		conversations: {
			findMany: mockConversationFindMany,
			count: mockConversationCount,
		},
		automation_flows: {
			findMany: mockAutomationFlowFindMany,
		},
	},
}))
vi.mock('../src/lib/utils', () => ({
	resolveAppId: mockResolveAppId,
	isUuid: (value: string) => /^[0-9a-f-]{6,}$/i.test(String(value || '')),
}))
vi.mock('../src/lib/agent-channel-access', () => ({
	getAllowedChannelTypesForUser: mockGetAllowedChannelTypesForUser,
}))
vi.mock('../src/modules/business-webhooks/dispatch-service', () => ({
	BusinessWebhookDispatchService: {},
}))
vi.mock('../src/modules/commerce/service', () => ({
	CommerceService: {},
}))

const { ConversationService } = await import('../src/modules/conversation/service')

describe('ConversationService WhatsApp provider filter', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		mockResolveAppId.mockResolvedValue('app-uuid')
		mockGetAllowedChannelTypesForUser.mockResolvedValue(['whatsapp'])
		mockConversationFindMany.mockResolvedValue([])
		mockConversationCount.mockResolvedValue(0)
		mockAutomationFlowFindMany.mockResolvedValue([])
	})

	it('maps provider=baileys into an inbox whatsapp provider filter', async () => {
		await ConversationService.getConversations('app-uuid', {
			channelType: 'whatsapp',
			provider: 'baileys',
			limit: 20,
			page: 1,
		})

		const query = mockConversationFindMany.mock.calls[0][0]
		expect(query.where.channel_type).toBe('whatsapp')
		expect(query.where.inboxes).toEqual({
			whatsapp_channels: {
				some: {
					deleted_at: null,
					provider: 'baileys',
				},
			},
		})
	})

	it('maps provider=official into whatsapp_cloud', async () => {
		await ConversationService.getConversations('app-uuid', {
			provider: 'official',
			limit: 20,
			page: 1,
		})

		const query = mockConversationFindMany.mock.calls[0][0]
		expect(query.where.channel_type).toBe('whatsapp')
		expect(query.where.inboxes).toEqual({
			whatsapp_channels: {
				some: {
					deleted_at: null,
					provider: 'whatsapp_cloud',
				},
			},
		})
	})
})
