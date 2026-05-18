import { describe, expect, it, vi } from 'bun:test'

vi.mock('../src/lib/prisma', () => ({
	default: {},
}))

vi.mock('../src/lib/queue', () => ({
	maintenanceQueue: {
		add: vi.fn(async () => ({})),
	},
}))

const { __test__ } = await import('../src/modules/chatbot/response-log-service')

describe('AIResponseLogService analysis helpers', () => {
	it('computes operational score from references, usage, and token metrics', () => {
		const analysis = __test__.computeAiResponseOperationalAnalysis({
			references: [
				{
					type: 'source',
					id: 'src-1',
					title: 'Promo IPL Acne',
					score: 0.92,
					excerpt: 'Harga promo IPL Acne 199rb',
				},
				{
					type: 'faq',
					id: 'faq-1',
					title: 'FAQ Booking',
					score: 0.78,
					excerpt: 'Booking via WA dengan konfirmasi slot',
				},
			],
			promptTokens: 700,
			completionTokens: 360,
			totalTokens: 1060,
			usageCredits: 1060,
			usageUsd: 1060,
			usageIdr: 1060,
		})

		expect(analysis.reference_count).toBe(2)
		expect(analysis.unique_reference_count).toBe(2)
		expect(analysis.average_reference_score).toBeGreaterThan(70)
		expect(analysis.overall_score).toBeGreaterThan(0)
		expect(analysis.overall_score).toBeLessThanOrEqual(100)
		expect(analysis.retrieval_score).toBeGreaterThan(0)
		expect(analysis.efficiency_score).toBeGreaterThan(0)
		expect(analysis.cost_score).toBeGreaterThan(0)
	})

	it('penalizes cost score when token-to-credit ratio drifts far from expected mapping', () => {
		const healthy = __test__.computeAiResponseOperationalAnalysis({
			references: [],
			promptTokens: 100,
			completionTokens: 40,
			totalTokens: 140,
			usageCredits: 140,
			usageUsd: 140,
			usageIdr: 140,
		})
		const drifted = __test__.computeAiResponseOperationalAnalysis({
			references: [],
			promptTokens: 100,
			completionTokens: 40,
			totalTokens: 140,
			usageCredits: 14,
			usageUsd: 14,
			usageIdr: 14,
		})

		expect(drifted.cost_score).toBeLessThan(healthy.cost_score)
	})

	it('prefers async persistence for user-facing entrypoints and keeps simulate sync', () => {
		expect(
			__test__.shouldPreferAsyncPersistence({
				appId: 'app-1',
				chatbotId: 'bot-1',
				entrypoint: 'webhook_live',
			}),
		).toBe(true)

		expect(
			__test__.shouldPreferAsyncPersistence({
				appId: 'app-1',
				chatbotId: 'bot-1',
				entrypoint: 'flow_runtime',
			}),
		).toBe(true)

		expect(
			__test__.shouldPreferAsyncPersistence({
				appId: 'app-1',
				chatbotId: 'bot-1',
				entrypoint: 'simulate',
			}),
		).toBe(false)
	})
})
