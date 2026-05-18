import { Elysia, t } from 'elysia'
import { CommerceService } from '../commerce/service'

function toHeaderRecord(headers: Record<string, unknown>) {
	const normalized: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(headers || {})) {
		normalized[key.toLowerCase()] = value
	}
	return normalized
}

export const pakasirWebhook = new Elysia({ prefix: '/pakasir' }).post(
	'/',
	async ({ body, headers, set }) => {
		try {
			const payload =
				body && typeof body === 'object' && !Array.isArray(body)
					? (body as Record<string, unknown>)
					: {}

			const data = await CommerceService.handlePakasirWebhook({
				payload,
				headers: toHeaderRecord(headers as Record<string, unknown>),
			})

			return { success: true, data }
		} catch (error: unknown) {
			console.error('[pakasir-webhook] failed to process webhook', error)
			set.status = 400
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Failed to process Pakasir webhook',
			}
		}
	},
	{
		body: t.Any(),
	},
)
