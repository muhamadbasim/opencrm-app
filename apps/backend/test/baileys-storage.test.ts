import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockQueryRaw = vi.fn()
const mockExecuteRawUnsafe = vi.fn()

vi.mock('../src/lib/prisma', () => ({
	default: {
		$queryRaw: mockQueryRaw,
		$executeRawUnsafe: mockExecuteRawUnsafe,
	},
}))

const {
	ensureBaileysSessionStorage,
	resetBaileysSessionStorageForTests,
} = await import('../src/modules/whatsapp/baileys-storage')

describe('ensureBaileysSessionStorage', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		resetBaileysSessionStorageForTests()
	})

	it('creates the baileys_sessions table when it is missing', async () => {
		mockQueryRaw.mockResolvedValue([{ exists: false }])
		mockExecuteRawUnsafe.mockResolvedValue(0)

		await ensureBaileysSessionStorage()

		expect(mockQueryRaw).toHaveBeenCalledTimes(1)
		expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(5)
		expect(mockExecuteRawUnsafe.mock.calls[0]?.[0]).toContain(
			'CREATE TABLE IF NOT EXISTS "baileys_sessions"',
		)
	})

	it('skips DDL when the baileys_sessions table already exists', async () => {
		mockQueryRaw.mockResolvedValue([{ exists: true }])

		await ensureBaileysSessionStorage()

		expect(mockQueryRaw).toHaveBeenCalledTimes(1)
		expect(mockExecuteRawUnsafe).not.toHaveBeenCalled()
	})
})

