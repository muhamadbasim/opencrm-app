import { describe, expect, it, vi } from 'bun:test'

vi.mock('../src/lib/prisma', () => ({
	default: {},
}))
vi.mock('../src/modules/chatbot/service', () => ({
	ChatbotService: {
		generateAgentReply: vi.fn(),
	},
}))
vi.mock('../src/modules/conversation/service', () => ({
	ConversationService: {
		assignAgent: vi.fn(),
	},
}))
vi.mock('../src/modules/label/service', () => ({
	LabelService: {
		addLabelToConversation: vi.fn(),
	},
}))
vi.mock('../src/modules/message/service', () => ({
	MessageService: {
		sendMessage: vi.fn(),
	},
}))

const { __test__ } = await import('../src/modules/flow/runtime-service')

describe('FlowRuntimeService helpers', () => {
	it('normalizeFlowGraph maps legacy send_message_buttons node into action buttons', () => {
		const graph = __test__.normalizeFlowGraph(
			[
				{
					id: 'start-1',
					type: 'start',
					data: {},
				},
				{
					id: 'legacy-buttons',
					type: 'send_message_buttons',
					data: {
						text: 'Pilih paket',
						buttons: ['Basic', 'Premium'],
					},
				},
			],
			[
				{
					source: 'start-1',
					target: 'legacy-buttons',
				},
			],
		)

		const node = graph.nodeById.get('legacy-buttons')
		expect(node?.type).toBe('action')
		expect(node?.data.actionType).toBe('buttons')
		expect(node?.data.buttons).toEqual(['Basic', 'Premium'])
	})

	it('normalizeFlowGraph maps builder Add to cart node into add_to_cart action', () => {
		const graph = __test__.normalizeFlowGraph(
			[
				{
					id: 'start-1',
					type: 'start',
					data: {},
				},
				{
					id: 'builder-add-cart',
					type: 'action',
					icon: 'shield',
					label: 'Add to cart',
					config: {
						addToCartProductIdVar: 'product.id',
						addToCartQtyVar: 'order.qty',
					},
				},
			],
			[
				{
					source: 'start-1',
					target: 'builder-add-cart',
				},
			],
		)

		const node = graph.nodeById.get('builder-add-cart')
		expect(node?.type).toBe('action')
		expect(node?.data.actionType).toBe('add_to_cart')
		expect(node?.data.type).toBe('add_to_cart')
	})

	it('normalizeFlowGraph maps builder Checkout node into checkout action', () => {
		const graph = __test__.normalizeFlowGraph(
			[
				{
					id: 'start-1',
					type: 'start',
					data: {},
				},
				{
					id: 'builder-checkout',
					type: 'action',
					icon: 'workflow',
					label: 'Checkout',
					config: {
						checkoutOrderIdVar: 'order.id',
						checkoutPaymentMethod: 'qris',
						checkoutExpiresInMinutes: 120,
					},
				},
			],
			[
				{
					source: 'start-1',
					target: 'builder-checkout',
				},
			],
		)

		const node = graph.nodeById.get('builder-checkout')
		expect(node?.type).toBe('action')
		expect(node?.data.actionType).toBe('checkout')
		expect(node?.data.type).toBe('checkout')
	})

	it('pickSwitchTargetNodeId prioritizes add_to_cart for order_assist switch keyword', () => {
		const graph = __test__.normalizeFlowGraph(
			[
				{
					id: 'start-1',
					type: 'start',
					data: {},
				},
				{
					id: 'switch-1',
					type: 'logic',
					icon: 'filter',
					label: 'Switch Router',
					config: {
						switchVariable: 'decision.recommended_action',
						switchCases: 'order_assist -> ai_sales\ndefault -> ai_sales',
						switchDefaultRoute: 'ai_sales',
					},
				},
				{
					id: 'builder-list-product',
					type: 'action',
					icon: 'book',
					label: 'List Product',
				},
				{
					id: 'builder-add-cart',
					type: 'action',
					icon: 'shield',
					label: 'Add to cart',
				},
				{
					id: 'builder-checkout',
					type: 'action',
					icon: 'workflow',
					label: 'Checkout',
				},
			],
			[
				{
					source: 'start-1',
					target: 'switch-1',
				},
				{
					source: 'switch-1',
					target: 'builder-list-product',
				},
				{
					source: 'switch-1',
					target: 'builder-add-cart',
				},
				{
					source: 'switch-1',
					target: 'builder-checkout',
				},
			],
		)

		const target = __test__.pickSwitchTargetNodeId({
			graph,
			nodeId: 'switch-1',
			route: 'ai_sales',
			switchValue: 'order_assist',
		})

		expect(target).toBe('builder-add-cart')
	})

	it('pickSwitchTargetNodeId falls back to checkout when add_to_cart is unavailable', () => {
		const graph = __test__.normalizeFlowGraph(
			[
				{
					id: 'start-1',
					type: 'start',
					data: {},
				},
				{
					id: 'switch-1',
					type: 'logic',
					icon: 'filter',
					label: 'Switch Router',
					config: {
						switchVariable: 'decision.recommended_action',
						switchCases: 'order_assist -> ai_sales\ndefault -> ai_sales',
						switchDefaultRoute: 'ai_sales',
					},
				},
				{
					id: 'builder-list-product',
					type: 'action',
					icon: 'book',
					label: 'List Product',
				},
				{
					id: 'builder-checkout',
					type: 'action',
					icon: 'workflow',
					label: 'Checkout',
				},
			],
			[
				{
					source: 'start-1',
					target: 'switch-1',
				},
				{
					source: 'switch-1',
					target: 'builder-list-product',
				},
				{
					source: 'switch-1',
					target: 'builder-checkout',
				},
			],
		)

		const target = __test__.pickSwitchTargetNodeId({
			graph,
			nodeId: 'switch-1',
			route: 'ai_sales',
			switchValue: 'order_assist',
		})

		expect(target).toBe('builder-checkout')
	})

	it('evaluateConditionNode supports first_message_text keywords', () => {
		const result = __test__.evaluateConditionNode(
			{
				id: 'cond-1',
				type: 'condition',
				data: {
					type: 'text',
					text: 'botox, filler',
				},
			},
			{
				incomingText: 'Saya tertarik botox untuk dahi',
				incomingAt: new Date('2026-04-12T02:00:00.000Z'),
				isFirstContactMessage: true,
				state: { waiting_button: null, variables: {} },
			},
		)

		expect(result).toBe(true)
	})

	it('evaluateConditionNode supports first_message_time with HH:mm-HH:mm range in Asia/Jakarta', () => {
		const result = __test__.evaluateConditionNode(
			{
				id: 'cond-time',
				type: 'condition',
				data: {
					type: 'time',
					text: '09:00-17:00',
				},
			},
			{
				incomingText: 'Halo',
				// 2026-04-12T03:30:00.000Z = 10:30 Asia/Jakarta
				incomingAt: new Date('2026-04-12T03:30:00.000Z'),
				isFirstContactMessage: true,
				state: { waiting_button: null, variables: {} },
			},
		)

		expect(result).toBe(true)
	})

	it('evaluateConditionNode supports button condition using numeric reply index fallback', () => {
		const result = __test__.evaluateConditionNode(
			{
				id: 'cond-button',
				type: 'condition',
				data: {
					type: 'button',
					text: 'Premium',
				},
			},
			{
				incomingText: '2',
				incomingAt: new Date('2026-04-12T03:30:00.000Z'),
				isFirstContactMessage: false,
				state: {
					waiting_button: {
						node_id: 'act-btn',
						options: ['Basic', 'Premium'],
					},
					variables: {},
				},
			},
		)

		expect(result).toBe(true)
	})

	it('resolveNextBranch prioritizes matching condition and falls back to else', () => {
		const graph = __test__.normalizeFlowGraph(
			[
				{ id: 'start-1', type: 'start', data: {} },
				{
					id: 'cond-match',
					type: 'condition',
					data: { type: 'text', text: 'botox' },
				},
				{
					id: 'cond-else',
					type: 'condition',
					data: { type: 'else' },
				},
			],
			[
				{ source: 'start-1', target: 'cond-match' },
				{ source: 'start-1', target: 'cond-else' },
			],
		)

		const branch = __test__.resolveNextBranch(graph, 'start-1', {
			incomingText: 'halo botox',
			incomingAt: new Date('2026-04-12T03:30:00.000Z'),
			isFirstContactMessage: true,
			state: { waiting_button: null, variables: {} },
		})

		expect(branch.nextNodeId).toBe('cond-match')
		expect(branch.hasConditionChildren).toBe(true)
		expect(branch.matchedCondition).toBe(true)
	})

	it('interpolateTemplate resolves contact and variable placeholders', () => {
		const rendered = __test__.interpolateTemplate(
			'Halo {{ contact.name }} - {{ plan }}',
			{
				contact: { name: 'Dina' },
				state: {
					variables: {
						plan: 'Premium',
					},
				},
			},
		)

		expect(rendered).toBe('Halo Dina - Premium')
	})

	it('resolvePreferredChatbotCandidates prioritizes active inbox chatbot before node chatbot', () => {
		const candidates = __test__.resolvePreferredChatbotCandidates(
			{
				defaultChatbotId: '3be93fd7-e42d-4e30-904f-84f1e0e8d93b',
			},
			{
				chatbotId: '8f95f072-ca0a-4bb8-93b0-d3451af8ec2f',
			},
		)

		expect(candidates).toEqual([
			'3be93fd7-e42d-4e30-904f-84f1e0e8d93b',
			'8f95f072-ca0a-4bb8-93b0-d3451af8ec2f',
		])
	})

	it('resolvePreferredChatbotCandidates removes duplicate chatbot ids', () => {
		const candidates = __test__.resolvePreferredChatbotCandidates(
			{
				defaultChatbotId: '3be93fd7-e42d-4e30-904f-84f1e0e8d93b',
			},
			{
				chatbotId: '3be93fd7-e42d-4e30-904f-84f1e0e8d93b',
			},
		)

		expect(candidates).toEqual(['3be93fd7-e42d-4e30-904f-84f1e0e8d93b'])
	})

	it('resolvePreferredChatbotCandidates uses customer-level persona when no chatbot is configured', () => {
		const candidates = __test__.resolvePreferredChatbotCandidates(
			{
				defaultChatbotId: null,
				customerLevelPersona: {
					id: '5098190b-82f1-4648-9366-4a9cb866d1b4',
					label: 'AI Sales Rina (Closer)',
					systemInstruction: 'Use Rina sales closer behavior.',
				},
			},
			{},
		)

		expect(candidates).toEqual(['5098190b-82f1-4648-9366-4a9cb866d1b4'])
	})

	it('extractConfiguredChatbotId resolves snake_case and camelCase config keys', () => {
		expect(
			__test__.extractConfiguredChatbotId({
				default_chatbot_id: '3be93fd7-e42d-4e30-904f-84f1e0e8d93b',
			}),
		).toBe('3be93fd7-e42d-4e30-904f-84f1e0e8d93b')

		expect(
			__test__.extractConfiguredChatbotId({
				defaultChatbotId: '8f95f072-ca0a-4bb8-93b0-d3451af8ec2f',
			}),
		).toBe('8f95f072-ca0a-4bb8-93b0-d3451af8ec2f')
	})

	it('extractConfiguredFlowId resolves snake_case and camelCase config keys', () => {
		expect(
			__test__.extractConfiguredFlowId({
				default_flow_id: '65ea10e9-f80f-4ddf-9886-aee2ca9c7c6f',
			}),
		).toBe('65ea10e9-f80f-4ddf-9886-aee2ca9c7c6f')

		expect(
			__test__.extractConfiguredFlowId({
				defaultFlowId: '4e79819f-75ca-4f4e-8f16-fda97192d31d',
			}),
		).toBe('4e79819f-75ca-4f4e-8f16-fda97192d31d')
	})

	it('buildFlowRuntimeAdditionalAttributes preserves other runtime keys like chatbot_followup', () => {
		const merged = __test__.buildFlowRuntimeAdditionalAttributes({
			baseAttributes: {
				chatbot_followup: {
					chatbot_id: '1c444e9f-f06c-4fe1-b1b7-7ddb35a6f1b9',
					next_rule_index: 0,
				},
			},
			state: {
				flow_id: '7109502a-618e-4aa2-ba78-2add1a7e09d7',
				cursor_node_id: null,
				waiting_button: null,
				variables: {},
				last_error: null,
				last_executed_at: '2026-04-12T10:42:44.000Z',
				status: 'completed',
			},
			executedAt: new Date('2026-04-12T10:42:45.000Z'),
		})

		expect((merged as any).chatbot_followup).toEqual({
			chatbot_id: '1c444e9f-f06c-4fe1-b1b7-7ddb35a6f1b9',
			next_rule_index: 0,
		})
		expect((merged as any).flow_runtime.flow_id).toBe(
			'7109502a-618e-4aa2-ba78-2add1a7e09d7',
		)
		expect((merged as any).flow_runtime.last_executed_at).toBe(
			'2026-04-12T10:42:45.000Z',
		)
	})

	it('isRecoverableLabelAssignmentError returns true for recoverable Prisma-style codes', () => {
		expect(
			__test__.isRecoverableLabelAssignmentError({
				code: 'P2003',
			}),
		).toBe(true)
		expect(
			__test__.isRecoverableLabelAssignmentError({
				code: 'P2002',
			}),
		).toBe(true)
	})

	it('isRecoverableLabelAssignmentError detects recoverable FK message fallback', () => {
		expect(
			__test__.isRecoverableLabelAssignmentError({
				message:
					'Foreign key constraint violated on the constraint: conversation_labels_label_id_fkey',
			}),
		).toBe(true)
		expect(
			__test__.isRecoverableLabelAssignmentError({
				message: 'Network timeout',
			}),
		).toBe(false)
	})
})
