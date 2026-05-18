import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockPrisma = {
	$queryRawUnsafe: vi.fn(),
	ai_evaluations: {
		count: vi.fn(),
	},
	ai_response_logs: {
		count: vi.fn(),
	},
}

const mockResolveAppId = vi.fn()

vi.mock('../src/lib/prisma', () => ({
	default: mockPrisma,
}))

vi.mock('../src/lib/utils', () => ({
	resolveAppId: mockResolveAppId,
}))

const { MetricsService, __test__ } = await import(
	'../src/modules/metrics/service'
)

function installDashboardQueryMocks() {
	let aiResolutionCalls = 0
	mockPrisma.$queryRawUnsafe.mockImplementation(async (sql: string, ...params: unknown[]) => {
		const query = String(sql)
		if (!params.includes('app-a')) {
			throw new Error(`missing app scope: ${query}`)
		}

		if (query.includes('metrics:message-aggregate')) {
			return [
				{
					total_messages: 32,
					incoming_current: 10,
					incoming_previous: 5,
					ai_messages_current: 8,
					ai_messages_previous: 2,
					cs_messages_current: 3,
					cs_messages_previous: 1,
					delivered_current: 20,
					read_current: 12,
				},
			]
		}

		if (query.includes('metrics:conversation-aggregate')) {
			return [
				{
					active_conversations: 4,
					total_conversations_current: 6,
					total_conversations_previous: 3,
					resolved_conversations_current: 3,
					resolved_conversations_previous: 1,
					avg_first_response_current: 12,
					avg_first_response_previous: 18,
				},
			]
		}

		if (query.includes('metrics:ai-resolution')) {
			aiResolutionCalls += 1
			if (aiResolutionCalls === 1) {
				return [{ ai_engaged: 10, ai_resolved: 7 }]
			}
			return [{ ai_engaged: 5, ai_resolved: 2 }]
		}

		if (query.includes('metrics:order-aggregate')) {
			return [
				{
					revenue_current: 29_900_000,
					revenue_previous: 4_800_000,
					orders_current: 4,
					orders_previous: 1,
					quoted_orders_current: 4,
					paid_orders_current: 4,
				},
			]
		}

		if (query.includes('metrics:handover-aggregate')) {
			return [
				{
					handovers_current: 2,
					handovers_previous: 1,
					pending_current: 1,
					pending_unassigned_current: 1,
				},
			]
		}

		if (query.includes('metrics:qualified-aggregate')) {
			return [{ qualified_current: 4 }]
		}

		if (query.includes('metrics:customer-aggregate')) {
			return [
				{
					total_customers: 12,
					new_customers_current: 3,
					new_customers_previous: 1,
				},
			]
		}

		if (query.includes('metrics:volume')) {
			return [
				{ day_key: '2026-04-24', ai: 8, cs: 2, handover: 1 },
				{ day_key: '2026-04-25', ai: 0, cs: 1, handover: 0 },
			]
		}

		if (query.includes('metrics:agents')) {
			return [
				{
					id: 'agent-1',
					name: 'Agent One',
					chats: 4,
					csat: 4.8,
					revenue: 12_000_000,
					status: 'online',
				},
			]
		}

		if (query.includes('metrics:channel-health')) {
			return [
				{
					active_channels: 1,
					error_channels: 0,
					whatsapp_inboxes: 1,
					last_synced_at: '2026-04-24T10:00:00.000Z',
				},
			]
		}

		if (query.includes('metrics:derived-response-time')) {
			return [{ avg_response_seconds: 0 }]
		}

		return [{}]
	})
}

describe('metrics dashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockResolveAppId.mockResolvedValue('app-a')
	})

	it('normalizes dashboard periods and resolves WIB calendar ranges', () => {
		expect(__test__.normalizeDashboardPeriod()).toBe('7d')
		expect(__test__.normalizeDashboardPeriod('24h')).toBe('today')
		expect(__test__.normalizeDashboardPeriod('30d')).toBe('30d')
		expect(__test__.normalizeDashboardPeriod('custom')).toBe('7d')

		const range = __test__.resolveDashboardRange(
			'7d',
			new Date('2026-04-26T08:00:00.000Z'),
		)

		expect(range.currentStart.toISOString()).toBe('2026-04-19T17:00:00.000Z')
		expect(range.currentEnd.toISOString()).toBe('2026-04-26T08:00:00.000Z')
		expect(range.dayCount).toBe(7)
	})

	it('returns zero dashboard data without sample fallback when app is missing', async () => {
		mockResolveAppId.mockResolvedValue(null)

		const dashboard = await MetricsService.getDashboard('missing-app', '7d')

		expect(dashboard.total_messages).toBe(0)
		expect(dashboard.dashboard.cards.incomingChats.value).toBe(0)
		expect(dashboard.dashboard.cards.revenue.value).toBe(0)
		expect(dashboard.dashboard.funnel.map((step) => step.value)).toEqual([
			0, 0, 0, 0, 0,
		])
		expect(JSON.stringify(dashboard)).not.toContain('28142')
		expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled()
	})

	it('scopes dashboard queries to the resolved app and computes AI resolved rate', async () => {
		installDashboardQueryMocks()

		const dashboard = await MetricsService.getDashboard('external-app', '7d')

		expect(mockResolveAppId).toHaveBeenCalledWith('external-app')
		expect(dashboard.dashboard.cards.incomingChats.value).toBe(10)
		expect(dashboard.dashboard.cards.aiResolvedRate.value).toBe(70)
		expect(dashboard.dashboard.cards.avgResponseSeconds.value).toBe(12)
		expect(dashboard.dashboard.cards.revenue.value).toBe(29_900_000)
		expect(dashboard.dashboard.funnel.map((step) => step.value)).toEqual([
			10, 10, 4, 4, 4,
		])
		expect(dashboard.dashboard.agents[0]).toMatchObject({
			id: 'agent-1',
			chats: 4,
			online: true,
		})
		expect(
			mockPrisma.$queryRawUnsafe.mock.calls.every((call) =>
				call.slice(1).includes('app-a'),
			),
		).toBe(true)
	})
})
