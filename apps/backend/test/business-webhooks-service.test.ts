import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockQueryRaw = vi.fn()
const mockAppsFindUnique = vi.fn()
const mockAppsFindFirst = vi.fn()
const mockOrganizationFindUnique = vi.fn()
const mockAccountsFindUnique = vi.fn()
const mockWebhooksFindFirst = vi.fn()
const mockWebhooksCreate = vi.fn()
const mockWebhooksUpdate = vi.fn()
const mockWebhooksFindUnique = vi.fn()

const mockPrisma = {
	$queryRaw: mockQueryRaw,
	apps: {
		findUnique: mockAppsFindUnique,
		findFirst: mockAppsFindFirst,
	},
	organization: {
		findUnique: mockOrganizationFindUnique,
	},
	accounts: {
		findUnique: mockAccountsFindUnique,
	},
	webhooks: {
		findFirst: mockWebhooksFindFirst,
		create: mockWebhooksCreate,
		update: mockWebhooksUpdate,
		findUnique: mockWebhooksFindUnique,
	},
}

vi.mock('../src/lib/prisma', () => ({ default: mockPrisma }))

const WEBHOOK_COLUMNS = [
	'id',
	'account_id',
	'app_id',
	'inbox_id',
	'name',
	'url',
	'subscriptions',
	'is_active',
	'secret',
	'headers',
	'created_at',
	'updated_at',
	'is_hidden',
	'board_id',
]

const { BusinessWebhooksService } = await import(
	'../src/modules/business-webhooks/service'
)

describe('BusinessWebhooksService', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		mockQueryRaw.mockResolvedValue(
			WEBHOOK_COLUMNS.map((column_name) => ({ column_name })),
		)
		mockAppsFindUnique.mockResolvedValue({ id: 'app-uuid' })
		mockAppsFindFirst.mockResolvedValue(null)
		mockOrganizationFindUnique.mockResolvedValue(null)
		mockAccountsFindUnique.mockResolvedValue(null)
	})

	it('createWebhook is idempotent for active duplicate url + inbox', async () => {
		mockWebhooksFindFirst.mockResolvedValue({
			id: 'existing-1',
			app_id: 'app-uuid',
			account_id: null,
			inbox_id: null,
			name: 'Webhook',
			url: 'https://n8n.example.com/webhook/get-location-branch',
			subscriptions: ['message.received'],
			is_active: true,
			secret: null,
			headers: null,
			created_at: new Date('2026-04-11T11:00:00.000Z'),
			is_hidden: false,
			board_id: null,
		})

		const result = await BusinessWebhooksService.createWebhook('app-uuid', {
			webhook_url: 'https://n8n.example.com/webhook-test/get-location-branch',
			inbox_id: null,
			events: ['message.received', 'message.sent'],
		})

		expect(mockWebhooksCreate).not.toHaveBeenCalled()
		expect(mockWebhooksFindFirst).toHaveBeenCalledTimes(1)

			const where = mockWebhooksFindFirst.mock.calls[0][0].where
			expect(where.AND).toEqual(
				expect.arrayContaining([
					{ url: 'https://n8n.example.com/webhook-test/get-location-branch' },
					{ inbox_id: null },
					{ is_active: true },
				]),
			)

			expect(result.id).toBe('existing-1')
			expect(result.webhook_url).toBe(
				'https://n8n.example.com/webhook/get-location-branch',
			)
	})

	it('updateWebhook rejects if it would create duplicate active url + inbox', async () => {
		mockWebhooksFindFirst
			.mockResolvedValueOnce({
				id: 'webhook-1',
				url: 'https://n8n.example.com/webhook/old-hook',
				inbox_id: null,
				is_active: true,
			})
			.mockResolvedValueOnce({
				id: 'webhook-2',
			})

		await expect(
			BusinessWebhooksService.updateWebhook('app-uuid', 'webhook-1', {
				webhook_url: 'https://n8n.example.com/webhook/get-location-branch',
				inbox_id: null,
			}),
		).rejects.toThrow('Active webhook with same URL and inbox already exists')

		expect(mockWebhooksUpdate).not.toHaveBeenCalled()
	})

	it('createWebhook preserves webhook-test URL when creating new record', async () => {
		mockWebhooksFindFirst.mockResolvedValue(null)
		mockWebhooksCreate.mockResolvedValue({
			id: 'created-1',
			app_id: 'app-uuid',
			account_id: null,
			inbox_id: null,
			name: 'Webhook',
			url: 'https://n8n.example.com/webhook-test/get-location-branch',
			subscriptions: ['message.received'],
			is_active: true,
			secret: null,
			headers: null,
			created_at: new Date('2026-04-11T12:30:00.000Z'),
			is_hidden: false,
			board_id: null,
		})

		const result = await BusinessWebhooksService.createWebhook('app-uuid', {
			webhook_url: 'https://n8n.example.com/webhook-test/get-location-branch',
			inbox_id: null,
			events: ['message.received'],
		})

		expect(mockWebhooksCreate).toHaveBeenCalledTimes(1)
		expect(mockWebhooksCreate.mock.calls[0][0].data.url).toBe(
			'https://n8n.example.com/webhook-test/get-location-branch',
		)
		expect(result.webhook_url).toBe(
			'https://n8n.example.com/webhook-test/get-location-branch',
		)
	})
})
