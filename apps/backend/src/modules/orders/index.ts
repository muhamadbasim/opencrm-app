import { Elysia, t } from 'elysia'
import prisma from '../../lib/prisma'
import { appContext } from '../../plugins'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

const ORDER_SORT_FIELDS: Record<string, string> = {
	created_at: 'o.created_at',
	order_number: 'o.order_number',
	grand_total: 'o.grand_total',
	amount: 'o.grand_total',
	order_status: 'o.order_status',
	customer: 'COALESCE(c.name, c.email, c.phone_number)',
}

const SUBSCRIPTION_SORT_FIELDS: Record<string, string> = {
	created_at: 's.created_at',
	subscription_number: 's.subscription_number',
	next_billing: 's.next_billing',
	billing_amount: 's.billing_amount',
	status: 's.status',
	customer: 'COALESCE(c.name, c.email, c.phone_number)',
}

type SortDirection = 'asc' | 'desc'

type DateRange = {
	currentStart: Date
	currentEnd: Date
	previousStart: Date
	previousEnd: Date
}

type DashboardAggregate = {
	total_sales: number
	total_orders: number
	total_completed_orders: number
}

type RawOrderRow = {
	id: string
	notes: string | null
	address: string | null
	discount: string | number | null
	subtotal: string | number | null
	contact_id: string | null
	created_at: string | Date | null
	updated_at: string | Date | null
	organization_id: string | null
	grand_total: string | number | null
	order_number: string | number | null
	order_status: string | null
	payment_type: string | null
	shipping_fee: string | number | null
	payment_method: string | null
	conversation_id: string | null
	business_bank_account: unknown
	contact_name: string | null
	contact_email: string | null
	contact_phone_number: string | null
	contact_created_at: string | Date | null
	contact_updated_at: string | Date | null
	contact_additional_attributes: unknown
	conversation_inbox_id: string | null
	inbox_name: string | null
	inbox_type: string | null
	inbox_phone_number: string | null
}

type RawInvoiceRow = {
	id: string
	order_id: string
	amount: string | number | null
	status: string | null
	paid_at: string | Date | null
	pdf_link: string | null
	payment_link: string | null
	xendit_invoice_id: string | null
	expiry_date: string | Date | null
	created_at: string | Date | null
}

type RawOrderItemRow = {
	id: string
	order_id: string
	price: string | number | null
	quantity: number | null
	created_at: string | Date | null
	product_id: string | null
	product_name: string | null
}

type RawSubscriptionRow = {
	id: string
	subscription_number: string | number | null
	status: string | null
	subscription_type: string | null
	item_name: string | null
	billing_amount: string | number | null
	cycles: number | null
	start_date: string | Date | null
	next_billing: string | Date | null
	end_date: string | Date | null
	created_at: string | Date | null
	updated_at: string | Date | null
	contact_id: string | null
	contact_name: string | null
	contact_email: string | null
	contact_phone_number: string | null
}

