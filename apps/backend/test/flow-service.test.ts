import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockDelete = vi.fn()
const mockTransaction = vi.fn()
const mockMessageCreate = vi.fn()
const mockMessageFindMany = vi.fn()
const mockInboxFindMany = vi.fn()
const mockInboxUpdate = vi.fn()
const mockWhatsappFindMany = vi.fn()
const mockWhatsappUpdate = vi.fn()

const mockTx = {
	automation_flows: {
		create: mockCreate,
		update: mockUpdate,
		updateMany: mockUpdateMany,
	},
	inboxes: {
		findMany: mockInboxFindMany,
		update: mockInboxUpdate,
	},
	whatsapp_channels: {
		findMany: mockWhatsappFindMany,
		update: mockWhatsappUpdate,
	},
}

const mockPrisma = {
	automation_flows: {
		create: mockCreate,
		update: mockUpdate,
		updateMany: mockUpdateMany,
		findMany: mockFindMany,
		findFirst: mockFindFirst,
		delete: mockDelete,
	},
	messages: {
		create: mockMessageCreate,
		findMany: mockMessageFindMany,
	},
	inboxes: {
		findMany: mockInboxFindMany,
		update: mockInboxUpdate,
	},
	whatsapp_channels: {
		findMany: mockWhatsappFindMany,
		update: mockWhatsappUpdate,
	},
	$transaction: mockTransaction,
}

const mockResolveAppId = vi.fn()

vi.mock('../src/lib/prisma', () => ({ default: mockPrisma }))
vi.mock('../src/lib/utils', () => ({
	resolveAppId: mockResolveAppId,
	isUuid: (value: string) => /[0-9a-fA-F-]{6,}/.test(String(value || '')),
}))

const { FlowService } = await import('../src/modules/flow/service')

