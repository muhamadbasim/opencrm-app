import { beforeEach, describe, expect, it, vi } from 'bun:test'

const findUniqueMock = vi.fn()
const upsertMock = vi.fn()
const redisGetMock = vi.fn()
const redisSetMock = vi.fn()

vi.mock('../src/lib/prisma', () => ({
	default: {
		platform_settings: {
			findUnique: findUniqueMock,
			upsert: upsertMock,
		},
	},
}))

vi.mock('../src/lib/redis', () => ({
	default: {
		get: redisGetMock,
		set: redisSetMock,
	},
}))

const { APIToolsService } = await import('../src/modules/api-tools/service')

describe('APIToolsService strict user-configured registry', () => {
	beforeEach(() => {
		findUniqueMock.mockReset()
		upsertMock.mockReset()
		redisGetMock.mockReset()
		redisSetMock.mockReset()
	})

	it('listToolsReadOnly returns empty when registry row is missing', async () => {
		redisGetMock.mockResolvedValue(null)
		findUniqueMock.mockResolvedValue(null)

		const result = await APIToolsService.listToolsReadOnly('app-4522')

		expect(result).toEqual([])
		expect(findUniqueMock).toHaveBeenCalledTimes(1)
		expect(redisSetMock).not.toHaveBeenCalled()
	})

	it('listTools returns empty when registry row payload is invalid', async () => {
		redisGetMock.mockResolvedValue(null)
		findUniqueMock.mockResolvedValue({ value: '{invalid-json}' })

		const result = await APIToolsService.listTools('app-4522')

		expect(result).toEqual([])
		expect(redisSetMock).not.toHaveBeenCalled()
		expect(upsertMock).not.toHaveBeenCalled()
	})

	it('listToolsReadOnly returns stored tools when payload is valid', async () => {
		redisGetMock.mockResolvedValue(null)
		findUniqueMock.mockResolvedValue({
			value: JSON.stringify({
				tools: [
					{
						id: 'tool-1',
						created_at: new Date().toISOString(),
						business_id: 'app-4522',
						name: 'get_location_branch',
						description: 'branch locator',
						webhook_address: 'https://local-n8n.scalebiz.chat/webhook/get-location-branch',
						required: ['location'],
						properties: [],
						max_tool_calls: null,
						api_key: null,
						additional_payload: null,
						method: 'POST',
						authorizationKey: null,
						workflow_id: null,
						schema: null,
						type: 'simple',
					},
				],
			}),
		})

		const result = await APIToolsService.listToolsReadOnly('app-4522')

		expect(result).toHaveLength(1)
		expect(result[0]?.name).toBe('get_location_branch')
		expect(redisSetMock).toHaveBeenCalledTimes(1)
	})
})
