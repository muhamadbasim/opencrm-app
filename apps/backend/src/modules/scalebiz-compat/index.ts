import { Elysia } from 'elysia'
import prisma from '../../lib/prisma'
import { appContext } from '../../plugins'
import { BUSINESS_WEBHOOK_EVENTS } from '../business-webhooks/constants'
import { BusinessWebhooksService } from '../business-webhooks/service'

const HOOK_KEY_PREFIX = 'scalebiz_hook:'
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function unauthorized(set: { status?: number | string }) {
	set.status = 401
	return {
		message: 'Invalid API Key',
		error: 'Unauthorized',
		statusCode: 401,
	}
}

function buildHookKey(workflowId: string): string {
	return `${HOOK_KEY_PREFIX}${String(workflowId || '').trim()}`
}

function toNumber(value: unknown): number {
	if (value === null || value === undefined || value === '') return 0
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function parsePositiveInt(value: unknown, fallback: number): number {
	const parsed = Number.parseInt(String(value || ''), 10)
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback
	return parsed
}

const CHAT_EVENT_ALIASES: Record<string, string> = {
	'message.received': 'message.received',
	'message.sent': 'message.sent',
	'conversation.created': 'conversation.created',
	'conversation.handled.by.updated': 'conversation.handled_by_updated',
	'conversation.handled_by.updated': 'conversation.handled_by_updated',
	'conversation.handled_by_updated': 'conversation.handled_by_updated',
	'conversation.stage.status.updated': 'conversation.stage_status_updated',
	'conversation.stage_status.updated': 'conversation.stage_status_updated',
	'conversation.stage_status_updated': 'conversation.stage_status_updated',
	'conversation.pipeline.status.updated': 'conversation.pipeline_status_updated',
	'conversation.pipeline_status.updated': 'conversation.pipeline_status_updated',
	'conversation.pipeline_status_updated': 'conversation.pipeline_status_updated',
	'conversation.labels.updated': 'conversation.labels_updated',
	'conversation.labels_updated': 'conversation.labels_updated',
	'contact.updated': 'contact.updated',
}

function normalizeChatEvent(value: unknown): string | null {
	const raw = String(value || '').trim().toLowerCase()
	if (!raw) return null
	const withoutPrefix = raw.replace(/^on[\s_.-]+/, '')
	const dotted = withoutPrefix
		.replace(/[\s-]+/g, '.')
		.replace(/\.+/g, '.')
		.replace(/^\.+|\.+$/g, '')
	const mapped = CHAT_EVENT_ALIASES[dotted] || dotted
	return BUSINESS_WEBHOOK_EVENTS.includes(mapped as (typeof BUSINESS_WEBHOOK_EVENTS)[number])
		? mapped
		: null
}

function collectChatEvents(payload: Record<string, unknown>): string[] {
	const sourceEvents = Array.isArray(payload.events)
		? payload.events
		: payload.event !== undefined
			? [payload.event]
			: []
	const normalized = sourceEvents
		.map((eventName) => normalizeChatEvent(eventName))
		.filter((eventName): eventName is string => Boolean(eventName))

	return [...new Set(normalized)]
}

function toCompatWebhookRecord(row: Record<string, unknown>) {
	const events = Array.isArray(row.events)
		? row.events.map((eventName) => String(eventName || '').trim()).filter(Boolean)
		: []

	return {
		id: String(row.id || ''),
		webhook_id: String(row.id || ''),
		target_url: String(row.webhook_url || ''),
		events,
		event: events[0] || null,
		is_active: Boolean(row.is_active ?? true),
		created_at: String(row.created_at || ''),
	}
}

export const scalebizCompat = new Elysia({
	prefix: '/scalebiz',
	tags: ['ScaleBiz Compatibility'],
})
	.use(appContext)
	.get('/users', async ({ orgId, resolvedAppId, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		const org = await prisma.organization.findUnique({
			where: { id: orgId },
			select: {
				id: true,
				name: true,
				slug: true,
				app: {
					select: {
						app_id: true,
					},
				},
				members: {
					orderBy: { createdAt: 'asc' },
					take: 1,
					select: {
						user: {
							select: {
								email: true,
							},
						},
					},
				},
			},
		})
		if (!org) return unauthorized(set)

		const email = String(org.members?.[0]?.user?.email || '').trim()
		return {
			id: org.id,
			business_id: org.id,
			business_name: org.name,
			email: email || null,
			slug: org.slug || null,
			app_id: org.app?.app_id || null,
		}
	})
	.get('/workflows', async ({ orgId, resolvedAppId, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		// Primary source for "Choose AI Agents" in n8n trigger form.
		const agents = await prisma.chatbots.findMany({
			where: {
				app_id: resolvedAppId,
				OR: [{ is_deleted: false }, { is_deleted: null }],
			},
			select: {
				id: true,
				name: true,
				is_hidden: true,
				updated_at: true,
				created_at: true,
			},
			orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
			take: 200,
		})

		const visibleAgents = agents.filter((agent) => agent.is_hidden !== true)
		const agentsForOptions = visibleAgents.length > 0 ? visibleAgents : agents

		if (agentsForOptions.length > 0) {
			return agentsForOptions.map((agent) => ({
				id: agent.id,
				title: String(agent.name || '').trim() || `AI Agent ${agent.id.slice(0, 8)}`,
			}))
		}

		// Backward compatibility fallback.
		const workflows = await prisma.automation_flows.findMany({
			where: { app_id: resolvedAppId },
			select: { id: true, name: true },
			orderBy: { created_at: 'desc' },
			take: 200,
		})

		return workflows.map((workflow) => ({
			id: workflow.id,
			title: String(workflow.name || '').trim() || `Workflow ${workflow.id.slice(0, 8)}`,
		}))
	})
	.get('/orders', async ({ orgId, resolvedAppId, query, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		const page = parsePositiveInt(query.page, DEFAULT_PAGE)
		const limit = Math.min(parsePositiveInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT)
		const skip = (page - 1) * limit
		const search = String(query.search || '').trim()
		const orderStatus = String(query.order_status || '').trim()

		const where: {
			app_id: string
			organization_id: string
			order_status?: string
			id?: string
			order_number?: bigint
		} = {
			app_id: resolvedAppId,
			organization_id: orgId,
		}

		if (orderStatus) {
			where.order_status = orderStatus
		}

		if (search) {
			if (/^\d+$/.test(search)) {
				try {
					where.order_number = BigInt(search)
				} catch {
					// ignore invalid big int
				}
			} else if (
				/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
					search,
				)
			) {
				where.id = search
			}
		}

		const [rows, total] = await Promise.all([
			prisma.orders.findMany({
				where,
				orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
				skip,
				take: limit,
			}),
			prisma.orders.count({ where }),
		])

		const orderIds = rows.map((row) => row.id)
		const [itemRows, invoiceRows] = await Promise.all([
			orderIds.length > 0
				? prisma.order_items.findMany({
						where: { order_id: { in: orderIds } },
						orderBy: { created_at: 'asc' },
					})
				: Promise.resolve([]),
			orderIds.length > 0
				? prisma.order_invoices.findMany({
						where: { order_id: { in: orderIds } },
						orderBy: { created_at: 'desc' },
					})
				: Promise.resolve([]),
		])

		const itemsByOrderId = new Map<string, typeof itemRows>()
		for (const row of itemRows) {
			const existing = itemsByOrderId.get(row.order_id) || []
			existing.push(row)
			itemsByOrderId.set(row.order_id, existing)
		}

		const invoicesByOrderId = new Map<string, typeof invoiceRows>()
		for (const row of invoiceRows) {
			const existing = invoicesByOrderId.get(row.order_id) || []
			existing.push(row)
			invoicesByOrderId.set(row.order_id, existing)
		}

		const orders = rows.map((row) => ({
			id: row.id,
			notes: row.notes,
			address: row.address,
			discount: toNumber(row.discount),
			subtotal: toNumber(row.subtotal),
			grand_total: toNumber(row.grand_total),
			shipping_fee: toNumber(row.shipping_fee),
			contact_id: row.contact_id,
			conversation_id: row.conversation_id,
			order_number: row.order_number ? Number(row.order_number) : null,
			order_status: row.order_status || 'pending',
			payment_type: row.payment_type || 'one_time_payment',
			payment_method: row.payment_method || 'custom',
			business_id: row.organization_id,
			created_at: row.created_at,
			updated_at: row.updated_at,
			scalebiz_orders_products: (itemsByOrderId.get(row.id) || []).map((item) => ({
				id: item.id,
				product_id: item.product_id,
				product_name: item.product_name || 'Custom',
				quantity: item.quantity || 0,
				price: toNumber(item.price),
			})),
			invoices: (invoicesByOrderId.get(row.id) || []).map((invoice) => ({
				id: invoice.id,
				status: invoice.status || 'PENDING',
				amount: toNumber(invoice.amount),
				paid_at: invoice.paid_at,
				expiry_date: invoice.expiry_date,
				payment_link: invoice.payment_link,
				pdf_link: invoice.pdf_link,
			})),
		}))

		const totalPages = total > 0 ? Math.ceil(total / limit) : 1

		return {
			message: 'success',
			data: {
				orders,
				pagination: {
					page,
					limit,
					total_items: total,
					total_pages: totalPages,
				},
			},
		}
	})
	.get('/orders/:id', async ({ orgId, resolvedAppId, params, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		const order = await prisma.orders.findFirst({
			where: {
				id: String(params.id || '').trim(),
				organization_id: orgId,
				app_id: resolvedAppId,
			},
		})

		if (!order) {
			set.status = 404
			return {
				message: 'Order not found',
				error: 'Not Found',
				statusCode: 404,
			}
		}

		const [items, invoices] = await Promise.all([
			prisma.order_items.findMany({
				where: { order_id: order.id },
				orderBy: { created_at: 'asc' },
			}),
			prisma.order_invoices.findMany({
				where: { order_id: order.id },
				orderBy: { created_at: 'desc' },
			}),
		])

		return {
			message: 'success',
			data: {
				id: order.id,
				notes: order.notes,
				address: order.address,
				discount: toNumber(order.discount),
				subtotal: toNumber(order.subtotal),
				grand_total: toNumber(order.grand_total),
				shipping_fee: toNumber(order.shipping_fee),
				contact_id: order.contact_id,
				conversation_id: order.conversation_id,
				order_number: order.order_number ? Number(order.order_number) : null,
				order_status: order.order_status || 'pending',
				payment_type: order.payment_type || 'one_time_payment',
				payment_method: order.payment_method || 'custom',
				business_id: order.organization_id,
				created_at: order.created_at,
				updated_at: order.updated_at,
				scalebiz_orders_products: items.map((item) => ({
					id: item.id,
					product_id: item.product_id,
					product_name: item.product_name || 'Custom',
					quantity: item.quantity || 0,
					price: toNumber(item.price),
				})),
				invoices: invoices.map((invoice) => ({
					id: invoice.id,
					status: invoice.status || 'PENDING',
					amount: toNumber(invoice.amount),
					paid_at: invoice.paid_at,
					expiry_date: invoice.expiry_date,
					payment_link: invoice.payment_link,
					pdf_link: invoice.pdf_link,
				})),
			},
		}
	})
	.post('/orders', async ({ orgId, resolvedAppId, body, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		const payload =
			body && typeof body === 'object' && !Array.isArray(body)
				? (body as Record<string, unknown>)
				: {}

		const orderItems = Array.isArray(payload.orderItems)
			? payload.orderItems.filter((item) => item && typeof item === 'object')
			: []

		const subtotal = orderItems.reduce((sum, item) => {
			const typedItem = item as Record<string, unknown>
			const qty = Number(typedItem.quantity || 0)
			const price = Number(typedItem.price || 0)
			return sum + (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0)
		}, 0)
		const discount = toNumber(payload.discount)
		const shippingFee = toNumber(payload.shippingFee)
		const grandTotal = Math.max(0, subtotal - discount + shippingFee)

		const paymentMethod = String(payload.paymentMethod || 'custom').trim() || 'custom'
		const created = await prisma.orders.create({
			data: {
				app_id: resolvedAppId,
				organization_id: orgId,
				contact_id: String(payload.contactId || '').trim() || null,
				conversation_id: String(payload.conversationId || '').trim() || null,
				order_status: 'pending',
				payment_type: 'one_time_payment',
				payment_method: paymentMethod,
				notes: String(payload.name || '').trim() || null,
				address: String(payload.phoneNumber || '').trim() || null,
				subtotal,
				discount,
				shipping_fee: shippingFee,
				grand_total: grandTotal,
				business_bank_account:
					payload.customInvoiceUrl && String(payload.customInvoiceUrl).trim().length > 0
						? { custom_invoice_url: String(payload.customInvoiceUrl).trim() }
						: undefined,
			},
		})

		if (orderItems.length > 0) {
			await prisma.order_items.createMany({
				data: orderItems.map((item) => {
					const typedItem = item as Record<string, unknown>
					return {
						order_id: created.id,
						product_id: String(typedItem.product_id || '').trim() || null,
						product_name: String(typedItem.product_name || 'Custom').trim() || 'Custom',
						quantity: Number(typedItem.quantity || 1),
						price: Number(typedItem.price || 0),
					}
				}),
			})
		}

		const createdItems = await prisma.order_items.findMany({
			where: { order_id: created.id },
			orderBy: { created_at: 'asc' },
		})

		set.status = 201
		return {
			message: 'success',
			data: {
				id: created.id,
				order_number: created.order_number ? Number(created.order_number) : null,
				order_status: created.order_status || 'pending',
				payment_method: created.payment_method || 'custom',
				subtotal: toNumber(created.subtotal),
				discount: toNumber(created.discount),
				shipping_fee: toNumber(created.shipping_fee),
				grand_total: toNumber(created.grand_total),
				scalebiz_orders_products: createdItems.map((item) => ({
					id: item.id,
					product_id: item.product_id,
					product_name: item.product_name || 'Custom',
					quantity: item.quantity || 0,
					price: toNumber(item.price),
				})),
			},
		}
	})
	.patch('/orders/:id', async ({ orgId, resolvedAppId, params, body, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		const orderId = String(params.id || '').trim()
		const order = await prisma.orders.findFirst({
			where: {
				id: orderId,
				organization_id: orgId,
				app_id: resolvedAppId,
			},
		})
		if (!order) {
			set.status = 404
			return {
				message: 'Order not found',
				error: 'Not Found',
				statusCode: 404,
			}
		}

		const payload =
			body && typeof body === 'object' && !Array.isArray(body)
				? (body as Record<string, unknown>)
				: {}

		const orderStatus = String(payload.orderStatus || '').trim()
		const paymentStatus = String(payload.paymentStatus || '').trim()
		const paymentMethod = String(payload.paymentMethod || '').trim()

		const updated = await prisma.orders.update({
			where: { id: order.id },
			data: {
				updated_at: new Date(),
				...(orderStatus ? { order_status: orderStatus } : {}),
				...(paymentMethod ? { payment_method: paymentMethod } : {}),
			},
		})

		if (paymentStatus) {
			const latestInvoice = await prisma.order_invoices.findFirst({
				where: { order_id: order.id },
				orderBy: { created_at: 'desc' },
			})
			const normalizedStatus = paymentStatus.toUpperCase()
			if (latestInvoice) {
				await prisma.order_invoices.update({
					where: { id: latestInvoice.id },
					data: {
						status: normalizedStatus,
						paid_at:
							normalizedStatus === 'PAID' ? latestInvoice.paid_at || new Date() : latestInvoice.paid_at,
					},
				})
			} else {
				await prisma.order_invoices.create({
					data: {
						order_id: order.id,
						amount: updated.grand_total || 0,
						status: normalizedStatus,
						paid_at: normalizedStatus === 'PAID' ? new Date() : null,
					},
				})
			}
		}

		return {
			message: 'success',
			data: {
				id: updated.id,
				order_number: updated.order_number ? Number(updated.order_number) : null,
				order_status: updated.order_status || 'pending',
				payment_method: updated.payment_method || 'custom',
			},
		}
	})
	.get('/workflows/:id/hook', async ({ orgId, resolvedAppId, params, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)
		const workflowId = String(params.id || '').trim()
		if (!workflowId) {
			set.status = 400
			return {
				message: 'Workflow ID required',
				error: 'Bad Request',
				statusCode: 400,
			}
		}

		const setting = await prisma.platform_settings.findUnique({
			where: { key: buildHookKey(workflowId) },
			select: { value: true },
		})

		if (!setting?.value) {
			return {
				webhook_id: workflowId,
				target_url: '',
			}
		}

		try {
			const parsed = JSON.parse(setting.value) as {
				webhook_id?: string
				target_url?: string
			}
			return {
				webhook_id: String(parsed.webhook_id || workflowId),
				target_url: String(parsed.target_url || ''),
			}
		} catch {
			return {
				webhook_id: workflowId,
				target_url: '',
			}
		}
	})
	.post('/workflows/:id/hook', async ({ orgId, resolvedAppId, params, body, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)
		const workflowId = String(params.id || '').trim()
		const requestBody =
			body && typeof body === 'object' && !Array.isArray(body)
				? (body as Record<string, unknown>)
				: {}
		const targetUrl = String(requestBody.target_url || '').trim()

		if (!workflowId || !targetUrl) {
			set.status = 400
			return {
				message: 'workflow id and target_url are required',
				error: 'Bad Request',
				statusCode: 400,
			}
		}

		await prisma.platform_settings.upsert({
			where: { key: buildHookKey(workflowId) },
			update: {
				value: JSON.stringify({
					webhook_id: workflowId,
					target_url: targetUrl,
				}),
				updated_at: new Date(),
			},
			create: {
				key: buildHookKey(workflowId),
				value: JSON.stringify({
					webhook_id: workflowId,
					target_url: targetUrl,
				}),
			},
		})

		return {
			webhook_id: workflowId,
			target_url: targetUrl,
		}
	})
	.delete('/workflows/:id/hook', async ({ orgId, resolvedAppId, params, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)
		const workflowId = String(params.id || '').trim()
		if (!workflowId) {
			set.status = 400
			return {
				message: 'Workflow ID required',
				error: 'Bad Request',
				statusCode: 400,
			}
		}

		await prisma.platform_settings.deleteMany({
			where: { key: buildHookKey(workflowId) },
		})

		return { success: true }
	})
	.get('/chat/webhooks/subscriptions', async ({ orgId, resolvedAppId, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		const subscriptions = await BusinessWebhooksService.listWebhooks(resolvedAppId)
		return subscriptions.map((row) =>
			toCompatWebhookRecord(row as unknown as Record<string, unknown>),
		)
	})
	.post('/chat/webhooks/subscriptions', async ({ orgId, resolvedAppId, body, set }) => {
		if (!orgId || !resolvedAppId) return unauthorized(set)

		const payload =
			body && typeof body === 'object' && !Array.isArray(body)
				? (body as Record<string, unknown>)
				: {}
		const targetUrl = String(
			payload.target_url || payload.targetUrl || payload.webhook_url || payload.url || '',
		).trim()
		const events = collectChatEvents(payload)

		if (!targetUrl) {
			set.status = 400
			return {
				message: 'target_url is required',
				error: 'Bad Request',
				statusCode: 400,
			}
		}

		if (events.length === 0) {
			set.status = 400
			return {
				message: 'at least one valid event is required',
				error: 'Bad Request',
				statusCode: 400,
			}
		}

		const existingRows = await BusinessWebhooksService.listWebhooks(resolvedAppId)
		const existing = existingRows.find(
			(row) =>
				String((row as Record<string, unknown>).webhook_url || '').trim() === targetUrl,
		)

		if (existing) {
			const existingEvents = Array.isArray(
				(existing as Record<string, unknown>).events,
			)
				? ((existing as Record<string, unknown>).events as unknown[])
						.map((eventName) => normalizeChatEvent(eventName))
						.filter((eventName): eventName is string => Boolean(eventName))
				: []
			const mergedEvents = [...new Set([...existingEvents, ...events])]
			const updated = await BusinessWebhooksService.updateWebhook(
				resolvedAppId,
				String((existing as Record<string, unknown>).id || ''),
				{
					webhook_url: targetUrl,
					events: mergedEvents,
					is_active: true,
				},
			)

			if (!updated) {
				set.status = 404
				return {
					message: 'Webhook not found',
					error: 'Not Found',
					statusCode: 404,
				}
			}

			return toCompatWebhookRecord(updated as unknown as Record<string, unknown>)
		}

		const created = await BusinessWebhooksService.createWebhook(resolvedAppId, {
			name: 'n8n ScaleBiz Chat Trigger',
			webhook_url: targetUrl,
			events,
			is_active: true,
		})

		return toCompatWebhookRecord(created as unknown as Record<string, unknown>)
	})
	.delete(
		'/chat/webhooks/subscriptions/:id',
		async ({ orgId, resolvedAppId, params, set }) => {
			if (!orgId || !resolvedAppId) return unauthorized(set)

			const webhookId = String(params.id || '').trim()
			if (!webhookId) {
				set.status = 400
				return {
					message: 'Webhook ID required',
					error: 'Bad Request',
					statusCode: 400,
				}
			}

			const deleted = await BusinessWebhooksService.deleteWebhook(
				resolvedAppId,
				webhookId,
			)
			if (!deleted) {
				set.status = 404
				return {
					message: 'Webhook not found',
					error: 'Not Found',
					statusCode: 404,
				}
			}

			return { success: true, webhook_id: webhookId }
		},
	)
