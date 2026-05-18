import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockContactFindMany = vi.fn()
const mockQueryRaw = vi.fn()
const mockResolveAppId = vi.fn()

vi.mock('../src/lib/prisma', () => ({
	default: {
		contacts: {
			findMany: mockContactFindMany,
		},
		$queryRaw: mockQueryRaw,
	},
}))

vi.mock('../src/lib/utils', () => ({
	resolveAppId: mockResolveAppId,
}))

const {
	BroadcastService,
	normalizeBroadcastAudienceFilters,
	resolveBroadcastAudience,
} = await import('../src/modules/broadcast/service')

describe('broadcast audience resolver', () => {
	const APP_ID = '6aa3b21b-25b9-4573-9f33-3a4dcd5ec3c3'

	beforeEach(() => {
		vi.resetAllMocks()
		mockResolveAppId.mockResolvedValue(APP_ID)
	})

	it('deduplicates explicit number recipients and preserves variables', async () => {
		const recipients = await resolveBroadcastAudience(APP_ID, {
			type: 'numbers',
			source: 'manual',
			recipients: [
				{
					phoneNumber: '+62 812-3456-7890',
					variables: { '{{1}}': 'Rina' },
					'2': 'PROMO',
				},
				{
					phone: '6281234567890',
					variables: { '1': 'Duplicate' },
				},
			],
		})

		expect(recipients).toEqual([
			{
				contactId: null,
				contactName: null,
				recipientPhone: '6281234567890',
				variables: {
					'1': 'Rina',
					'2': 'PROMO',
				},
			},
		])
	})

	it('resolves selected customer contacts only', async () => {
		mockContactFindMany.mockResolvedValue([
			{
				id: 'contact-1',
				name: 'Rina',
				phone_number: '+62 812-3456-7890',
				whatsapp_id: null,
			},
			{
				id: 'contact-2',
				name: 'Budi',
				phone_number: null,
				whatsapp_id: '6282111223344',
			},
		])

		const recipients = await resolveBroadcastAudience(APP_ID, {
			type: 'contacts',
			contactIds: ['contact-1', 'contact-2'],
		})

		expect(mockContactFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: { in: ['contact-1', 'contact-2'] },
				}),
			}),
		)
		expect(recipients.map((item) => item.recipientPhone)).toEqual([
			'6281234567890',
			'6282111223344',
		])
	})

	it('normalizes filter defaults and previews filtered audience count', async () => {
		mockQueryRaw.mockResolvedValue([
			{
				id: 'contact-1',
				name: 'Rina',
				phone_number: '+62 812-3456-7890',
				whatsapp_id: null,
			},
			{
				id: 'contact-2',
				name: 'Duplicate Phone',
				phone_number: '6281234567890',
				whatsapp_id: null,
			},
		])

		const preview = await BroadcastService.previewAudience(APP_ID, {
			cities: ['Jakarta', 'Bandung'],
			minPaidOrders: 2,
			lastActiveWithinDays: 14,
			excludeOptedOut: false,
		})

		expect(preview).toEqual({
			total: 1,
			filters: {
				cities: ['Jakarta', 'Bandung'],
				minPaidOrders: 2,
				lastActiveWithinDays: 14,
				excludeOptedOut: false,
			},
		})
		expect(mockQueryRaw).toHaveBeenCalled()
	})

	it('rejects unknown target audience types instead of falling back to all contacts', async () => {
		await expect(
			resolveBroadcastAudience(APP_ID, { type: 'legacy-whatever' }),
		).rejects.toThrow('Unsupported broadcast target audience type')
		expect(mockContactFindMany).not.toHaveBeenCalled()
	})

	it('keeps default target audience filters aligned with the broadcast UI', () => {
		expect(normalizeBroadcastAudienceFilters({})).toEqual({
			cities: [],
			minPaidOrders: 1,
			lastActiveWithinDays: 30,
			excludeOptedOut: true,
		})
	})
})