function toNumber(value: unknown): number {
	if (value === null || value === undefined) return 0
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function toIsoString(value: unknown): string | null {
	if (!value) return null
	const date = value instanceof Date ? value : new Date(String(value))
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(String(value || ''), 10)
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback
	return parsed
}

function normalizeSortDirection(direction?: string): SortDirection {
	return String(direction || '').toLowerCase() === 'asc' ? 'asc' : 'desc'
}

function normalizeSortField(
	field: string | undefined,
	map: Record<string, string>,
	fallback: string,
): { key: string; sql: string } {
	const normalized = String(field || '').trim().toLowerCase()
	if (normalized && map[normalized]) {
		return { key: normalized, sql: map[normalized] }
	}
	return { key: fallback, sql: map[fallback] }
}

function parseBoolean(value: unknown, fallback = false): boolean {
	if (typeof value === 'boolean') return value
	if (typeof value !== 'string') return fallback
	const normalized = value.trim().toLowerCase()
	if (['1', 'true', 'yes', 'y'].includes(normalized)) return true
	if (['0', 'false', 'no', 'n'].includes(normalized)) return false
	return fallback
}

function addParam(params: unknown[], value: unknown): string {
	params.push(value)
	return `$${params.length}`
}

function buildScopeClause(
	params: unknown[],
	alias: string,
	orgId?: string | null,
	resolvedAppId?: string | null,
): string {
	const clauses: string[] = []

	if (orgId) {
		clauses.push(`${alias}.organization_id = ${addParam(params, orgId)}`)
	}

	if (resolvedAppId) {
		clauses.push(`${alias}.app_id = ${addParam(params, resolvedAppId)}`)
	}

	if (clauses.length === 0) {
		return ''
	}

	if (clauses.length === 1) {
		return clauses[0]
	}

	return `(${clauses.join(' OR ')})`
}

function buildTextFromError(error: unknown): string {
	if (error instanceof Error) {
		const meta = (error as { meta?: unknown }).meta
		return `${error.message} ${meta ? JSON.stringify(meta) : ''}`.toLowerCase()
	}

	const raw = String(error || '')
	return raw.toLowerCase()
}

function isMissingRelationError(error: unknown, relation: string): boolean {
	const text = buildTextFromError(error)
	return (
		text.includes('42p01') ||
		text.includes(`relation \"${relation.toLowerCase()}\" does not exist`) ||
		text.includes(`relation '${relation.toLowerCase()}' does not exist`)
	)
}

function parseDateInput(value: string | undefined, endOfDay = false): Date | null {
	const raw = String(value || '').trim()
	if (!raw) return null

	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		const [year, month, day] = raw.split('-').map((part) => Number.parseInt(part, 10))
		if (!year || !month || !day) return null

		if (endOfDay) {
			return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
		}
		return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
	}

	const parsed = new Date(raw)
	if (Number.isNaN(parsed.getTime())) return null
	return parsed
}

function resolveDateRange(startDate?: string, endDate?: string): DateRange {
	const now = new Date()
	const parsedStart = parseDateInput(startDate, false)
	const parsedEnd = parseDateInput(endDate, true)

	let currentStart: Date
	let currentEnd: Date

	if (!parsedStart && !parsedEnd) {
		currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
		currentEnd = now
	} else {
		currentStart = parsedStart || parsedEnd || now
		currentEnd = parsedEnd || parsedStart || now
	}

	if (currentStart.getTime() > currentEnd.getTime()) {
		const temp = currentStart
		currentStart = currentEnd
		currentEnd = temp
	}

	const durationMs = Math.max(1, currentEnd.getTime() - currentStart.getTime() + 1)
	const previousEnd = new Date(currentStart.getTime() - 1)
	const previousStart = new Date(previousEnd.getTime() - durationMs + 1)

	return {
		currentStart,
		currentEnd,
		previousStart,
		previousEnd,
	}
}

async function getDashboardAggregate(
	scopeClause: string,
	scopeParams: unknown[],
	startDate: Date,
	endDate: Date,
): Promise<DashboardAggregate> {
	const params = [...scopeParams]
	const whereParts: string[] = []

	if (scopeClause) {
		whereParts.push(scopeClause)
	}

	whereParts.push(`o.created_at >= ${addParam(params, startDate)}`)
	whereParts.push(`o.created_at <= ${addParam(params, endDate)}`)

	const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

	const rows = (await prisma.$queryRawUnsafe(
		`SELECT
			COALESCE(SUM(o.grand_total), 0)::double precision AS total_sales,
			COUNT(*)::bigint AS total_orders,
			COUNT(*) FILTER (WHERE LOWER(COALESCE(o.order_status, '')) = 'completed')::bigint AS total_completed_orders
		FROM orders o
		${whereSql}`,
		...params,
	)) as Array<{
		total_sales: number | null
		total_orders: number | string | null
		total_completed_orders: number | string | null
	}>

	const first = rows[0]
	return {
		total_sales: toNumber(first?.total_sales),
		total_orders: toNumber(first?.total_orders),
		total_completed_orders: toNumber(first?.total_completed_orders),
	}
}

