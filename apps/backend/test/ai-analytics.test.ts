import { describe, expect, it } from 'bun:test'
import {
	buildAiAnalytics,
	deriveAiAnalyticsFromConversation,
} from '../src/modules/conversation/ai-analytics'

describe('conversation ai analytics helpers', () => {
	it('derives full analytics from AI message payload with flow and rag metadata', () => {
		const analytics = deriveAiAnalyticsFromConversation({
			conversation: {
				id: 'conv-1',
				created_at: '2026-04-20T10:00:00.000Z',
				updated_at: '2026-04-20T10:05:00.000Z',
				additional_attributes: {
					flow_runtime: {
						flow_id: 'flow-1',
						variables: {
							last_ai_confidence: 0.91,
						},
					},
				},
				contacts: {
					metadata: {
						intent: 'Tanya Stok',
					},
				},
				messages: [
					{
						created_at: '2026-04-20T10:04:00.000Z',
						content_attributes: {
							ai_analytics: {
								confidence: 0.88,
								intent: 'Tanya Stok → Closing',
								workflow_id: 'flow-1',
								rag_label: 'produk-katalog.md +1',
								rag_intent: 'tanya stok',
								updated_at: '2026-04-20T10:04:00.000Z',
							},
						},
					},
				],
			},
			options: {
				workflowNameById: new Map([['flow-1', 'Sales Funnel v4']]),
			},
		})

		expect(analytics).toEqual({
			confidence: 0.88,
			intent: 'Tanya Stok → Closing',
			workflow_id: 'flow-1',
			workflow_name: 'Sales Funnel v4',
			rag_label: 'produk-katalog.md +1',
			rag_intent: 'tanya stok',
			updated_at: '2026-04-20T10:04:00.000Z',
		})
	})

	it('derives partial analytics from flow runtime and contact metadata when message analytics are absent', () => {
		const analytics = deriveAiAnalyticsFromConversation({
			conversation: {
				id: 'conv-2',
				created_at: '2026-04-20T10:00:00.000Z',
				updated_at: '2026-04-20T10:07:00.000Z',
				additional_attributes: {
					flow_runtime: {
						flow_id: 'flow-2',
						variables: {
							last_ai_confidence: 0.76,
						},
					},
				},
				contacts: {
					metadata: {
						intent: 'Tanya Harga',
					},
				},
				messages: [],
			},
			options: {
				workflowNameById: new Map([['flow-2', 'Revenue Max v3']]),
			},
		})

		expect(analytics).toEqual({
			confidence: 0.76,
			intent: 'Tanya Harga',
			workflow_id: 'flow-2',
			workflow_name: 'Revenue Max v3',
			rag_label: null,
			rag_intent: null,
			updated_at: '2026-04-20T10:07:00.000Z',
		})
	})

	it('returns null for non-ai conversation data without analytics signals', () => {
		const analytics = deriveAiAnalyticsFromConversation({
			conversation: {
				id: 'conv-3',
				created_at: '2026-04-20T10:00:00.000Z',
				updated_at: '2026-04-20T10:02:00.000Z',
				additional_attributes: {},
				contacts: {},
				messages: [
					{
						created_at: '2026-04-20T10:01:00.000Z',
						content_attributes: {},
					},
				],
			},
		})

		expect(analytics).toBeNull()
	})

	it('normalizes percentage confidence input into ratio', () => {
		const analytics = buildAiAnalytics({
			confidence: 88,
			intent: 'Tanya Produk',
			updatedAt: '2026-04-20T10:00:00.000Z',
		})

		expect(analytics?.confidence).toBe(0.88)
	})
})
