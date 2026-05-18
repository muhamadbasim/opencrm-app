import { Elysia, t } from 'elysia'
import { appContext } from '../../plugins'
import { CustomerService } from './service'

export const customer = new Elysia({ prefix: '/customers', tags: ['Customer'] })
	.use(appContext)
	.get(
		'/',
		async ({ resolvedAppId, query, set }) => {
			if (!resolvedAppId) {
				set.status = 400
				return { error: 'App ID required' }
			}

			const result = await CustomerService.listCustomers({
				appId: resolvedAppId,
				search: query.search || query.q,
				page: query.page ? parseInt(query.page, 10) : 1,
				perPage: query.per_page ? parseInt(query.per_page, 10) : 20,
				sort: query.sort,
				order: query.order,
			})

			return {
				success: true,
				payload: result.payload,
				meta: result.meta,
			}
		},
		{
			query: t.Object({
				page: t.Optional(t.String()),
				per_page: t.Optional(t.String()),
				search: t.Optional(t.String()),
				q: t.Optional(t.String()),
				pipeline_stage_id: t.Optional(t.String()),
				consent_status: t.Optional(t.String()),
				tag_id: t.Optional(t.String()),
				channel: t.Optional(t.String()),
				sort: t.Optional(t.String()),
				order: t.Optional(t.String()),
			}),
		},
	)
	.get('/stats', async ({ resolvedAppId, set }) => {
		if (!resolvedAppId) {
			set.status = 400
			return { error: 'App ID required' }
		}

		const stats = await CustomerService.getCustomerStats({
			appId: resolvedAppId,
		})

		return {
			success: true,
			payload: stats,
		}
	})
	.get('/levels/settings', async ({ resolvedAppId, set }) => {
		if (!resolvedAppId) {
			set.status = 400
			return { error: 'App ID required' }
		}

		const settings = await CustomerService.getCustomerLevelSettings({
			appId: resolvedAppId,
		})

		return {
			success: true,
			payload: settings,
		}
	})
	.put(
		'/levels/settings',
		async ({ resolvedAppId, body, set }) => {
			if (!resolvedAppId) {
				set.status = 400
				return { error: 'App ID required' }
			}

			try {
				const settings = await CustomerService.updateCustomerLevelMappings({
					appId: resolvedAppId,
					mappings: body,
				})

				return {
					success: true,
					payload: settings,
				}
			} catch (error) {
				set.status = 400
				return {
					error:
						error instanceof Error
							? error.message
							: 'Failed to update customer level settings',
				}
			}
		},
		{
			body: t.Object({
				vip: t.Optional(t.Union([t.String(), t.Null()])),
				premium: t.Optional(t.Union([t.String(), t.Null()])),
				basic: t.Optional(t.Union([t.String(), t.Null()])),
			}),
		},
	)
	.get(
		'/levels/preview',
		async ({ resolvedAppId, query, set }) => {
			if (!resolvedAppId) {
				set.status = 400
				return { error: 'App ID required' }
			}

			const preview = await CustomerService.getCustomerLevelPreview({
				appId: resolvedAppId,
				limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
			})

			return {
				success: true,
				payload: preview,
			}
		},
		{
			query: t.Object({
				limit: t.Optional(t.String()),
			}),
		},
	)
	.get(
		'/:id',
		async ({ params, set }) => {
			const customer = await CustomerService.getCustomerById(params.id)
			if (!customer) {
				set.status = 404
				return { error: 'Customer not found' }
			}
			return { success: true, payload: customer }
		},
		{
			params: t.Object({ id: t.String() }),
		},
	)
	.put(
		'/:id',
		async ({ params, body, set }) => {
			try {
				const customer = await CustomerService.updateCustomer(params.id, body)
				if (!customer) {
					set.status = 404
					return { error: 'Customer not found' }
				}
				return { success: true, payload: customer }
			} catch (error) {
				set.status = 400
				return {
					error:
						error instanceof Error ? error.message : 'Failed to update customer',
				}
			}
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				name: t.Optional(t.String()),
				email: t.Optional(t.String()),
				phone_number: t.Optional(t.String()),
				notes: t.Optional(t.String()),
				lead_score: t.Optional(t.Number()),
				pipeline_stage_id: t.Optional(t.String()),
				consent_status: t.Optional(t.String()),
				consent_purpose: t.Optional(t.String()),
				consent_source: t.Optional(t.String()),
				custom_attributes: t.Optional(t.Any()),
			}),
		},
	)
	.post(
		'/:id/tags',
		async ({ params, body, resolvedAppId, set }) => {
			if (!resolvedAppId) {
				set.status = 400
				return { error: 'App ID required' }
			}

			const customer = await CustomerService.addTagToCustomer(
				params.id,
				resolvedAppId,
				body,
			)

			if (!customer) {
				set.status = 400
				return { error: 'Invalid customer or tag data' }
			}

			return { success: true, payload: customer }
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				tag_id: t.Optional(t.String()),
				tag_name: t.Optional(t.String()),
			}),
		},
	)
	.delete(
		'/:id/tags/:tagId',
		async ({ params, set }) => {
			const customer = await CustomerService.removeTagFromCustomer(
				params.id,
				params.tagId,
			)

			if (!customer) {
				set.status = 400
				return { error: 'Invalid customer or tag data' }
			}

			return { success: true, payload: customer }
		},
		{
			params: t.Object({ id: t.String(), tagId: t.String() }),
		},
	)