export const orders = new Elysia({ prefix: '/orders', tags: ['Orders'] })
	.use(appContext)
	.get(
		'/',
		async ({ query, orgId, resolvedAppId, set }) => {
			if (!orgId && !resolvedAppId) {
				set.status = 400
				return { error: 'Organization context required' }
			}

			const page = parsePositiveInt(query.page, DEFAULT_PAGE)
			const rawLimit = parsePositiveInt(query.limit, DEFAULT_LIMIT)
			const limit = Math.min(rawLimit, MAX_LIMIT)
			const offset = (page - 1) * limit

			const sortDirection = normalizeSortDirection(query.sort_direction)
			const sortField = normalizeSortField(
				query.sort_field,
				ORDER_SORT_FIELDS,
				'created_at',
			)
			const includeConv = parseBoolean(query.include_conv, true)

			const params: unknown[] = []
			const whereParts: string[] = []

			const scopeClause = buildScopeClause(params, 'o', orgId, resolvedAppId)
			if (scopeClause) {
				whereParts.push(scopeClause)
			}

			if (query.order_status) {
				whereParts.push(`LOWER(COALESCE(o.order_status, '')) = LOWER(${addParam(params, query.order_status)})`)
			}

			if (query.payment_type) {
				whereParts.push(`LOWER(COALESCE(o.payment_type, '')) = LOWER(${addParam(params, query.payment_type)})`)
			}

			if (query.inbox_id) {
				whereParts.push(`conv.inbox_id = ${addParam(params, query.inbox_id)}`)
			}

			if (query.search) {
				const searchLike = `%${String(query.search).trim()}%`
				const placeholder = addParam(params, searchLike)
				whereParts.push(`(
					COALESCE(c.name, '') ILIKE ${placeholder}
					OR COALESCE(c.email, '') ILIKE ${placeholder}
					OR COALESCE(c.phone_number, '') ILIKE ${placeholder}
					OR COALESCE(o.order_number::text, '') ILIKE ${placeholder}
				)`) 
			}

			const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

			try {
				const totalRows = (await prisma.$queryRawUnsafe(
					`SELECT COUNT(*)::bigint AS total
					FROM orders o
					LEFT JOIN contacts c ON c.id = o.contact_id
					LEFT JOIN conversations conv ON conv.id = o.conversation_id
					${whereSql}`,
					...params,
				)) as Array<{ total: number | string | null }>

				const totalItems = toNumber(totalRows[0]?.total)
				const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 1

				const listParams = [...params]
				const limitPlaceholder = addParam(listParams, limit)
				const offsetPlaceholder = addParam(listParams, offset)

				const orderRows = (await prisma.$queryRawUnsafe(
					`SELECT
						o.id,
						o.notes,
						o.address,
						o.discount,
						o.subtotal,
						o.contact_id,
						o.created_at,
						o.updated_at,
						o.organization_id,
						o.grand_total,
						o.order_number,
						o.order_status,
						o.payment_type,
						o.shipping_fee,
						o.payment_method,
						o.conversation_id,
						o.business_bank_account,
						c.name AS contact_name,
						c.email AS contact_email,
						c.phone_number AS contact_phone_number,
						c.created_at AS contact_created_at,
						c.updated_at AS contact_updated_at,
						c.additional_attributes AS contact_additional_attributes,
						conv.inbox_id AS conversation_inbox_id,
						i.name AS inbox_name,
						i.channel_type AS inbox_type,
						null::text AS inbox_phone_number
					FROM orders o
					LEFT JOIN contacts c ON c.id = o.contact_id
					LEFT JOIN conversations conv ON conv.id = o.conversation_id
					LEFT JOIN inboxes i ON i.id = conv.inbox_id
					${whereSql}
					ORDER BY ${sortField.sql} ${sortDirection.toUpperCase()}
					LIMIT ${limitPlaceholder}
					OFFSET ${offsetPlaceholder}`,
					...listParams,
				)) as RawOrderRow[]

				const orderIds = orderRows.map((row) => row.id)

				let invoiceRows: RawInvoiceRow[] = []
				let itemRows: RawOrderItemRow[] = []

				if (orderIds.length > 0) {
					invoiceRows = (await prisma.$queryRawUnsafe(
						`SELECT
							id,
							order_id,
							amount,
							status,
							paid_at,
							pdf_link,
							payment_link,
							xendit_invoice_id,
							expiry_date,
							created_at
						FROM order_invoices
						WHERE order_id = ANY($1::uuid[])
						ORDER BY created_at DESC`,
						orderIds,
					)) as RawInvoiceRow[]

					itemRows = (await prisma.$queryRawUnsafe(
						`SELECT
							id,
							order_id,
							price,
							quantity,
							created_at,
							product_id,
							product_name
						FROM order_items
						WHERE order_id = ANY($1::uuid[])
						ORDER BY created_at ASC`,
						orderIds,
					)) as RawOrderItemRow[]
				}

				const invoicesByOrderId = new Map<string, RawInvoiceRow[]>()
				for (const invoice of invoiceRows) {
					const existing = invoicesByOrderId.get(invoice.order_id) || []
					existing.push(invoice)
					invoicesByOrderId.set(invoice.order_id, existing)
				}

				const itemsByOrderId = new Map<string, RawOrderItemRow[]>()
				for (const item of itemRows) {
					const existing = itemsByOrderId.get(item.order_id) || []
					existing.push(item)
					itemsByOrderId.set(item.order_id, existing)
				}

				const mappedOrders = orderRows.map((row) => {
					const invoices = (invoicesByOrderId.get(row.id) || []).map((invoice) => ({
						id: invoice.id,
						amount: toNumber(invoice.amount),
						status: invoice.status || 'PENDING',
						paid_at: toIsoString(invoice.paid_at),
						order_id: invoice.order_id,
						pdf_link: invoice.pdf_link,
						business_id: row.organization_id,
						expiry_date: toIsoString(invoice.expiry_date),
						payment_link: invoice.payment_link,
						xendit_invoice_id: invoice.xendit_invoice_id,
					}))

					const products = (itemsByOrderId.get(row.id) || []).map((item) => ({
						id: item.id,
						price: toNumber(item.price),
						quantity: item.quantity || 0,
						created_at: toIsoString(item.created_at),
						product_id: item.product_id,
						product_name: item.product_name || 'Custom',
						scalebiz_order_id: item.order_id,
					}))

					const displayName =
						row.contact_name || row.contact_email || row.contact_phone_number || '-'

					const contact = row.contact_id
						? {
							id: row.contact_id,
							note: null,
							type: row.inbox_type || 'whatsapp',
							email: row.contact_email,
							agent_id: null,
							stage_id: null,
							socket_id: null,
							status_id: null,
							company_id: null,
							created_at: toIsoString(row.contact_created_at),
							deleted_at: null,
							updated_at: toIsoString(row.contact_updated_at),
							business_id: row.organization_id,
							platform_id: null,
							display_name: displayName,
							phone_number: row.contact_phone_number,
							additional_data:
								row.contact_additional_attributes &&
								typeof row.contact_additional_attributes === 'object'
									? row.contact_additional_attributes
									: {},
						}
						: null

					const conversation = includeConv && row.conversation_id
						? {
							id: row.conversation_id,
							inbox: row.conversation_inbox_id
								? {
									id: row.conversation_inbox_id,
									name: row.inbox_name,
									type: row.inbox_type,
									phone_number: row.inbox_phone_number,
								}
								: null,
							inbox_id: row.conversation_inbox_id,
						}
						: null

					return {
						id: row.id,
						notes: row.notes,
						address: row.address,
						contact,
						discount: toNumber(row.discount),
						invoices,
						subtotal: toNumber(row.subtotal),
						contact_id: row.contact_id,
						created_at: toIsoString(row.created_at),
						business_id: row.organization_id,
						grand_total: toNumber(row.grand_total),
						conversation,
						order_number: row.order_number ? Number(row.order_number) : null,
						order_status: row.order_status || 'pending',
						payment_type: row.payment_type || 'one_time_payment',
						shipping_fee: toNumber(row.shipping_fee),
						payment_method: row.payment_method || 'custom',
						conversation_id: row.conversation_id,
						business_bank_account: row.business_bank_account,
						scalebiz_orders_products: products,
					}
				})

				return {
					message: 'success',
					data: {
						orders: mappedOrders,
						pagination: {
							page,
							limit,
							total_items: totalItems,
							total_pages: totalPages,
						},
						filters: {
							order_status: query.order_status || null,
							inbox_id: query.inbox_id || null,
							search: query.search || null,
							sort_field: sortField.key,
							sort_direction: sortDirection,
						},
					},
				}
			} catch (error) {
				if (isMissingRelationError(error, 'orders')) {
					return {
						message: 'success',
						data: {
							orders: [],
							pagination: {
								page,
								limit,
								total_items: 0,
								total_pages: 1,
							},
							filters: {
								order_status: query.order_status || null,
								inbox_id: query.inbox_id || null,
								search: query.search || null,
								sort_field: sortField.key,
								sort_direction: sortDirection,
							},
						},
					}
				}

				console.error('[orders] list failed', error)
				set.status = 500
				return { error: 'Failed to fetch orders' }
			}
		},
		{
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
				payment_type: t.Optional(t.String()),
				order_status: t.Optional(t.String()),
				inbox_id: t.Optional(t.String()),
				search: t.Optional(t.String()),
				sort_field: t.Optional(t.String()),
				sort_direction: t.Optional(t.String()),
				include_conv: t.Optional(t.String()),
			}),
		},
	)
	.get(
		'/report',
		async ({ query, orgId, resolvedAppId, set }) => {
			if (!orgId && !resolvedAppId) {
				set.status = 400
				return { error: 'Organization context required' }
			}

			const dateRange = resolveDateRange(query.startDate, query.endDate)
			const scopeParams: unknown[] = []
			const scopeClause = buildScopeClause(
				scopeParams,
				'o',
				orgId,
				resolvedAppId,
			)

			try {
				const [current, previous] = await Promise.all([
					getDashboardAggregate(
						scopeClause,
						scopeParams,
						dateRange.currentStart,
						dateRange.currentEnd,
					),
					getDashboardAggregate(
						scopeClause,
						scopeParams,
						dateRange.previousStart,
						dateRange.previousEnd,
					),
				])

				return {
					message: 'success',
					data: {
						total_sales: {
							current: current.total_sales,
							previous: previous.total_sales,
							growth: current.total_sales - previous.total_sales,
						},
						total_orders: {
							current: current.total_orders,
							previous: previous.total_orders,
							growth: current.total_orders - previous.total_orders,
						},
						total_completed_orders: {
							current: current.total_completed_orders,
							previous: previous.total_completed_orders,
							growth:
								current.total_completed_orders - previous.total_completed_orders,
						},
					},
				}
			} catch (error) {
				if (isMissingRelationError(error, 'orders')) {
					return {
						message: 'success',
						data: {
							total_sales: { current: 0, previous: 0, growth: 0 },
							total_orders: { current: 0, previous: 0, growth: 0 },
							total_completed_orders: { current: 0, previous: 0, growth: 0 },
						},
					}
				}

				console.error('[orders] report failed', error)
				set.status = 500
				return { error: 'Failed to fetch order report' }
			}
		},
		{
			query: t.Object({
				startDate: t.Optional(t.String()),
				endDate: t.Optional(t.String()),
			}),
		},
	)
	.get(
		'/subscriptions',
		async ({ query, orgId, resolvedAppId, set }) => {
			if (!orgId && !resolvedAppId) {
				set.status = 400
				return { error: 'Organization context required' }
			}

			const page = parsePositiveInt(query.page, DEFAULT_PAGE)
			const rawLimit = parsePositiveInt(query.limit, DEFAULT_LIMIT)
			const limit = Math.min(rawLimit, MAX_LIMIT)
			const offset = (page - 1) * limit

			const sortDirection = normalizeSortDirection(query.sort_direction)
			const sortField = normalizeSortField(
				query.sort_field,
				SUBSCRIPTION_SORT_FIELDS,
				'created_at',
			)

			const params: unknown[] = []
			const whereParts: string[] = []

			const scopeClause = buildScopeClause(params, 's', orgId, resolvedAppId)
			if (scopeClause) {
				whereParts.push(scopeClause)
			}

			if (query.search) {
				const searchLike = `%${String(query.search).trim()}%`
				const placeholder = addParam(params, searchLike)
				whereParts.push(`(
					COALESCE(c.name, '') ILIKE ${placeholder}
					OR COALESCE(c.email, '') ILIKE ${placeholder}
					OR COALESCE(c.phone_number, '') ILIKE ${placeholder}
					OR COALESCE(s.item_name, '') ILIKE ${placeholder}
					OR COALESCE(s.subscription_number::text, '') ILIKE ${placeholder}
				)`)
			}

			const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

			try {
				const totalRows = (await prisma.$queryRawUnsafe(
					`SELECT COUNT(*)::bigint AS total
					FROM subscriptions s
					LEFT JOIN contacts c ON c.id = s.contact_id
					${whereSql}`,
					...params,
				)) as Array<{ total: number | string | null }>

				const totalItems = toNumber(totalRows[0]?.total)
				const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 1

				const listParams = [...params]
				const limitPlaceholder = addParam(listParams, limit)
				const offsetPlaceholder = addParam(listParams, offset)

				const rows = (await prisma.$queryRawUnsafe(
					`SELECT
						s.id,
						s.subscription_number,
						s.status,
						s.subscription_type,
						s.item_name,
						s.billing_amount,
						s.cycles,
						s.start_date,
						s.next_billing,
						s.end_date,
						s.created_at,
						s.updated_at,
						s.contact_id,
						c.name AS contact_name,
						c.email AS contact_email,
						c.phone_number AS contact_phone_number
					FROM subscriptions s
					LEFT JOIN contacts c ON c.id = s.contact_id
					${whereSql}
					ORDER BY ${sortField.sql} ${sortDirection.toUpperCase()}
					LIMIT ${limitPlaceholder}
					OFFSET ${offsetPlaceholder}`,
					...listParams,
				)) as RawSubscriptionRow[]

				const subscriptions = rows.map((row) => ({
					id: row.id,
					number: row.subscription_number ? `#${row.subscription_number}` : null,
					subscription_number: row.subscription_number
						? Number(row.subscription_number)
						: null,
					status: row.status || 'active',
					type: row.subscription_type || 'recurring',
					item: row.item_name,
					billing_amount: toNumber(row.billing_amount),
					cycles: row.cycles || 0,
					start_date: toIsoString(row.start_date),
					next_billing: toIsoString(row.next_billing),
					end_date: toIsoString(row.end_date),
					created_at: toIsoString(row.created_at),
					updated_at: toIsoString(row.updated_at),
					contact: row.contact_id
						? {
							id: row.contact_id,
							display_name:
								row.contact_name ||
								row.contact_email ||
								row.contact_phone_number ||
								'-',
							email: row.contact_email,
							phone_number: row.contact_phone_number,
						}
						: null,
				}))

				return {
					message: 'success',
					data: {
						subscriptions,
						pagination: {
							page,
							limit,
							total_items: totalItems,
							total_pages: totalPages,
						},
						filters: {
							search: query.search || null,
							sort_field: sortField.key,
							sort_direction: sortDirection,
						},
					},
				}
			} catch (error) {
				if (isMissingRelationError(error, 'subscriptions')) {
					return {
						message: 'success',
						data: {
							subscriptions: [],
							pagination: {
								page,
								limit,
								total_items: 0,
								total_pages: 1,
							},
							filters: {
								search: query.search || null,
								sort_field: sortField.key,
								sort_direction: sortDirection,
							},
						},
					}
				}

				console.error('[orders] subscriptions failed', error)
				set.status = 500
				return { error: 'Failed to fetch subscriptions' }
			}
		},
		{
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
				search: t.Optional(t.String()),
				sort_field: t.Optional(t.String()),
				sort_direction: t.Optional(t.String()),
			}),
		},
	)
