import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockConversationsFindMany = vi.fn()
const mockHandoverRequestsFindMany = vi.fn()
const mockSlaPoliciesFindFirst = vi.fn()

const mockPrisma = {
	conversations: {
		findMany: mockConversationsFindMany,
	},
	handover_requests: {
		findMany: mockHandoverRequestsFindMany,
	},
	sla_policies: {
		findFirst: mockSlaPoliciesFindFirst,
	},
}

const mockResolveAppId = vi.fn()

vi.mock('../src/lib/prisma', () => ({ default: mockPrisma }))
vi.mock('../src/lib/utils', () => ({
	resolveAppId: mockResolveAppId,
	isUuid: (value: string) => /^[0-9a-f-]{6,}$/i.test(String(value || '')),
}))
vi.mock('../src/lib/realtime', () => ({
	getRealtimeIO: vi.fn(() => null),
}))
vi.mock('../src/modules/conversation/service', () => ({
	ConversationService: {},
}))
vi.mock('../src/modules/flow/decision-engine-service', () => ({
	DecisionEngineService: {},
}))

const { HandoverService } = await import('../src/modules/handover/service')

describe('HandoverService.getQueue', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		mockResolveAppId.mockResolvedValue('app-1')
		mockSlaPoliciesFindFirst.mockResolvedValue(null)
		mockHandoverRequestsFindMany.mockResolvedValue([
			{
				id: 'request-1',
				conversation_id: 'conversation-1',
				created_at: new Date('2026-05-07T08:10:15.503Z'),
				ai_reason: 'Decision engine requires approval before handover.',
				ai_intent: 'handover_request',
				target_agent_id: null,
				sla_due_at: null,
				source_rule_id: null,
			},
		])
	})

	it('includes legacy open conversations when handover approval is pending', async () => {
		mockConversationsFindMany.mockResolvedValue([
			{
				id: 'conversation-1',
				status: 'open',
				created_at: new Date('2026-05-07T08:00:00.000Z'),
				last_message_at: new Date('2026-05-07T08:10:00.000Z'),
				additional_attributes: {
					handover: {
						approval_state: 'pending',
						latest_request_id: 'request-1',
					},
					ai_analytics_last: {
						intent: 'handover_request',
						confidence: 0.56,
					},
				},
				contacts: {
					name: 'Naufal Rasyid',
					phone_number: '186732343513187',
					avatar_url: null,
					identifier: 'wa:app-1:186732343513187',
				},
				messages: [
					{
						content: 'berbicara dengan agent',
					},
				],
			},
		])

		const queue = await HandoverService.getQueue('app-1')

		expect(mockConversationsFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					app_id: 'app-1',
					OR: [
						{ status: 'pending' },
						{
							additional_attributes: {
								path: ['handover', 'approval_state'],
								equals: 'pending',
							},
						},
					],
				},
			}),
		)
		expect(queue).toHaveLength(1)
		expect(queue[0]).toMatchObject({
			id: 'request-1',
			conversationId: 'conversation-1',
			contactName: 'Naufal Rasyid',
			contactPhone: '186732343513187',
			approvalState: 'pending',
			intent: 'handover_request',
			reason: 'Decision engine requires approval before handover.',
		})
	})
})
