import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockWhatsappFindFirst = vi.fn()
const mockWhatsappFindMany = vi.fn()
const mockWhatsappFindUnique = vi.fn()
const mockWhatsappCreate = vi.fn()
const mockInboxFindFirst = vi.fn()
const mockInboxCreate = vi.fn()
const mockInboxUpdate = vi.fn()
const mockBaileysSessionCreate = vi.fn()
const mockBaileysSessionUpsert = vi.fn()
const mockBaileysSessionFindMany = vi.fn()
const mockTransaction = vi.fn()
const mockQueryRaw = vi.fn()
const mockExecuteRawUnsafe = vi.fn()

const mockTx = {
	whatsapp_channels: {
		findFirst: mockWhatsappFindFirst,
		create: mockWhatsappCreate,
	},
	inboxes: {
		findFirst: mockInboxFindFirst,
		create: mockInboxCreate,
		update: mockInboxUpdate,
	},
	baileys_sessions: {
		create: mockBaileysSessionCreate,
		upsert: mockBaileysSessionUpsert,
	},
}

const mockPrisma = {
	$transaction: mockTransaction,
	$queryRaw: mockQueryRaw,
	$executeRawUnsafe: mockExecuteRawUnsafe,
	whatsapp_channels: {
		findMany: mockWhatsappFindMany,
		findUnique: mockWhatsappFindUnique,
	},
	baileys_sessions: {
		findMany: mockBaileysSessionFindMany,
	},
}

const mockResolveAppId = vi.fn()

vi.mock('../src/lib/prisma', () => ({ default: mockPrisma }))
vi.mock('../src/lib/utils', () => ({
	resolveAppId: mockResolveAppId,
	isUuid: (value: string) => /^[0-9a-f-]{6,}$/i.test(String(value || '')),
}))
vi.mock('../src/lib/s3', () => ({
	s3: {},
	BUCKET_NAME: 'test-bucket',
	buildS3PublicUrl: () => 'https://cdn.example.com/test.png',
	getS3UploadConfigurationError: () => null,
}))

const { WhatsAppService } = await import('../src/modules/whatsapp/service')

describe('WhatsAppService.createBaileysChannel', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		mockResolveAppId.mockResolvedValue('app-uuid')
		mockQueryRaw.mockResolvedValue([{ exists: true }])
		mockExecuteRawUnsafe.mockResolvedValue(0)
		mockTransaction.mockImplementation(async (callback) => callback(mockTx))
		mockWhatsappFindFirst.mockResolvedValue(null)
		mockInboxFindFirst.mockResolvedValue(null)
		mockInboxCreate.mockResolvedValue({
			id: 'inbox-1',
			app_id: 'app-uuid',
			channel_type: 'whatsapp',
			channel_config: {
				provider: 'baileys',
				providerChannelKey: 'session-sales-1',
				phoneNumber: '6281234567890',
			},
		})
		mockInboxUpdate.mockResolvedValue({})
		mockBaileysSessionCreate.mockResolvedValue({})
		mockBaileysSessionUpsert.mockResolvedValue({})
		mockBaileysSessionFindMany.mockResolvedValue([])
		mockWhatsappFindMany.mockResolvedValue([])
		mockWhatsappFindUnique.mockResolvedValue(null)
		mockWhatsappCreate.mockImplementation(async ({ data }) => ({
			id: 'wa-1',
			app_id: data.app_id,
			name: data.name,
			phone_number: data.phone_number,
			inbox_id: data.inbox_id,
			api_key: data.api_key,
			provider: data.provider,
			extended_metadata: data.extended_metadata,
			is_on_cloud: data.is_on_cloud,
			is_official_business_account: data.is_official_business_account,
		}))
	})

	it('creates a dedicated Baileys channel, inbox, and webhook secret', async () => {
		const result = await WhatsAppService.createBaileysChannel(
			{
				name: 'Sales Baileys',
				phoneNumber: '6281234567890',
				providerChannelKey: 'session-sales-1',
				providerWebhookUrl: 'https://bridge.example.com/opencrm/outbound',
			},
			'app-uuid',
		)

		expect(mockInboxCreate).toHaveBeenCalledWith({
			data: {
				app_id: 'app-uuid',
				name: 'WA: Sales Baileys',
				channel_type: 'whatsapp',
				channel_config: {
					provider: 'baileys',
					providerChannelKey: 'session-sales-1',
					phoneNumber: '6281234567890',
				},
			},
		})

		expect(mockWhatsappCreate).toHaveBeenCalledTimes(1)
		expect(mockBaileysSessionCreate).toHaveBeenCalledWith({
			data: {
				channel_id: 'wa-1',
				app_id: 'app-uuid',
				provider_channel_key: 'session-sales-1',
				phone_number: '6281234567890',
				status: 'pending',
				metadata: {
					channel_name: 'Sales Baileys',
					provider_webhook_url:
						'https://bridge.example.com/opencrm/outbound',
				},
			},
		})
		const createdChannelData = mockWhatsappCreate.mock.calls[0][0].data
		expect(createdChannelData).toMatchObject({
			app_id: 'app-uuid',
			name: 'Sales Baileys',
			phone_number: '6281234567890',
			inbox_id: 'inbox-1',
			provider: 'baileys',
			is_on_cloud: false,
			is_official_business_account: false,
			extended_metadata: {
				provider_channel_key: 'session-sales-1',
				provider_webhook_url: 'https://bridge.example.com/opencrm/outbound',
			},
		})
		expect(typeof createdChannelData.api_key).toBe('string')
		expect(createdChannelData.api_key.length).toBeGreaterThan(0)

		expect(result.secret).toBe(createdChannelData.api_key)
		expect(result.channel).toMatchObject({
			id: 'wa-1',
			provider: 'baileys',
			provider_channel_key: 'session-sales-1',
			provider_webhook_url: 'https://bridge.example.com/opencrm/outbound',
			channel_tag: 'Non Official (Baileys)',
		})
	})

	it('includes Baileys runtime session summary in channel listings', async () => {
		mockWhatsappFindMany.mockResolvedValue([
			{
				id: 'wa-1',
				app_id: 'app-uuid',
				name: 'Sales Baileys',
				phone_number: '6281234567890',
				provider: 'baileys',
				extended_metadata: {
					provider_channel_key: 'session-sales-1',
					provider_webhook_url: 'https://bridge.example.com/opencrm/outbound',
				},
				is_active: true,
			},
		])
		mockBaileysSessionFindMany.mockResolvedValue([
			{
				channel_id: 'wa-1',
				status: 'qr_ready',
				last_error: null,
				last_connected_at: null,
				last_seen_at: new Date('2026-05-07T03:00:00.000Z'),
				pairing_code: null,
				qr_code: 'qr-data',
			},
		])

		const result = await WhatsAppService.getChannels('app-uuid')

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			id: 'wa-1',
			provider: 'baileys',
			baileys_session_status: 'qr_ready',
			baileys_is_connected: false,
			baileys_qr_ready: true,
			baileys_pairing_code_ready: false,
		})
	})
})
