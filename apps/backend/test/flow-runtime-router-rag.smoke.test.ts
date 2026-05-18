import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockInboxFindFirst = vi.fn()
const mockWhatsappFindFirst = vi.fn()
const mockAutomationFlowsFindMany = vi.fn()
const mockAutomationFlowsFindFirst = vi.fn()
const mockConversationsFindUnique = vi.fn()
const mockConversationsUpdate = vi.fn()
const mockPersonasFindFirst = vi.fn()
const mockMessagesCount = vi.fn()
const mockMessagesFindMany = vi.fn()
const mockMessagesFindFirst = vi.fn()
const mockMessagesCreate = vi.fn()

const mockGenerateAgentReply = vi.fn()
const mockRetrievalTest = vi.fn()
const mockListProducts = vi.fn()
const mockAddToCart = vi.fn()
const mockGetConversationSummary = vi.fn()
const mockCheckoutOrder = vi.fn()
const mockSendPaymentLink = vi.fn()
const mockSendMessage = vi.fn()
const mockDecisionEvaluateInbound = vi.fn()
const mockAttachMessageIds = vi.fn()
const mockResolveMappedChatbotForCustomerLevel = vi.fn()

const mockPrisma = {
	inboxes: {
		findFirst: mockInboxFindFirst,
	},
	whatsapp_channels: {
		findFirst: mockWhatsappFindFirst,
	},
	automation_flows: {
		findMany: mockAutomationFlowsFindMany,
		findFirst: mockAutomationFlowsFindFirst,
	},
	conversations: {
		findUnique: mockConversationsFindUnique,
		update: mockConversationsUpdate,
	},
	ai_playground_personas: {
		findFirst: mockPersonasFindFirst,
	},
	messages: {
		count: mockMessagesCount,
		findMany: mockMessagesFindMany,
		findFirst: mockMessagesFindFirst,
		create: mockMessagesCreate,
	},
}

vi.mock('../src/lib/prisma', () => ({
	default: mockPrisma,
}))

vi.mock('../src/modules/chatbot/followup-service', () => ({
	ChatbotFollowupService: {
		scheduleFromAiReply: vi.fn(),
	},
}))

vi.mock('../src/modules/chatbot/response-log-service', () => ({
	AIResponseLogService: {
		attachMessageIds: mockAttachMessageIds,
	},
}))

vi.mock('../src/modules/chatbot/service', () => ({
	ChatbotService: {
		generateAgentReply: mockGenerateAgentReply,
	},
}))

vi.mock('../src/modules/commerce/service', () => ({
	CommerceService: {
		listProducts: mockListProducts,
		addToCart: mockAddToCart,
		getConversationSummary: mockGetConversationSummary,
		checkoutOrder: mockCheckoutOrder,
		sendPaymentLink: mockSendPaymentLink,
	},
}))

vi.mock('../src/modules/contact/service', () => ({
	ContactService: {
		updateContact: vi.fn(),
	},
}))

vi.mock('../src/modules/customer/service', () => ({
	CustomerService: {
		resolveMappedChatbotForCustomerLevel:
			mockResolveMappedChatbotForCustomerLevel,
	},
}))

vi.mock('../src/modules/conversation/service', () => ({
	ConversationService: {
		assignAgent: vi.fn(),
		upsertAiAnalytics: vi.fn(),
	},
}))

vi.mock('../src/modules/conversation/ai-analytics', () => ({
	buildAiAnalytics: vi.fn(() => null),
}))

vi.mock('../src/modules/handover/service', () => ({
	HandoverService: {
		createWorkflowApprovalRequest: vi.fn(),
	},
}))

vi.mock('../src/modules/knowledge/service', () => ({
	KnowledgeService: {
		retrievalTest: mockRetrievalTest,
	},
}))

vi.mock('../src/modules/label/service', () => ({
	LabelService: {
		addLabelToConversation: vi.fn(),
	},
}))

vi.mock('../src/modules/message/service', () => ({
	MessageService: {
		sendMessage: mockSendMessage,
	},
}))

vi.mock('../src/modules/flow/decision-engine-service', () => ({
	DecisionEngineService: {
		evaluateInbound: mockDecisionEvaluateInbound,
		getLatestPendingHandoverRequest: vi.fn(),
	},
}))

const { FlowRuntimeService } = await import(
	'../src/modules/flow/runtime-service'
)