describe('FlowService', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		mockResolveAppId.mockResolvedValue('app-uuid')
		mockCreate.mockResolvedValue({
			id: 'flow-1',
			app_id: 'app-uuid',
			active: true,
		})
		mockUpdate.mockResolvedValue({
			id: 'flow-1',
			app_id: 'app-uuid',
			active: true,
		})
		mockUpdateMany.mockResolvedValue({ count: 1 })
		mockTransaction.mockImplementation(async (callback) => callback(mockTx))
		mockMessageCreate.mockResolvedValue({ id: 'msg-1' })
		mockMessageFindMany.mockResolvedValue([])
		mockInboxFindMany.mockResolvedValue([])
		mockInboxUpdate.mockResolvedValue({})
		mockWhatsappFindMany.mockResolvedValue([])
		mockWhatsappUpdate.mockResolvedValue({})
	})

	it('createFlow deactivates existing active flows before creating a new active flow', async () => {
		await FlowService.createFlow('app-uuid', {
			name: 'Inbound Leads',
			active: true,
			nodes: [],
			edges: [],
		})

		expect(mockTransaction).toHaveBeenCalledTimes(1)
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: {
				app_id: 'app-uuid',
				active: true,
			},
			data: {
				active: false,
				updated_at: expect.any(Date),
			},
		})
		expect(mockCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				name: 'Inbound Leads',
				active: true,
				app_id: 'app-uuid',
			}),
		})
	})

	it('createFlow keeps inactive state when creating inactive flow', async () => {
		await FlowService.createFlow('app-uuid', {
			name: 'Draft Flow',
			active: false,
			nodes: [],
			edges: [],
		})

		expect(mockTransaction).not.toHaveBeenCalled()
		expect(mockUpdateMany).not.toHaveBeenCalled()
		expect(mockCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				name: 'Draft Flow',
				active: false,
				app_id: 'app-uuid',
			}),
		})
	})

	it('updateFlow deactivates other active flows when flow is activated', async () => {
		await FlowService.updateFlow('flow-1', 'app-uuid', {
			active: true,
		})

		expect(mockTransaction).toHaveBeenCalledTimes(1)
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: {
				app_id: 'app-uuid',
				id: { not: 'flow-1' },
				active: true,
			},
			data: {
				active: false,
				updated_at: expect.any(Date),
			},
		})
		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: 'flow-1', app_id: 'app-uuid' },
			data: expect.objectContaining({
				active: true,
				updated_at: expect.any(Date),
			}),
		})
	})

	it('updateFlow updates non-active fields without transaction when active flag not enabled', async () => {
		await FlowService.updateFlow('flow-1', 'app-uuid', {
			name: 'Renamed Flow',
		})

		expect(mockTransaction).not.toHaveBeenCalled()
		expect(mockUpdateMany).not.toHaveBeenCalled()
		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: 'flow-1', app_id: 'app-uuid' },
			data: expect.objectContaining({
				name: 'Renamed Flow',
				updated_at: expect.any(Date),
			}),
		})
	})

	it('getDefaultFlow reads the account default flow id from inbox config', async () => {
		mockInboxFindMany.mockResolvedValueOnce([
			{
				id: 'inbox-1',
				channel_config: {
					default_flow_id: 'flow-default',
				},
			},
		])
		mockWhatsappFindMany.mockResolvedValueOnce([])
		mockFindFirst.mockResolvedValueOnce({
			id: 'flow-default',
			app_id: 'app-uuid',
			name: 'Default Flow',
		})

		const result = await FlowService.getDefaultFlow('app-uuid')

		expect(result).toEqual({
			default_flow_id: 'flow-default',
			flow: {
				id: 'flow-default',
				app_id: 'app-uuid',
				name: 'Default Flow',
			},
			source: 'inbox',
			source_id: 'inbox-1',
		})
		expect(mockFindFirst).toHaveBeenCalledWith({
			where: { id: 'flow-default', app_id: 'app-uuid' },
		})
	})

	it('setDefaultFlow writes one account-wide default_flow_id across inboxes and WhatsApp channels', async () => {
		mockFindFirst.mockResolvedValueOnce({
			id: 'flow-1',
			app_id: 'app-uuid',
			active: false,
			name: 'Inbound Leads',
		})
		mockUpdate.mockResolvedValueOnce({
			id: 'flow-1',
			app_id: 'app-uuid',
			active: true,
		})
		mockInboxFindMany.mockResolvedValueOnce([
			{
				id: 'inbox-1',
				channel_config: {
					defaultFlowId: 'old-camel',
					default_flow_id: 'old-flow',
					keep: true,
				},
			},
			{
				id: 'inbox-2',
				channel_config: null,
			},
		])
		mockWhatsappFindMany.mockResolvedValueOnce([
			{
				id: 'wa-1',
				extended_metadata: {
					default_flow_id: 'old-flow',
					tags: ['sales'],
				},
			},
		])

		const result = await FlowService.setDefaultFlow('flow-1', 'app-uuid')

		expect(result).toEqual({
			success: true,
			default_flow_id: 'flow-1',
			flow: { id: 'flow-1', app_id: 'app-uuid', active: true },
			updated_inboxes: 2,
			updated_whatsapp_channels: 1,
		})
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: {
				app_id: 'app-uuid',
				id: { not: 'flow-1' },
				active: true,
			},
			data: {
				active: false,
				updated_at: expect.any(Date),
			},
		})
		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: 'flow-1' },
			data: {
				active: true,
				updated_at: expect.any(Date),
			},
		})
		expect(mockInboxUpdate).toHaveBeenNthCalledWith(1, {
			where: { id: 'inbox-1' },
			data: {
				channel_config: {
					default_flow_id: 'flow-1',
					keep: true,
				},
				updated_at: expect.any(Date),
			},
		})
		expect(mockInboxUpdate).toHaveBeenNthCalledWith(2, {
			where: { id: 'inbox-2' },
			data: {
				channel_config: {
					default_flow_id: 'flow-1',
				},
				updated_at: expect.any(Date),
			},
		})
		expect(mockWhatsappUpdate).toHaveBeenCalledWith({
			where: { id: 'wa-1' },
			data: {
				extended_metadata: {
					default_flow_id: 'flow-1',
					tags: ['sales'],
				},
				updated_at: expect.any(Date),
			},
		})
	})

	it('runFlowTest writes execution_id alongside test_run_id for trace compatibility', async () => {
		mockFindFirst.mockResolvedValueOnce({
			id: 'flow-1',
			nodes: [{ id: 'node-1', label: 'Start' }],
		})

		const result = await FlowService.runFlowTest('flow-1', 'app-uuid')

		expect(result.executed).toBe(1)
		expect(result.test_run_id).toBeDefined()
		expect(mockMessageCreate).toHaveBeenCalledTimes(2)
		expect(mockMessageCreate).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				data: expect.objectContaining({
					content_attributes: expect.objectContaining({
						test_run_id: result.test_run_id,
						execution_id: result.test_run_id,
					}),
				}),
			}),
		)
		expect(mockMessageCreate).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				data: expect.objectContaining({
					content_attributes: expect.objectContaining({
						test_run_id: result.test_run_id,
						execution_id: result.test_run_id,
					}),
				}),
			}),
		)
	})

	it('runFlowTest normalizes WhatsApp-style input payload and stores it in trace input', async () => {
		mockFindFirst.mockResolvedValueOnce({
			id: 'flow-1',
			nodes: [
				{
					id: 'n-dyn-1776849480218-1',
					type: 'trigger',
					label: 'WA Trigger',
				},
			],
		})

		const result = await FlowService.runFlowTest('flow-1', 'app-uuid', {
			input: {
				context: {
					message_: 'Halo',
					recent_history_message: [{ role: 'user', content: 'Halo' }],
				},
			},
		})

		expect(result.input).toEqual({
			path: ['n-dyn-1776849480218-1'],
			context: {
				message_: 'Halo',
				recent_history_message: [{ role: 'user', content: 'Halo' }],
			},
		})
		expect(mockMessageCreate).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				data: expect.objectContaining({
					content_attributes: expect.objectContaining({
						path: ['n-dyn-1776849480218-1'],
						input: {
							path: ['n-dyn-1776849480218-1'],
							context: {
								message_: 'Halo',
								recent_history_message: [{ role: 'user', content: 'Halo' }],
							},
						},
					}),
				}),
			}),
		)
	})

	it('runFlowTest keeps only the fifteen latest WhatsApp history messages', async () => {
		mockFindFirst.mockResolvedValueOnce({
			id: 'flow-1',
			nodes: [{ id: 'wa-trigger', type: 'trigger', label: 'WA Trigger' }],
		})
		const history = Array.from({ length: 16 }, (_, index) => ({
			role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
			content: `m${index + 1}`,
		}))

		const result = await FlowService.runFlowTest('flow-1', 'app-uuid', {
			input: {
				context: {
					message_: 'Sekarang',
					recent_history_message: history,
				},
			},
		})

		expect(result.input.context.recent_history_message).toEqual(
			history.slice(-15),
		)
	})

	it('getFlowExecutions falls back to test_run_id when execution_id is missing', async () => {
		mockMessageFindMany.mockResolvedValueOnce([
			{
				id: 'msg-1',
				conversation_id: null,
				content_type: 'text',
				content: '[Test Run] Start',
				status: 'sent',
				sender_type: 'system',
				created_at: new Date('2026-04-22T10:00:00.000Z'),
				content_attributes: {
					source: 'flow_runtime',
					flow_id: 'flow-1',
					test_run_id: 'test-run-123',
					event: 'test_run_node',
					trace: true,
					path: ['start', 'router'],
					input: {
						node_id: 'router',
					},
					output: {
						action_type: 'switch_router',
					},
					variables_delta: {
						'intent.label': {
							from: null,
							to: 'produk',
						},
					},
					branch: {
						nextNodeId: 'rag-1',
					},
				},
			},
		])

		const rows = await FlowService.getFlowExecutions(
			'flow-1',
			'app-uuid',
			undefined,
			'test-run-123',
		)

		expect(mockMessageFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					AND: expect.arrayContaining([
						expect.objectContaining({
							OR: expect.arrayContaining([
								{
									content_attributes: {
										path: ['execution_id'],
										equals: 'test-run-123',
									},
								},
								{
									content_attributes: {
										path: ['test_run_id'],
										equals: 'test-run-123',
									},
								},
							]),
						}),
					]),
				}),
			}),
		)
		expect(rows[0].execution_id).toBe('test-run-123')
		expect(rows[0].trace).toBe(true)
		expect(rows[0].path).toEqual(['start', 'router'])
		expect(rows[0].input).toEqual({ node_id: 'router' })
		expect(rows[0].output).toEqual({ action_type: 'switch_router' })
		expect(rows[0].variables_delta).toEqual({
			'intent.label': {
				from: null,
				to: 'produk',
			},
		})
		expect(rows[0].branch).toEqual({ nextNodeId: 'rag-1' })
	})

	it('createFlow rejects nodes with unknown contract type', async () => {
		await expect(
			FlowService.createFlow('app-uuid', {
				name: 'Invalid Flow',
				nodes: [{ id: 'n1', type: 'mystery' }],
				edges: [],
			}),
		).rejects.toThrow('Invalid flow node type')
	})

	it('createFlow rejects graph edges that reference unknown node ids', async () => {
		await expect(
			FlowService.createFlow('app-uuid', {
				name: 'Broken Edges',
				nodes: [{ id: 'trigger-1', type: 'trigger' }],
				edges: [{ source: 'trigger-1', target: 'missing-node' }],
			}),
		).rejects.toThrow('Flow edge references unknown node')
	})

	it('createFlow requires at least one trigger-compatible node for non-empty graph', async () => {
		await expect(
			FlowService.createFlow('app-uuid', {
				name: 'No Trigger',
				nodes: [{ id: 'a1', type: 'action' }],
				edges: [],
			}),
		).rejects.toThrow('Flow must include at least one trigger node')
	})
})
