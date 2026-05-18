import { Elysia, t } from 'elysia'
import { appContext } from '../../plugins'
import { CommerceService } from './service'

function unauthorized(set: { status?: number | string }) {
	set.status = 401
	return {
		error: 'Unauthorized',
		message: 'App context is required',
	}
}

function badRequest(set: { status?: number | string }, error: unknown) {
	set.status = 400
	return {
		error: error instanceof Error ? error.message : 'Bad Request',
	}
}

export const commerce = new Elysia({ tags: ['Commerce'] })
	.use(appContext)
	.get('/commerce/products', async ({ resolvedAppId, set }) => {
		if (!resolvedAppId) return unauthorized(set)
		try {
			const data = await CommerceService.listProducts(resolvedAppId)
			return { message: 'success', data }
		} catch (error) {
			return badRequest(set, error)
		}
	})
	.post(
		'/commerce/products',
		async ({ resolvedAppId, body, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const product = await CommerceService.createProduct(resolvedAppId, {
					name: String(payload.name || ''),
					sku: payload.sku ? String(payload.sku) : undefined,
					image_url: payload.image_url ? String(payload.image_url) : undefined,
					description: payload.description
						? String(payload.description)
						: undefined,
					base_price: Number(payload.base_price || payload.price || 0),
					is_active:
						typeof payload.is_active === 'boolean'
							? payload.is_active
							: undefined,
					metadata:
						payload.metadata && typeof payload.metadata === 'object'
							? (payload.metadata as Record<string, unknown>)
							: undefined,
				})
				set.status = 201
				return { message: 'success', data: product }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			body: t.Any(),
		},
	)
	.patch(
		'/commerce/products/:id',
		async ({ resolvedAppId, params, body, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.updateProduct(
					resolvedAppId,
					params.id,
					(body || {}) as Record<string, unknown>,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Any(),
		},
	)
	.delete(
		'/commerce/products/:id',
		async ({ resolvedAppId, params, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.deactivateProduct(
					resolvedAppId,
					params.id,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ id: t.String() }),
		},
	)
	.post(
		'/commerce/products/:id/variants',
		async ({ resolvedAppId, params, body, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const variant = await CommerceService.createVariant(
					resolvedAppId,
					params.id,
					{
						name: String(payload.name || ''),
						sku: payload.sku ? String(payload.sku) : undefined,
						image_url: payload.image_url
							? String(payload.image_url)
							: undefined,
						attributes:
							payload.attributes && typeof payload.attributes === 'object'
								? (payload.attributes as Record<string, unknown>)
								: undefined,
						price: Number(payload.price || 0),
						stock_on_hand: Number(payload.stock_on_hand || 0),
						is_active:
							typeof payload.is_active === 'boolean'
								? payload.is_active
								: undefined,
					},
				)
				set.status = 201
				return { message: 'success', data: variant }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Any(),
		},
	)
	.post(
		'/commerce/products/:id/variants/bulk-upsert',
		async ({ resolvedAppId, params, body, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const data = await CommerceService.bulkUpsertVariants(
					resolvedAppId,
					params.id,
					{
						upserts: payload.upserts,
						deactivate_variant_ids: payload.deactivate_variant_ids,
					},
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Any(),
		},
	)
	.patch(
		'/commerce/variants/:id',
		async ({ resolvedAppId, params, body, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.updateVariant(
					resolvedAppId,
					params.id,
					(body || {}) as Record<string, unknown>,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Any(),
		},
	)
	.delete(
		'/commerce/variants/:id',
		async ({ resolvedAppId, params, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.deactivateVariant(
					resolvedAppId,
					params.id,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ id: t.String() }),
		},
	)
	.post(
		'/commerce/variants/:id/stock-adjust',
		async ({ resolvedAppId, params, body, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const adjustment = await CommerceService.adjustVariantStock(
					resolvedAppId,
					params.id,
					{
						quantity: Number(payload.quantity || 0),
						note: payload.note ? String(payload.note) : undefined,
						movement_type: payload.movement_type
							? String(payload.movement_type)
							: undefined,
					},
				)
				return { message: 'success', data: adjustment }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Any(),
		},
	)
	.get(
		'/commerce/stock/variants',
		async ({ resolvedAppId, query, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.listStockVariants(
					resolvedAppId,
					query as Record<string, unknown>,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			query: t.Any(),
		},
	)
	.get(
		'/commerce/stock/movements',
		async ({ resolvedAppId, query, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.listStockMovements(
					resolvedAppId,
					query as Record<string, unknown>,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			query: t.Any(),
		},
	)
	.get(
		'/commerce/orders',
		async ({ resolvedAppId, query, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.listOrders(
					resolvedAppId,
					query as Record<string, unknown>,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			query: t.Any(),
		},
	)
	.get(
		'/commerce/orders/:orderId',
		async ({ resolvedAppId, params, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.getOrderDetail(
					resolvedAppId,
					params.orderId,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ orderId: t.String() }),
		},
	)
	.get(
		'/commerce/conversations/:conversationId/summary',
		async ({ resolvedAppId, params, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.getConversationSummary(
					resolvedAppId,
					params.conversationId,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ conversationId: t.String() }),
		},
	)
	.post(
		'/commerce/orders/add-to-cart',
		async ({ resolvedAppId, body, userId, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const items = Array.isArray(payload.items)
					? payload.items
					: payload.variant_id
						? [
								{
									variant_id: payload.variant_id,
									quantity: payload.quantity || 1,
								},
							]
						: []

				const data = await CommerceService.addToCart(
					resolvedAppId,
					{
						conversation_id: String(payload.conversation_id || ''),
						order_id: payload.order_id ? String(payload.order_id) : undefined,
						contact_id: payload.contact_id
							? String(payload.contact_id)
							: undefined,
						items: items as Array<{ variant_id: string; quantity: number }>,
					},
					userId,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{ body: t.Any() },
	)
	.post(
		'/commerce/orders/:orderId/checkout',
		async ({ resolvedAppId, params, body, userId, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const data = await CommerceService.checkoutOrder(
					resolvedAppId,
					params.orderId,
					{
						payment_method: payload.payment_method
							? String(payload.payment_method)
							: undefined,
						expires_in_minutes: payload.expires_in_minutes
							? Number(payload.expires_in_minutes)
							: undefined,
					},
					userId,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ orderId: t.String() }),
			body: t.Any(),
		},
	)
	.post(
		'/commerce/orders/:orderId/send-payment-link',
		async ({ resolvedAppId, params, body, userId, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const data = await CommerceService.sendPaymentLink(
					resolvedAppId,
					params.orderId,
					{
						payment_method: payload.payment_method
							? String(payload.payment_method)
							: undefined,
						channel: payload.channel ? String(payload.channel) : undefined,
						message_template: payload.message_template
							? String(payload.message_template)
							: undefined,
					},
					userId,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ orderId: t.String() }),
			body: t.Any(),
		},
	)
	.post(
		'/commerce/orders/:orderId/cancel',
		async ({ resolvedAppId, params, body, userId, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const payload = (body || {}) as Record<string, unknown>
				const data = await CommerceService.cancelOrder(
					resolvedAppId,
					params.orderId,
					{
						reason: payload.reason ? String(payload.reason) : undefined,
					},
					userId,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ orderId: t.String() }),
			body: t.Any(),
		},
	)
	.get(
		'/commerce/settings/pakasir',
		async ({ resolvedAppId, request, headers, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.getPakasirSettings(
					resolvedAppId,
					request.url,
					headers as Record<string, unknown>,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
	)
	.patch(
		'/commerce/settings/pakasir',
		async ({ resolvedAppId, body, request, headers, userId, set }) => {
			if (!resolvedAppId) return unauthorized(set)
			try {
				const data = await CommerceService.updatePakasirSettings(
					resolvedAppId,
					(body || {}) as Record<string, unknown>,
					userId,
					request.url,
					headers as Record<string, unknown>,
				)
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			body: t.Any(),
		},
	)
	.get(
		'/public/invoices/:token',
		async ({ params, set }) => {
			try {
				const invoice = await CommerceService.getPublicInvoiceByToken(
					params.token,
				)
				if (!invoice) {
					set.status = 404
					return {
						error: 'Invoice not found',
					}
				}
				return { message: 'success', data: invoice }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			params: t.Object({ token: t.String() }),
		},
	)
	.get(
		'/public/payment-success',
		async ({ query, set }) => {
			try {
				const data = await CommerceService.getPublicPaymentSuccessDetail(
					(query || {}) as Record<string, unknown>,
				)
				if (!data) {
					set.status = 404
					return {
						error: 'Payment detail not found',
					}
				}
				return { message: 'success', data }
			} catch (error) {
				return badRequest(set, error)
			}
		},
		{
			query: t.Any(),
		},
	)