describe('Flow runtime smoke: intent classifier -> router -> RAG', () => {
	const APP_ID = '11111111-1111-4111-8111-111111111111'
	const INBOX_ID = '22222222-2222-4222-8222-222222222222'
	const FLOW_ID = '12aba5c3-6140-4789-a7e1-fb7f00e0d016'
	const OTHER_FLOW_ID = '12aba5c3-6140-4789-a7e1-fb7f00e0d999'
	const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
	const CHATBOT_ID = '44444444-4444-4444-8444-444444444444'
	const VIP_CHATBOT_ID = '44444444-4444-4444-8444-555555555555'
	const RINA_PERSONA_ID = '5098190b-82f1-4648-9366-4a9cb866d1b4'
	const CONTACT_ID = '55555555-5555-4555-8555-555555555555'
	const INCOMING_MESSAGE_ID = '66666666-6666-4666-8666-666666666666'

	beforeEach(() => {
		vi.resetAllMocks()

		mockInboxFindFirst.mockResolvedValue({
			chatbot_id: CHATBOT_ID,
			channel_config: {},
		})
		mockWhatsappFindFirst.mockResolvedValue(null)
		mockAutomationFlowsFindMany.mockResolvedValue([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'intent-classifier',
						type: 'ai_classify',
						data: {
							classificationType: 'intent',
							categories: ['knowledge_reply', 'order_intent'],
							outputVariable: 'intent.label',
						},
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'intent.label',
						},
					},
					{
						id: 'fallback',
						type: 'action',
						data: {
							actionType: 'send_message',
							messageText: 'fallback route',
						},
					},
					{
						id: 'rag',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragSendAsMessage: true,
							ragTopK: 3,
						},
					},
				],
				edges: [
					{ source: 'start', target: 'intent-classifier' },
					{ source: 'intent-classifier', target: 'router' },
					// Fallback sengaja diletakkan dulu agar validasi AI orchestration router benar-benar terlihat.
					{ source: 'router', target: 'fallback' },
					{ source: 'router', target: 'rag' },
				],
			},
		])
		mockAutomationFlowsFindFirst.mockResolvedValue({
			id: FLOW_ID,
			name: 'Smoke Runtime Flow',
		})
		mockConversationsFindUnique.mockResolvedValue({
			id: CONVERSATION_ID,
			additional_attributes: {},
		})
		mockConversationsUpdate.mockResolvedValue({
			id: CONVERSATION_ID,
		})
		mockPersonasFindFirst.mockResolvedValue(null)
		mockMessagesCount.mockResolvedValue(1)
		mockMessagesFindMany.mockResolvedValue([
			{
				sender_type: 'contact',
				content: 'Halo, saya butuh info after care.',
				created_at: new Date(),
			},
		])
		mockMessagesFindFirst.mockResolvedValue(null)
		mockMessagesCreate.mockResolvedValue({ id: 'trace-1' })
		mockAttachMessageIds.mockResolvedValue(undefined)
		mockResolveMappedChatbotForCustomerLevel.mockResolvedValue({
			level_id: 'basic',
			level_label: 'Basic',
			total_spent: 150000,
			mapped_chatbot_id: null,
		})
		mockListProducts.mockResolvedValue({ products: [] })
		mockGetConversationSummary.mockResolvedValue({
			open_cart: null,
			payment_methods: [{ id: 'qris', label: 'QRIS', provider: 'pakasir' }],
		})
		mockAddToCart.mockResolvedValue({
			order: {
				id: '88888888-8888-4888-8888-888888888888',
				conversation_id: CONVERSATION_ID,
				grand_total: 0,
				items: [],
			},
		})
		mockCheckoutOrder.mockResolvedValue({
			order: {
				id: '88888888-8888-4888-8888-888888888888',
				conversation_id: CONVERSATION_ID,
				grand_total: 0,
				order_status: 'pending',
				journey_phase: 'checkout',
				latest_invoice: null,
			},
			payment_methods: [{ id: 'qris', label: 'QRIS', provider: 'pakasir' }],
		})
		mockSendPaymentLink.mockResolvedValue({
			order: {
				id: '88888888-8888-4888-8888-888888888888',
				conversation_id: CONVERSATION_ID,
				grand_total: 0,
				order_status: 'pending',
				journey_phase: 'payment_pending',
				latest_invoice: {
					provider_invoice_id: 'inv-test',
					payment_link: 'https://pay.test/inv-test',
					checkout_url: 'https://pay.test/inv-test',
				},
			},
			payment_link: 'https://pay.test/inv-test',
			provider_invoice_id: 'inv-test',
		})

		mockDecisionEvaluateInbound.mockResolvedValue({
			intent: '',
			intent_confidence: 0,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'awareness',
			churn_risk_score: 0,
			overall_confidence: 0.4,
			confidence_band: 'low',
			recommended_action: 'knowledge_reply',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: {
				approval: {
					escalation_minutes: [5],
				},
			},
			created_at: new Date().toISOString(),
		})

		mockGenerateAgentReply.mockImplementation(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				const instruction = String(payload?.message || '')
				if (instruction.includes('Classify the customer message')) {
					return { content: 'knowledge_reply', meta: {}, preview: {} }
				}
				if (instruction.includes('You are a strict flow router.')) {
					return { content: 'rag_retrieve', meta: {}, preview: {} }
				}
				return { content: 'unknown', meta: {}, preview: {} }
			},
		)

		mockRetrievalTest.mockResolvedValue({
			ragHit: true,
			answer:
				'Intent knowledge_reply: gunakan panduan after-care dari knowledge base.',
			topChunks: [
				{
					score: 0.93,
					source: 'after-care.md',
					locator: 'sec.1',
					snippet: 'Panduan after-care untuk treatment...',
				},
			],
			queryLogId: '77777777-7777-4777-8777-777777777777',
			groundedSources: 1,
			retrievalMs: 24,
		})

		mockSendMessage.mockResolvedValue({ id: 'bot-msg-1' })
	})

	it('runs the configured default flow before any other active flow', async () => {
		mockInboxFindFirst.mockResolvedValueOnce({
			chatbot_id: CHATBOT_ID,
			channel_config: {
				default_flow_id: FLOW_ID,
			},
		})
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: OTHER_FLOW_ID,
				nodes: [
					{
						id: 'other-start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'other-message',
						type: 'action',
						data: {
							actionType: 'send_message',
							messageText: 'wrong active flow',
						},
					},
				],
				edges: [{ source: 'other-start', target: 'other-message' }],
			},
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'default-start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'default-message',
						type: 'action',
						data: {
							actionType: 'send_message',
							messageText: 'default flow reply',
						},
					},
				],
				edges: [{ source: 'default-start', target: 'default-message' }],
			},
		])

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Halo',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:00:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Default Flow User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result).toEqual({
			matched: true,
			skipChatbot: true,
			flowId: FLOW_ID,
			executionId: `run_${INCOMING_MESSAGE_ID}`,
			reason: 'completed',
		})
		expect(mockSendMessage).toHaveBeenCalledTimes(1)
		expect(mockSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				content: 'default flow reply',
			}),
		)
		expect(mockSendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				content: 'wrong active flow',
			}),
		)
		expect(mockDecisionEvaluateInbound).toHaveBeenCalledTimes(1)
		expect(mockDecisionEvaluateInbound).toHaveBeenCalledWith(
			expect.objectContaining({
				flowId: FLOW_ID,
			}),
		)
	})

	it('routes ambiguous intent via AI router choice into RAG and returns aligned RAG output', async () => {
		const incomingText = 'Halo, aku mau tahu after care habis treatment.'
		const finalAiReply =
			'Baik Kak, untuk after-care habis treatment, ikuti panduan dari knowledge base ya.'

		mockGenerateAgentReply.mockImplementation(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				const instruction = String(payload?.message || '')
				if (instruction.includes('Classify the customer message')) {
					return { content: 'knowledge_reply', meta: {}, preview: {} }
				}
				if (instruction.includes('You are a strict flow router.')) {
					return { content: 'rag_retrieve', meta: {}, preview: {} }
				}
				if (
					instruction.includes('Tugas Anda: elaborasi informasi akhir workflow')
				) {
					return {
						content: finalAiReply,
						meta: {
							ai_provider_hit: true,
							ai_response_log_id: 'log-final-1',
							ai_agent_name: 'Test Agent',
						},
						preview: {
							timeline: [{ type: 'text', content: finalAiReply }],
						},
					}
				}
				return { content: 'unknown', meta: {}, preview: {} }
			},
		)

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: incomingText,
				content_type: 'text',
				created_at: new Date('2026-04-23T10:00:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result).toEqual({
			matched: true,
			skipChatbot: true,
			flowId: FLOW_ID,
			executionId: `run_${INCOMING_MESSAGE_ID}`,
			reason: 'completed',
		})

		expect(mockGenerateAgentReply).toHaveBeenCalledTimes(3)
		const classifierInstruction = String(
			mockGenerateAgentReply.mock.calls[0]?.[2]?.message || '',
		)
		const routerInstruction = String(
			mockGenerateAgentReply.mock.calls[1]?.[2]?.message || '',
		)
		const finalElaborationPrompt = String(
			mockGenerateAgentReply.mock.calls[2]?.[2]?.message || '',
		)
		expect(classifierInstruction).toContain(
			'Classify the customer message as intent.',
		)
		expect(routerInstruction).toContain('You are a strict flow router.')
		expect(routerInstruction).toContain('Intent: knowledge_reply')
		expect(routerInstruction).toContain(
			'Allowed action types: send_message, rag_retrieve',
		)
		expect(routerInstruction).toContain('Respond with only the node ID token.')
		expect(finalElaborationPrompt).toContain(
			'Tugas Anda: elaborasi informasi akhir workflow',
		)
		expect(finalElaborationPrompt).toContain(
			'Intent knowledge_reply: gunakan panduan after-care dari knowledge base.',
		)

		expect(mockRetrievalTest).toHaveBeenCalledTimes(1)
		expect(mockRetrievalTest).toHaveBeenCalledWith(APP_ID, {
			query: incomingText,
			selectedSourceIds: undefined,
			topK: 3,
			channel: 'live',
		})

		expect(mockSendMessage).toHaveBeenCalledTimes(1)
		expect(mockSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				conversationId: CONVERSATION_ID,
				senderType: 'bot',
				content: finalAiReply,
				contentType: 'text',
				contentAttributes: expect.objectContaining({
					source: 'flow_runtime',
					event: 'rag_retrieve',
					ai_generated: true,
					ai_elaborated_from_workflow: true,
					ai_agent_name: 'Test Agent',
				}),
			}),
		)
		expect(mockAttachMessageIds).toHaveBeenCalledWith(
			expect.objectContaining({
				logId: 'log-final-1',
				messageIds: ['bot-msg-1'],
				status: 'delivered',
			}),
		)
		expect(mockSendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				content: 'fallback route',
			}),
		)

		expect(mockConversationsUpdate).toHaveBeenCalledTimes(1)
		const updatedAttrs = mockConversationsUpdate.mock.calls[0]?.[0]?.data
			?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = updatedAttrs?.flow_runtime?.variables || {}
		expect(variables['intent.label']).toBe('knowledge_reply')
		expect(variables['router.intent']).toBe('knowledge_reply')
		expect(variables['router.ai_choice']).toBe('rag_retrieve')
		expect(variables['router.ai_choice_node_id']).toBe('rag')
		expect(variables['customer.level_id']).toBe('basic')
		expect(variables['customer.total_spent']).toBe(150000)
		expect(variables['rag.hit']).toBe(true)
		expect(variables['rag.context']).toBe(
			'Intent knowledge_reply: gunakan panduan after-care dari knowledge base.',
		)
	})

	it('keeps the last 15 customer, bot, and human agent messages as flow context', async () => {
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'reply-final',
						type: 'action',
						data: {
							actionType: 'send_message',
							messageText: 'Konteks sudah saya baca.',
						},
					},
				],
				edges: [{ source: 'start', target: 'reply-final' }],
			},
		])
		const senderByIndex = (index: number) => {
			if (index % 3 === 0) return 'agent'
			if (index % 3 === 1) return 'contact'
			return 'bot'
		}
		const previousMessages = Array.from({ length: 16 }, (_, index) => {
			const messageNumber = index + 1
			return {
				id: `history-${messageNumber}`,
				sender_type: senderByIndex(messageNumber),
				content: `m${messageNumber}`,
				created_at: new Date(
					`2026-04-23T10:${String(messageNumber).padStart(2, '0')}:00.000Z`,
				),
			}
		})
		mockMessagesFindMany.mockResolvedValueOnce([
			{
				id: INCOMING_MESSAGE_ID,
				sender_type: 'contact',
				content: 'Sekarang',
				created_at: new Date('2026-04-23T10:30:00.000Z'),
			},
			...previousMessages.slice().reverse(),
		])

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Sekarang',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:30:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockMessagesFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					sender_type: {
						in: [
							'contact',
							'customer',
							'bot',
							'agent',
							'user',
							'admin',
							'human_agent',
							'cs',
						],
					},
					AND: expect.arrayContaining([
						expect.objectContaining({
							OR: [{ is_deleted: false }, { is_deleted: null }],
						}),
						expect.objectContaining({
							OR: [{ private: false }, { private: null }],
						}),
					]),
				}),
				take: 16,
			}),
		)
		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const recentMessages =
			(latestUpdateCall?.flow_runtime?.variables?.[
				'incoming.recent_messages'
			] as Array<{ role: string; content: string }>) || []
		expect(recentMessages).toHaveLength(15)
		expect(recentMessages.map((item) => item.content)).toEqual(
			Array.from({ length: 15 }, (_, index) => `m${index + 2}`),
		)
		expect(recentMessages.find((item) => item.content === 'm3')?.role).toBe(
			'assistant',
		)
		expect(recentMessages.find((item) => item.content === 'm4')?.role).toBe(
			'user',
		)
		expect(recentMessages.find((item) => item.content === 'm5')?.role).toBe(
			'assistant',
		)
		expect(recentMessages.some((item) => item.content === 'm1')).toBe(false)
	})

	it('uses AI orchestration to choose specific RAG node when multiple RAG candidates exist', async () => {
		const incomingText = 'Kasih penjelasan umum brand dan nilai utamanya.'

		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'intent-classifier',
						type: 'ai_classify',
						data: {
							classificationType: 'intent',
							categories: ['knowledge_reply', 'order_intent'],
							outputVariable: 'intent.label',
						},
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases:
								'knowledge_reply -> ai_general\\ndefault -> human_cs',
						},
					},
					{
						id: 'rag-umum',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragTopK: 2,
							ragSendAsMessage: true,
						},
					},
					{
						id: 'rag-core',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragTopK: 9,
							ragSendAsMessage: true,
						},
					},
				],
				edges: [
					{ source: 'start', target: 'intent-classifier' },
					{ source: 'intent-classifier', target: 'router' },
					{ source: 'router', target: 'rag-umum' },
					{ source: 'router', target: 'rag-core' },
				],
			},
		])

		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: '',
			intent_confidence: 0,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'awareness',
			churn_risk_score: 0,
			overall_confidence: 0.6,
			confidence_band: 'medium',
			recommended_action: 'knowledge_reply',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: {
				approval: {
					escalation_minutes: [5],
				},
			},
			created_at: new Date().toISOString(),
		})

		let routerPrompt = ''
		mockGenerateAgentReply.mockImplementationOnce(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				const instruction = String(payload?.message || '')
				if (instruction.includes('Classify the customer message')) {
					return { content: 'knowledge_reply', meta: {}, preview: {} }
				}
				return { content: 'unknown', meta: {}, preview: {} }
			},
		)
		mockGenerateAgentReply.mockImplementationOnce(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				routerPrompt = String(payload?.message || '')
				return { content: 'rag-core', meta: {}, preview: {} }
			},
		)

		mockRetrievalTest.mockResolvedValueOnce({
			ragHit: true,
			answer: 'Core identity dari RAG node khusus.',
			topChunks: [],
			queryLogId: '88888888-8888-4888-8888-888888888888',
			groundedSources: 1,
			retrievalMs: 12,
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: incomingText,
				content_type: 'text',
				created_at: new Date('2026-04-23T10:05:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(routerPrompt).toContain('Candidate nodes:')
		expect(routerPrompt).toContain('- rag-umum | rag_retrieve')
		expect(routerPrompt).toContain('- rag-core | rag_retrieve')

		expect(mockRetrievalTest).toHaveBeenCalledTimes(1)
		expect(mockRetrievalTest).toHaveBeenCalledWith(APP_ID, {
			query: incomingText,
			selectedSourceIds: undefined,
			topK: 9,
			channel: 'live',
		})

		const updatedAttrs = mockConversationsUpdate.mock.calls[0]?.[0]?.data
			?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = updatedAttrs?.flow_runtime?.variables || {}
		expect(variables['router.ai_choice']).toBe('rag_retrieve')
		expect(variables['router.ai_choice_node_id']).toBe('rag-core')
		expect(variables['router.fallback_reason']).toBe('ai_specific_node_rerank')
	})

	it('recovers route with AI when switch route target has no compatible child node', async () => {
		const incomingText = 'Saya mau info produk dan manfaat utamanya.'

		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'intent-classifier',
						type: 'ai_classify',
						data: {
							classificationType: 'intent',
							categories: ['produk', 'keluhan', 'lainnya'],
							outputVariable: 'intent.label',
						},
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases:
								'knowledge_reply -> ai_general\\nhandover_pending_approval -> human_cs\\ndefault -> human_cs',
						},
					},
					{
						id: 'list',
						type: 'action',
						data: {
							actionType: 'list_product',
						},
					},
					{
						id: 'rag-solusi',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragTopK: 6,
							ragSendAsMessage: true,
						},
					},
				],
				edges: [
					{ source: 'start', target: 'intent-classifier' },
					{ source: 'intent-classifier', target: 'router' },
					{ source: 'router', target: 'list' },
					{ source: 'router', target: 'rag-solusi' },
				],
			},
		])

		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'product_lookup',
			intent_confidence: 0.82,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'consideration',
			churn_risk_score: 11,
			overall_confidence: 0.8,
			confidence_band: 'high',
			recommended_action: 'handover_pending_approval',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0.8,
			retrieval_score: 0.2,
			product_match_score: 0.7,
			rule_modifier_score: 0.5,
			clarification_prompt: null,
			applied_policy: {
				approval: {
					escalation_minutes: [5],
				},
			},
			created_at: new Date().toISOString(),
		})

		let routerPrompt = ''
		mockGenerateAgentReply.mockImplementationOnce(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				const instruction = String(payload?.message || '')
				if (instruction.includes('Classify the customer message')) {
					return { content: 'produk', meta: {}, preview: {} }
				}
				return { content: 'unknown', meta: {}, preview: {} }
			},
		)
		mockGenerateAgentReply.mockImplementationOnce(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				routerPrompt = String(payload?.message || '')
				return { content: 'rag-solusi', meta: {}, preview: {} }
			},
		)

		mockRetrievalTest.mockResolvedValueOnce({
			ragHit: true,
			answer: 'RAG solusi: manfaat utama produk sesuai intent customer.',
			topChunks: [],
			queryLogId: '99999999-9999-4999-8999-999999999999',
			groundedSources: 1,
			retrievalMs: 15,
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: incomingText,
				content_type: 'text',
				created_at: new Date('2026-04-23T10:10:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(routerPrompt).toContain('Resolved route: human_cs')
		expect(routerPrompt).toContain(
			'If resolved route has no direct candidate, prioritize best match to customer intent and message.',
		)
		expect(routerPrompt).toContain('- list | list_product')
		expect(routerPrompt).toContain('- rag-solusi | rag_retrieve')

		expect(mockRetrievalTest).toHaveBeenCalledTimes(1)
		expect(mockRetrievalTest).toHaveBeenCalledWith(APP_ID, {
			query: incomingText,
			selectedSourceIds: undefined,
			topK: 6,
			channel: 'live',
		})

		const updatedAttrs = mockConversationsUpdate.mock.calls[0]?.[0]?.data
			?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = updatedAttrs?.flow_runtime?.variables || {}
		expect(variables['switch_route']).toBe('human_cs')
		expect(variables['router.ai_choice']).toBe('rag_retrieve')
		expect(variables['router.ai_choice_node_id']).toBe('rag-solusi')
		expect(variables['router.fallback_reason']).toBe('ai_route_recovery')
	})

	it('uses mapped customer-level AI reply for greeting instead of product list fallback', async () => {
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'intent-classifier',
						type: 'ai_classify',
						data: {
							classificationType: 'intent',
							categories: [
								'harga',
								'keluhan',
								'retur',
								'pengiriman',
								'pembayaran',
								'produk',
								'campaign',
								'lainnya',
							],
							outputVariable: 'intent.label',
						},
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases:
								'knowledge_reply -> ai_general\\nlist_products -> product_list\\ndefault -> product_list',
						},
					},
					{
						id: 'product-list',
						type: 'action',
						data: {
							actionType: 'list_product',
						},
					},
					{
						id: 'rag-general',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragTopK: 3,
							ragSendAsMessage: true,
						},
					},
				],
				edges: [
					{ source: 'start', target: 'intent-classifier' },
					{ source: 'intent-classifier', target: 'router' },
					{ source: 'router', target: 'product-list' },
					{ source: 'router', target: 'rag-general' },
				],
			},
		])

		mockResolveMappedChatbotForCustomerLevel.mockResolvedValueOnce({
			level_id: 'vip',
			level_label: 'VIP',
			total_spent: 25000000,
			mapped_chatbot_id: VIP_CHATBOT_ID,
		})

		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.7,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'awareness',
			churn_risk_score: 0,
			overall_confidence: 0.7,
			confidence_band: 'medium',
			recommended_action: 'knowledge_reply',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0.7,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: {
				approval: {
					escalation_minutes: [5],
				},
			},
			created_at: new Date().toISOString(),
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Halo',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:11:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'VIP Customer',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result).toEqual({
			matched: true,
			skipChatbot: true,
			flowId: FLOW_ID,
			executionId: `run_${INCOMING_MESSAGE_ID}`,
			reason: 'completed',
		})
		expect(mockGenerateAgentReply).toHaveBeenCalledTimes(2)
		expect(mockGenerateAgentReply.mock.calls[0]?.[0]).toBe(VIP_CHATBOT_ID)
		expect(mockGenerateAgentReply.mock.calls[1]?.[0]).toBe(VIP_CHATBOT_ID)
		expect(mockListProducts).not.toHaveBeenCalled()
		expect(mockRetrievalTest).not.toHaveBeenCalled()
		expect(mockSendMessage).toHaveBeenCalledTimes(1)

		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = latestUpdateCall?.flow_runtime?.variables || {}
		expect(variables['intent.label']).toBe('lainnya')
		expect(variables['intent.label_fallback']).toBe('heuristic_default')
		expect(variables['customer.level_id']).toBe('vip')
		expect(variables['customer.level_label']).toBe('VIP')
		expect(variables['customer.mapped_chatbot_id']).toBe(VIP_CHATBOT_ID)
		expect(variables['router.ai_choice']).toBe('ai_default_reply')
		expect(variables['router.ai_choice_node_id']).toBe(null)
		expect(variables['router.fallback_reason']).toBe(
			'greeting_default_ai_reply',
		)
	})

	it('uses mapped customer-level persona as the AI agent when channel chatbot is missing', async () => {
		mockInboxFindFirst.mockResolvedValueOnce({
			chatbot_id: null,
			channel_config: {},
		})
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'intent-classifier',
						type: 'ai_classify',
						data: {
							classificationType: 'intent',
							categories: [
								'harga',
								'keluhan',
								'retur',
								'pengiriman',
								'pembayaran',
								'produk',
								'campaign',
								'lainnya',
							],
							outputVariable: 'intent.label',
						},
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases:
								'knowledge_reply -> ai_general\\nlist_products -> product_list\\ndefault -> product_list',
						},
					},
					{
						id: 'product-list',
						type: 'action',
						data: {
							actionType: 'list_product',
						},
					},
					{
						id: 'rag-general',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragTopK: 3,
							ragSendAsMessage: true,
						},
					},
				],
				edges: [
					{ source: 'start', target: 'intent-classifier' },
					{ source: 'intent-classifier', target: 'router' },
					{ source: 'router', target: 'product-list' },
					{ source: 'router', target: 'rag-general' },
				],
			},
		])

		mockResolveMappedChatbotForCustomerLevel.mockResolvedValueOnce({
			level_id: 'basic',
			level_label: 'Basic',
			total_spent: 0,
			mapped_chatbot_id: null,
			mapped_persona_id: RINA_PERSONA_ID,
		})
		mockPersonasFindFirst.mockResolvedValueOnce({
			id: RINA_PERSONA_ID,
			label: 'AI Sales Rina (Closer)',
			system_instruction: 'Use Rina sales closer behavior.',
		})

		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.7,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'awareness',
			churn_risk_score: 0,
			overall_confidence: 0.7,
			confidence_band: 'medium',
			recommended_action: 'knowledge_reply',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0.7,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: {
				approval: {
					escalation_minutes: [5],
				},
			},
			created_at: new Date().toISOString(),
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Halo',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:12:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Basic Customer',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockGenerateAgentReply).toHaveBeenCalledTimes(2)
		expect(mockGenerateAgentReply.mock.calls[0]?.[0]).toBe(RINA_PERSONA_ID)
		expect(mockGenerateAgentReply.mock.calls[1]?.[0]).toBe(RINA_PERSONA_ID)
		expect(mockListProducts).not.toHaveBeenCalled()
		expect(mockRetrievalTest).not.toHaveBeenCalled()
		expect(mockSendMessage).toHaveBeenCalledTimes(1)

		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = latestUpdateCall?.flow_runtime?.variables || {}
		expect(variables['customer.mapped_chatbot_id']).toBe(null)
		expect(variables['customer.mapped_persona_id']).toBe(RINA_PERSONA_ID)
		expect(variables['customer.mapped_persona_name']).toBe(
			'AI Sales Rina (Closer)',
		)
		expect(variables['router.ai_choice']).toBe('ai_default_reply')
		expect(variables['router.fallback_reason']).toBe(
			'greeting_default_ai_reply',
		)
		expect(variables['ai_elaboration.error']).toBeUndefined()
	})

	it('returns product detail for numeric list selection routed through rag -> product_detail', async () => {
		const selectedProduct = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99',
			name: 'Bye Acne',
			sku: 'TRT-BYE-ACNE',
			base_price: 1197000,
			description: 'Program treatment untuk bantu atasi jerawat.',
			variants: [
				{
					id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
					name: 'Default',
					sku: 'TRT-BYE-ACNE',
					price: 1197000,
					available_stock: 10,
				},
			],
		}
		const productList = Array.from({ length: 10 }, (_, index) => ({
			id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${String(index + 1).padStart(2, '0')}`,
			name: `Product ${index + 1}`,
			sku: `SKU-${index + 1}`,
			base_price: 100000 + index,
		}))
		productList[9] = selectedProduct

		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases:
								'product_detail -> ai_sales\\nknowledge_reply -> ai_general\\ndefault -> human_cs',
						},
					},
					{
						id: 'rag-treatment',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragTopK: 3,
						},
					},
					{
						id: 'product-detail',
						type: 'action',
						data: {
							actionType: 'product_detail',
							productDetailKeyVar: 'product.id',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'rag-treatment' },
					{ source: 'router', target: 'product-detail' },
					{ source: 'rag-treatment', target: 'product-detail' },
				],
			},
		])

		mockConversationsFindUnique.mockResolvedValueOnce({
			id: CONVERSATION_ID,
			additional_attributes: {
				flow_runtime: {
					flow_id: FLOW_ID,
					cursor_node_id: 'start',
					waiting_button: null,
					variables: {
						'product.list.result': productList,
					},
					last_error: null,
					last_executed_at: new Date('2026-04-23T10:12:00.000Z').toISOString(),
					status: 'idle',
				},
			},
		})

		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.4,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'awareness',
			churn_risk_score: 0,
			overall_confidence: 0.4,
			confidence_band: 'low',
			recommended_action: 'handover_pending_approval',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: {
				approval: {
					escalation_minutes: [5],
				},
			},
			created_at: new Date().toISOString(),
		})

		mockListProducts.mockResolvedValueOnce({
			products: productList,
		})
		mockRetrievalTest.mockResolvedValueOnce({
			ragHit: true,
			answer: 'RAG context',
			topChunks: [],
			queryLogId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
			groundedSources: 1,
			retrievalMs: 12,
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: '10',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:13:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockSendMessage).toHaveBeenCalledTimes(1)
		const sentPayload = mockSendMessage.mock.calls[0]?.[0] as
			| { content?: string }
			| undefined
		expect(String(sentPayload?.content || '')).toContain('Detail produk:')
		expect(String(sentPayload?.content || '')).toContain('Bye Acne')

		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = latestUpdateCall?.flow_runtime?.variables || {}
		expect(variables['product.id']).toBe(selectedProduct.id)
		expect(variables['product.detail.found']).toBe(true)
	})

	it('routes purchase request with quantity into add_to_cart when product context already exists', async () => {
		const selectedProduct = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
			name: 'Bye Acne',
			sku: 'TRT-BYE-ACNE',
			base_price: 1197000,
			description: 'Program treatment untuk bantu atasi jerawat.',
			variants: [
				{
					id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
					name: 'Default',
					sku: 'TRT-BYE-ACNE',
					price: 1197000,
					available_stock: 10,
				},
			],
		}
		const productList = [selectedProduct]

		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases:
								'order_assist -> ai_sales\\nproduct_detail -> ai_sales\\ndefault -> human_cs',
						},
					},
					{
						id: 'rag-treatment',
						type: 'action',
						data: {
							actionType: 'rag_retrieve',
							ragTopK: 3,
						},
					},
					{
						id: 'product-detail',
						type: 'action',
						data: {
							actionType: 'product_detail',
							productDetailKeyVar: 'product.id',
						},
					},
					{
						id: 'add-to-cart',
						type: 'action',
						data: {
							actionType: 'add_to_cart',
							addToCartProductIdVar: 'product.id',
							addToCartQtyVar: 'order.qty',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'rag-treatment' },
					{ source: 'router', target: 'product-detail' },
					{ source: 'router', target: 'add-to-cart' },
					{ source: 'rag-treatment', target: 'product-detail' },
				],
			},
		])

		mockConversationsFindUnique.mockResolvedValueOnce({
			id: CONVERSATION_ID,
			additional_attributes: {
				flow_runtime: {
					flow_id: FLOW_ID,
					cursor_node_id: 'start',
					waiting_button: null,
					variables: {
						'product.list.result': productList,
						'product.id': selectedProduct.id,
						'product.name': selectedProduct.name,
						'product.sku': selectedProduct.sku,
						'product.detail.result': selectedProduct,
						switch_value: 'product_detail',
					},
					last_error: null,
					last_executed_at: new Date('2026-04-23T10:16:00.000Z').toISOString(),
					status: 'idle',
				},
			},
		})

		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'harga',
			intent_confidence: 0.35,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'consideration',
			churn_risk_score: 0,
			overall_confidence: 0.35,
			confidence_band: 'low',
			recommended_action: 'handover_pending_approval',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: {
				approval: {
					escalation_minutes: [5],
				},
			},
			created_at: new Date().toISOString(),
		})

		mockListProducts.mockResolvedValueOnce({
			products: productList,
		})
		mockAddToCart.mockResolvedValueOnce({
			order: {
				id: '99999999-9999-4999-8999-999999999999',
				conversation_id: CONVERSATION_ID,
				grand_total: 2394000,
				items: [
					{
						product_id: selectedProduct.id,
						variant_id: selectedProduct.variants[0].id,
						quantity: 2,
						price: 1197000,
					},
				],
			},
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'mau ini 2',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:17:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockAddToCart).toHaveBeenCalledTimes(1)
		expect(mockAddToCart).toHaveBeenCalledWith(
			APP_ID,
			expect.objectContaining({
				conversation_id: CONVERSATION_ID,
				items: [
					expect.objectContaining({
						variant_id: selectedProduct.variants[0].id,
						quantity: 2,
					}),
				],
			}),
			null,
		)

		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = latestUpdateCall?.flow_runtime?.variables || {}
		expect(variables['switch_value']).toBe('order_assist')
		expect(variables['order.qty']).toBe(2)
		expect(variables['cart.quantity']).toBe(2)
		expect(variables['product.id']).toBe(selectedProduct.id)
	})

	it('routes positive order confirmation into add_to_cart when product context exists', async () => {
		const selectedProduct = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
			name: 'Domba Premium',
			sku: 'QH-DMB-PRM',
			base_price: 2900000,
			variants: [],
		}
		const orderId = '99999999-9999-4999-8999-999999999999'
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{ id: 'start', type: 'start', data: { triggerType: 'wa_message_in' } },
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases: 'default -> workflow',
						},
					},
					{
						id: 'rag',
						type: 'action',
						data: { actionType: 'rag_retrieve', ragTopK: 3 },
					},
					{
						id: 'add-to-cart',
						type: 'action',
						data: {
							actionType: 'add_to_cart',
							addToCartProductIdVar: 'product.id',
							addToCartQtyVar: 'order.qty',
						},
					},
					{
						id: 'checkout',
						type: 'action',
						data: {
							actionType: 'checkout',
							checkoutOrderIdVar: 'order.id',
							checkoutPaymentMethod: 'qris',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'rag' },
					{ source: 'router', target: 'add-to-cart' },
					{ source: 'router', target: 'checkout' },
				],
			},
		])
		mockConversationsFindUnique.mockResolvedValueOnce({
			id: CONVERSATION_ID,
			additional_attributes: {
				flow_runtime: {
					flow_id: FLOW_ID,
					status: 'completed',
					variables: {
						'product.detail.result': selectedProduct,
						'product.id': selectedProduct.id,
						'product.name': selectedProduct.name,
						'product.sku': selectedProduct.sku,
						'order.qty': 1,
						'cart.open': false,
						'cart.open_cart': null,
						switch_value: 'clarify_need',
					},
				},
			},
		})
		mockMessagesFindMany.mockResolvedValueOnce([
			{
				id: INCOMING_MESSAGE_ID,
				sender_type: 'contact',
				content: 'Iya sudah sesuai',
				created_at: new Date('2026-04-24T16:56:00.000Z'),
			},
			{
				id: 'order-summary',
				sender_type: 'bot',
				content:
					'Saya konfirmasi pesanannya: 1 ekor Domba Premium seharga Rp2.900.000.',
				created_at: new Date('2026-04-24T16:55:00.000Z'),
			},
		])
		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.45,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'consideration',
			churn_risk_score: 0,
			overall_confidence: 0.55,
			confidence_band: 'medium',
			recommended_action: 'clarify_need',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'clarify',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: { approval: { escalation_minutes: [5] } },
			created_at: new Date().toISOString(),
		})
		mockListProducts.mockResolvedValueOnce({ products: [selectedProduct] })
		mockAddToCart.mockResolvedValueOnce({
			order: {
				id: orderId,
				conversation_id: CONVERSATION_ID,
				grand_total: 2900000,
				items: [
					{
						product_id: selectedProduct.id,
						variant_id: null,
						quantity: 1,
						price: 2900000,
					},
				],
			},
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Iya sudah sesuai',
				content_type: 'text',
				created_at: new Date('2026-04-24T16:56:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockAddToCart).toHaveBeenCalledWith(
			APP_ID,
			expect.objectContaining({
				conversation_id: CONVERSATION_ID,
				items: [
					expect.objectContaining({
						product_id: selectedProduct.id,
						quantity: 1,
					}),
				],
			}),
			null,
		)
		expect(mockCheckoutOrder).not.toHaveBeenCalled()
		expect(mockRetrievalTest).not.toHaveBeenCalled()
		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = latestUpdateCall?.flow_runtime?.variables || {}
		expect(variables['switch_value']).toBe('order_assist')
		expect(variables['cart.quantity']).toBe(1)
	})

	it('adds product to cart before checkout when no open cart exists', async () => {
		const selectedProduct = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
			name: 'Domba Premium',
			sku: 'QH-DMB-PRM',
			base_price: 2900000,
			variants: [],
		}
		const orderId = '99999999-9999-4999-8999-999999999999'
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{ id: 'start', type: 'start', data: { triggerType: 'wa_message_in' } },
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases: 'default -> workflow',
						},
					},
					{
						id: 'rag',
						type: 'action',
						data: { actionType: 'rag_retrieve', ragTopK: 3 },
					},
					{
						id: 'add-to-cart',
						type: 'action',
						data: {
							actionType: 'add_to_cart',
							addToCartProductIdVar: 'product.id',
							addToCartQtyVar: 'order.qty',
						},
					},
					{
						id: 'checkout',
						type: 'action',
						data: {
							actionType: 'checkout',
							checkoutOrderIdVar: 'order.id',
							checkoutPaymentMethod: 'qris',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'rag' },
					{ source: 'router', target: 'add-to-cart' },
					{ source: 'router', target: 'checkout' },
				],
			},
		])
		mockConversationsFindUnique.mockResolvedValueOnce({
			id: CONVERSATION_ID,
			additional_attributes: {
				flow_runtime: {
					flow_id: FLOW_ID,
					status: 'completed',
					variables: {
						'product.detail.result': selectedProduct,
						'product.id': selectedProduct.id,
						'product.name': selectedProduct.name,
						'product.sku': selectedProduct.sku,
						'order.qty': 1,
						'cart.open': false,
						'cart.open_cart': null,
						switch_value: 'checkout',
					},
				},
			},
		})
		mockMessagesFindMany.mockResolvedValueOnce([
			{
				id: INCOMING_MESSAGE_ID,
				sender_type: 'contact',
				content: 'Checkout',
				created_at: new Date('2026-04-24T16:57:00.000Z'),
			},
			{
				id: 'order-summary',
				sender_type: 'bot',
				content:
					'Saya konfirmasi pesanannya: 1 ekor Domba Premium seharga Rp2.900.000.',
				created_at: new Date('2026-04-24T16:55:00.000Z'),
			},
		])
		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'pembayaran',
			intent_confidence: 0.75,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'purchase',
			churn_risk_score: 0,
			overall_confidence: 0.8,
			confidence_band: 'high',
			recommended_action: 'checkout',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: { approval: { escalation_minutes: [5] } },
			created_at: new Date().toISOString(),
		})
		mockListProducts.mockResolvedValueOnce({ products: [selectedProduct] })
		mockAddToCart.mockResolvedValueOnce({
			order: {
				id: orderId,
				conversation_id: CONVERSATION_ID,
				grand_total: 2900000,
				items: [
					{
						product_id: selectedProduct.id,
						variant_id: null,
						quantity: 1,
						price: 2900000,
					},
				],
			},
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Checkout',
				content_type: 'text',
				created_at: new Date('2026-04-24T16:57:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockAddToCart).toHaveBeenCalledWith(
			APP_ID,
			expect.objectContaining({
				conversation_id: CONVERSATION_ID,
				items: [
					expect.objectContaining({
						product_id: selectedProduct.id,
						quantity: 1,
					}),
				],
			}),
			null,
		)
		expect(mockCheckoutOrder).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
		expect(mockSendPaymentLink).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
		expect(mockRetrievalTest).not.toHaveBeenCalled()
		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = latestUpdateCall?.flow_runtime?.variables || {}
		expect(variables['switch_value']).toBe('order_assist')
		expect(variables['checkout.status']).toBe('success')
		expect(variables['cart.quantity']).toBe(1)
	})

	it('routes payment reply to checkout when conversation already has an open cart', async () => {
		const orderId = '99999999-9999-4999-8999-999999999999'
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases: 'default -> workflow',
						},
					},
					{
						id: 'rag',
						type: 'action',
						data: { actionType: 'rag_retrieve', ragTopK: 3 },
					},
					{
						id: 'add-to-cart',
						type: 'action',
						data: { actionType: 'add_to_cart' },
					},
					{
						id: 'checkout',
						type: 'action',
						data: {
							actionType: 'checkout',
							checkoutOrderIdVar: 'order.id',
							checkoutPaymentMethod: 'qris',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'rag' },
					{ source: 'router', target: 'add-to-cart' },
					{ source: 'router', target: 'checkout' },
				],
			},
		])
		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.4,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'consideration',
			churn_risk_score: 0,
			overall_confidence: 0.4,
			confidence_band: 'low',
			recommended_action: 'clarify_need',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: { approval: { escalation_minutes: [5] } },
			created_at: new Date().toISOString(),
		})
		mockGetConversationSummary.mockResolvedValueOnce({
			open_cart: {
				id: orderId,
				conversation_id: CONVERSATION_ID,
				order_status: 'pending',
				journey_phase: 'cart',
				grand_total: 4800000,
				items: [
					{
						product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
						product_name: 'Kambing Premium',
						quantity: 1,
						price: 4800000,
						line_total: 4800000,
					},
				],
			},
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'QRIS',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:18:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockAddToCart).not.toHaveBeenCalled()
		expect(mockCheckoutOrder).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
		expect(mockSendPaymentLink).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
		expect(mockSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				content: 'Silakan lanjut bayar melalui tombol di bawah ini.',
				contentType: 'interactive',
				contentAttributes: expect.objectContaining({
					event: 'flow_payment_link',
					interactive: expect.objectContaining({
						type: 'cta_url',
						action: expect.objectContaining({
							name: 'cta_url',
							parameters: expect.objectContaining({
								display_text: 'Bayar Sekarang',
								url: 'https://pay.test/inv-test',
							}),
						}),
					}),
				}),
			}),
		)
	})

	it('routes numeric payment method reply from latest checkout prompt to checkout', async () => {
		const orderId = '99999999-9999-4999-8999-999999999999'
		const staleProductList = [
			{
				id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
				name: 'Domba Standar',
				sku: 'QH-DMB-STD',
				base_price: 1900000,
			},
			{
				id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
				name: 'Domba Premium',
				sku: 'QH-DMB-PRM',
				base_price: 2900000,
			},
		]
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{ id: 'start', type: 'start', data: { triggerType: 'wa_message_in' } },
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases: 'default -> workflow',
						},
					},
					{
						id: 'product-detail',
						type: 'action',
						data: { actionType: 'product_detail' },
					},
					{
						id: 'checkout',
						type: 'action',
						data: {
							actionType: 'checkout',
							checkoutOrderIdVar: 'order.id',
							checkoutPaymentMethod: 'qris',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'product-detail' },
					{ source: 'router', target: 'checkout' },
				],
			},
		])
		mockConversationsFindUnique.mockResolvedValueOnce({
			id: CONVERSATION_ID,
			additional_attributes: {
				flow_runtime: {
					flow_id: FLOW_ID,
					status: 'completed',
					variables: {
						'product.list.result': staleProductList,
						'product.id': staleProductList[1].id,
						'product.name': staleProductList[1].name,
						'product.sku': staleProductList[1].sku,
						switch_value: 'order_assist',
					},
				},
			},
		})
		mockMessagesFindMany.mockResolvedValueOnce([
			{
				id: INCOMING_MESSAGE_ID,
				sender_type: 'contact',
				content: '1',
				created_at: new Date('2026-04-24T16:56:00.000Z'),
			},
			{
				id: 'payment-prompt',
				sender_type: 'bot',
				content:
					'Kalau sudah sesuai, untuk pembayarannya Kakak mau pakai:\n1. **QRIS**\n2. **Link Payment Gateway**',
				created_at: new Date('2026-04-24T16:55:00.000Z'),
			},
			{
				id: 'order-summary',
				sender_type: 'bot',
				content:
					'Ringkasan pesanan Kakak saat ini:\n- **1 Domba Premium** — Rp2.900.000',
				created_at: new Date('2026-04-24T16:54:00.000Z'),
			},
		])
		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.45,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'consideration',
			churn_risk_score: 0,
			overall_confidence: 0.55,
			confidence_band: 'medium',
			recommended_action: 'clarify_need',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'clarify',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: { approval: { escalation_minutes: [5] } },
			created_at: new Date().toISOString(),
		})
		mockGetConversationSummary.mockResolvedValueOnce({
			open_cart: {
				id: orderId,
				conversation_id: CONVERSATION_ID,
				order_status: 'pending',
				journey_phase: 'cart',
				grand_total: 2900000,
				items: [
					{
						product_id: staleProductList[1].id,
						product_name: staleProductList[1].name,
						quantity: 1,
						price: 2900000,
						line_total: 2900000,
					},
				],
			},
			payment_methods: [
				{ id: 'qris', label: 'QRIS', provider: 'pakasir' },
				{ id: 'bca_va', label: 'BCA Virtual Account', provider: 'pakasir' },
			],
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: '1',
				content_type: 'text',
				created_at: new Date('2026-04-24T16:56:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockCheckoutOrder).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
		expect(mockAddToCart).not.toHaveBeenCalled()
		const latestUpdateCall = mockConversationsUpdate.mock.calls.at(-1)?.[0]
			?.data?.additional_attributes as
			| { flow_runtime?: { variables?: Record<string, unknown> } }
			| undefined
		const variables = latestUpdateCall?.flow_runtime?.variables || {}
		expect(variables['switch_value']).toBe('checkout')
		expect(variables['router.payment_signal']).toBe(true)
		expect(variables['router.payment_selection_source']).toBe(
			'payment_prompt_option_1',
		)
		expect(variables['product.detail.selection_index']).toBeUndefined()
	})

	it('rebuilds cart from confirmed order summary before QRIS checkout', async () => {
		const orderId = '99999999-9999-4999-8999-999999999999'
		const kambingPremium = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
			name: 'Kambing Premium',
			sku: 'QH-KMB-PRM',
			base_price: 4800000,
			variants: [],
		}
		const kambingStandar = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
			name: 'Kambing Standar',
			sku: 'QH-KMB-STD',
			base_price: 3000000,
			variants: [],
		}
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{ id: 'start', type: 'start', data: { triggerType: 'wa_message_in' } },
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases: 'default -> workflow',
						},
					},
					{
						id: 'rag',
						type: 'action',
						data: { actionType: 'rag_retrieve', ragSendAsMessage: true },
					},
					{
						id: 'checkout',
						type: 'action',
						data: {
							actionType: 'checkout',
							checkoutOrderIdVar: 'order.id',
							checkoutPaymentMethod: 'qris',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'rag' },
					{ source: 'router', target: 'checkout' },
				],
			},
		])
		mockConversationsFindUnique.mockResolvedValueOnce({
			id: CONVERSATION_ID,
			additional_attributes: {},
		})
		mockMessagesFindMany.mockResolvedValueOnce([
			{
				id: INCOMING_MESSAGE_ID,
				sender_type: 'contact',
				content: '1',
				created_at: new Date('2026-04-24T17:22:00.000Z'),
			},
			{
				id: 'payment-explainer',
				sender_type: 'bot',
				content:
					'Kalau Kakak pilih **link pembayaran**, nanti bisa dibayarkan lewat beberapa metode seperti **Virtual Account (BCA/BNI/BRI/Mandiri)**, **GoPay**, **OVO**, **DANA**, atau **ShopeePay**.',
				created_at: new Date('2026-04-24T17:21:55.000Z'),
			},
			{
				id: 'payment-prompt',
				sender_type: 'bot',
				content:
					'Untuk pembayarannya, Kakak mau pakai:\n1. **QRIS**, atau\n2. **Link pembayaran**',
				created_at: new Date('2026-04-24T17:21:49.000Z'),
			},
			{
				id: 'total',
				sender_type: 'bot',
				content: '**Total pembayaran: Rp12.600.000**',
				created_at: new Date('2026-04-24T17:21:45.000Z'),
			},
			{
				id: 'summary',
				sender_type: 'bot',
				content:
					'Saya konfirmasi lagi pesanannya:\n- **2x Kambing Premium** (43-45 kg/ekor) — **Rp4.800.000/ekor**\n- **1x Kambing Standar** (27-30 kg) — **Rp3.000.000**',
				created_at: new Date('2026-04-24T17:21:40.000Z'),
			},
		])
		mockMessagesFindFirst.mockResolvedValueOnce({
			sender_type: 'bot',
			content:
				'Untuk pembayarannya, Kakak mau pakai:\n1. **QRIS**, atau\n2. **Link pembayaran**',
		})
		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.45,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'awareness',
			churn_risk_score: 0,
			overall_confidence: 0.55,
			confidence_band: 'medium',
			recommended_action: 'clarify_need',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'clarify',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: { approval: { escalation_minutes: [5] } },
			created_at: new Date().toISOString(),
		})
		mockGetConversationSummary.mockResolvedValue({
			open_cart: null,
			payment_methods: [
				{ id: 'qris', label: 'QRIS', provider: 'pakasir' },
				{ id: 'bca_va', label: 'BCA Virtual Account', provider: 'pakasir' },
			],
		})
		mockListProducts.mockResolvedValueOnce({
			products: [kambingPremium, kambingStandar],
			payment_methods: [{ id: 'qris', label: 'QRIS', provider: 'pakasir' }],
		})
		mockAddToCart.mockResolvedValueOnce({
			order: {
				id: orderId,
				conversation_id: CONVERSATION_ID,
				grand_total: 12600000,
				items: [
					{
						product_id: kambingPremium.id,
						product_name: kambingPremium.name,
						quantity: 2,
						price: 4800000,
						line_total: 9600000,
					},
					{
						product_id: kambingStandar.id,
						product_name: kambingStandar.name,
						quantity: 1,
						price: 3000000,
						line_total: 3000000,
					},
				],
			},
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: '1',
				content_type: 'text',
				created_at: new Date('2026-04-24T17:22:00.000Z'),
				reply_to_message_id: '77777777-7777-4777-8777-777777777777',
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockAddToCart).toHaveBeenCalledWith(
			APP_ID,
			expect.objectContaining({
				conversation_id: CONVERSATION_ID,
				items: [
					expect.objectContaining({
						product_id: kambingPremium.id,
						quantity: 2,
					}),
					expect.objectContaining({
						product_id: kambingStandar.id,
						quantity: 1,
					}),
				],
			}),
			null,
		)
		expect(mockCheckoutOrder).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
		expect(mockSendPaymentLink).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
		expect(mockRetrievalTest).not.toHaveBeenCalled()
	})

	it('infers recent product context, adds product-only item to cart, then checkout on QRIS reply', async () => {
		const selectedProduct = {
			id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
			name: 'Kambing Premium',
			sku: 'QH-KMB-PRM',
			base_price: 4800000,
			variants: [],
		}
		const orderId = '99999999-9999-4999-8999-999999999999'
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{ id: 'start', type: 'start', data: { triggerType: 'wa_message_in' } },
					{
						id: 'router',
						type: 'action',
						data: {
							actionType: 'switch_router',
							switchVariable: 'decision.recommended_action',
							switchCases: 'default -> workflow',
						},
					},
					{
						id: 'rag',
						type: 'action',
						data: { actionType: 'rag_retrieve', ragTopK: 3 },
					},
					{
						id: 'add-to-cart',
						type: 'action',
						data: {
							actionType: 'add_to_cart',
							addToCartProductIdVar: 'product.id',
							addToCartQtyVar: 'order.qty',
						},
					},
					{
						id: 'checkout',
						type: 'action',
						data: {
							actionType: 'checkout',
							checkoutOrderIdVar: 'order.id',
							checkoutPaymentMethod: 'qris',
						},
					},
				],
				edges: [
					{ source: 'start', target: 'router' },
					{ source: 'router', target: 'rag' },
					{ source: 'router', target: 'add-to-cart' },
					{ source: 'router', target: 'checkout' },
				],
			},
		])
		mockMessagesFindMany.mockResolvedValueOnce([
			{
				id: 'prev-bot-2',
				sender_type: 'bot',
				content: 'Balas saja QRIS atau Link, ya Kak.',
			},
			{
				id: 'prev-bot-1',
				sender_type: 'bot',
				content:
					'Saya konfirmasi pesanannya:\\n- **1 ekor Kambing Premium**\\n- **Harga:** Rp4.800.000',
			},
		])
		mockDecisionEvaluateInbound.mockResolvedValueOnce({
			intent: 'inquiry_general',
			intent_confidence: 0.4,
			sentiment_state: 'neutral',
			sentiment_transition: 'stable',
			buying_stage: 'consideration',
			churn_risk_score: 0,
			overall_confidence: 0.4,
			confidence_band: 'low',
			recommended_action: 'clarify_need',
			requires_approval: false,
			approval_reason: null,
			persona_id: null,
			route_target: 'workflow',
			model_confidence: 0,
			retrieval_score: 0,
			product_match_score: 0,
			rule_modifier_score: 0,
			clarification_prompt: null,
			applied_policy: { approval: { escalation_minutes: [5] } },
			created_at: new Date().toISOString(),
		})
		mockListProducts.mockResolvedValue({ products: [selectedProduct] })
		mockAddToCart.mockResolvedValueOnce({
			order: {
				id: orderId,
				conversation_id: CONVERSATION_ID,
				grand_total: 4800000,
				items: [
					{
						product_id: selectedProduct.id,
						variant_id: null,
						quantity: 1,
						price: 4800000,
					},
				],
			},
		})

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'QRIS',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:19:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
				phone_number: '6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockAddToCart).toHaveBeenCalledWith(
			APP_ID,
			expect.objectContaining({
				conversation_id: CONVERSATION_ID,
				items: [
					expect.objectContaining({
						product_id: selectedProduct.id,
						quantity: 1,
					}),
				],
			}),
			null,
		)
		expect(mockAddToCart.mock.calls[0]?.[1]?.items?.[0]?.variant_id).toBe(
			undefined,
		)
		expect(mockCheckoutOrder).toHaveBeenCalledWith(
			APP_ID,
			orderId,
			expect.objectContaining({ payment_method: 'qris' }),
			null,
		)
	})

	it('sends terminal orchestration reply when flow ends on non-reply action node', async () => {
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'promo-trigger',
						type: 'action',
						data: {
							actionType: 'trigger_campaign',
							campaignId: 'promo-123',
							campaignMode: 'once',
						},
					},
				],
				edges: [{ source: 'start', target: 'promo-trigger' }],
			},
		])

		let orchestrationPrompt = ''
		mockGenerateAgentReply.mockImplementationOnce(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				orchestrationPrompt = String(payload?.message || '')
				return {
					content:
						'Siap, kebutuhan kamu sudah saya proses dari workflow dan campaign pendukungnya sudah dipicu.',
					meta: {},
					preview: {},
				}
			},
		)

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Tolong bantu follow-up promo terbaru.',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:20:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result).toEqual({
			matched: true,
			skipChatbot: true,
			flowId: FLOW_ID,
			executionId: `run_${INCOMING_MESSAGE_ID}`,
			reason: 'completed',
		})
		expect(mockGenerateAgentReply).toHaveBeenCalledTimes(1)
		expect(orchestrationPrompt).toContain('Workflow execution summary:')
		expect(orchestrationPrompt).toContain(
			'promo-trigger [action:trigger_campaign]',
		)
		expect(mockSendMessage).toHaveBeenCalledTimes(1)
		expect(mockSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				conversationId: CONVERSATION_ID,
				senderType: 'bot',
				content:
					'Siap, kebutuhan kamu sudah saya proses dari workflow dan campaign pendukungnya sudah dipicu.',
				contentType: 'text',
			}),
		)
	})

	it('records WhatsApp delivery in the final reply node output', async () => {
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'reply-final',
						type: 'action',
						data: {
							actionType: 'send_message',
							messageText: 'Halo Kak, pesannya sudah masuk.',
						},
					},
				],
				edges: [{ source: 'start', target: 'reply-final' }],
			},
		])

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Halo',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:23:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
				phone_number: '+6281234567890',
			},
			channelType: 'whatsapp',
			channelName: 'WhatsApp',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		const replyTraceCall = mockMessagesCreate.mock.calls.find((call) => {
			const attrs = call[0]?.data?.content_attributes as Record<string, unknown>
			return (
				attrs?.node_id === 'reply-final' && attrs?.event === 'node_executed'
			)
		})
		const output = replyTraceCall?.[0]?.data?.content_attributes?.output as
			| Record<string, any>
			| undefined
		expect(output).toEqual(
			expect.objectContaining({
				outbound_delivery: expect.objectContaining({
					channel: 'whatsapp',
					sent: true,
					message_ids: ['bot-msg-1'],
					messages: [
						expect.objectContaining({
							id: 'bot-msg-1',
							channel: 'whatsapp',
							content_type: 'text',
							content: 'Halo Kak, pesannya sudah masuk.',
						}),
					],
				}),
				whatsapp_delivery: expect.objectContaining({
					channel: 'whatsapp',
					sent: true,
					message_ids: ['bot-msg-1'],
				}),
			}),
		)
	})

	it('forces ai end node to always send final orchestration message', async () => {
		mockAutomationFlowsFindMany.mockResolvedValueOnce([
			{
				id: FLOW_ID,
				nodes: [
					{
						id: 'start',
						type: 'start',
						data: { triggerType: 'wa_message_in' },
					},
					{
						id: 'end-ai',
						type: 'end',
						data: {
							type: 'ai_agent',
						},
					},
				],
				edges: [{ source: 'start', target: 'end-ai' }],
			},
		])

		let orchestrationPrompt = ''
		mockGenerateAgentReply.mockImplementationOnce(
			async (
				_chatbotId: string,
				_appId: string,
				payload: { message?: string },
			) => {
				orchestrationPrompt = String(payload?.message || '')
				return {
					content:
						'Terima kasih, ini rangkuman akhir dari workflow dan saya siap bantu lanjut jika ada detail tambahan.',
					meta: {},
					preview: {},
				}
			},
		)

		const result = await FlowRuntimeService.executeInbound({
			appId: APP_ID,
			inboxId: INBOX_ID,
			conversationId: CONVERSATION_ID,
			incomingMessage: {
				id: INCOMING_MESSAGE_ID,
				content: 'Halo, bantu jelaskan alur order ya.',
				content_type: 'text',
				created_at: new Date('2026-04-23T10:25:00.000Z'),
			},
			contact: {
				id: CONTACT_ID,
				name: 'Smoke Test User',
			},
			channelType: 'instagram',
			channelName: 'IG DM',
			channelBadgeUrl: null,
		})

		expect(result.reason).toBe('completed')
		expect(mockGenerateAgentReply).toHaveBeenCalledTimes(1)
		expect(orchestrationPrompt).toContain('Workflow execution summary:')
		expect(orchestrationPrompt).toContain('end-ai [end]')
		expect(mockSendMessage).toHaveBeenCalledTimes(1)
		expect(mockSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				conversationId: CONVERSATION_ID,
				senderType: 'bot',
				content:
					'Terima kasih, ini rangkuman akhir dari workflow dan saya siap bantu lanjut jika ada detail tambahan.',
			}),
		)
	})
})
