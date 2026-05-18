import crypto from 'node:crypto'
import type { Prisma } from '../../generated/prisma'
import prisma from '../../lib/prisma'
import { isUuid } from '../../lib/utils'
import { BusinessWebhookDispatchService } from '../business-webhooks/dispatch-service'
import { ChatbotService } from '../chatbot/service'
import { AIResponseLogService } from '../chatbot/response-log-service'
import { CustomerService } from '../customer/service'
import { DecisionEngineService } from '../flow/decision-engine-service'
import { MessageService } from '../message/service'
import {
	PakasirClient,
	type PakasirClientConfigInput,
	type PakasirTransactionNormalized,
} from './pakasir-client'

type DBClient = Prisma.TransactionClient | typeof prisma

type CartItemInput = {
	variant_id?: string
	product_id?: string
	quantity: number
}

type AddToCartInput = {
	conversation_id: string
	order_id?: string
	contact_id?: string
	items: CartItemInput[]
}

type CheckoutInput = {
	payment_method?: string
	expires_in_minutes?: number
}

type SendPaymentLinkInput = {
	payment_method?: string
	channel?: string
	message_template?: string
}

type CancelOrderInput = {
	reason?: string
}

type StageSyncResult = {
	changed: boolean
	pipelineChanged: boolean
	previousPipelineId: string | null
	previousStageId: string | null
	nextPipelineId: string
	nextStageId: string
	conversationId: string
	appId: string
	inboxId: string | null
}

const OPEN_ORDER_PHASES = ['cart', 'checkout', 'payment_pending']
const PAID_PHASES = ['paid']
const PAID_ORDER_STATUSES = ['paid', 'completed']
const CANCELED_PHASES = ['cancelled', 'expired']
const PAID_INVOICE_STATUSES = ['PAID', 'COMPLETED', 'SETTLED', 'SUCCESS']
const CANCELED_INVOICE_STATUSES = ['CANCELLED', 'EXPIRED', 'FAILED']

const JOURNEY_STAGE_MAP: Record<string, string> = {
	cart: 'Open Cart',
	checkout: 'Checkout',
	payment_pending: 'Payment Pending',
	paid: 'Paid',
}

const JOURNEY_STAGE_ORDER = ['Open Cart', 'Checkout', 'Payment Pending', 'Paid']
const DEFAULT_PAYMENT_PROVIDER = 'pakasir'
const PAKASIR_SETTINGS_KEY_PREFIX = 'commerce.pakasir.config.'
const DEFAULT_LIST_PAGE = 1
const DEFAULT_LIST_LIMIT = 25
const MAX_LIST_LIMIT = 100

type PaymentMethodCatalogItem = {
	id: string
	label: string
	provider: string
}

type PakasirRuntimeConfig = {
	mode: 'live' | 'sandbox'
	base_url: string
	project_slug: string | null
	api_key: string
	redirect_url: string | null
	payment_methods: PaymentMethodCatalogItem[]
	source: 'env' | 'db' | 'mixed'
}

type ResolvedPaymentMethod = {
	provider: string
	method: string
	key: string
}

const PAYMENT_METHOD_LABEL_OVERRIDES: Record<string, string> = {
	qris: 'QRIS',
	gopay: 'GoPay',
	shopeepay: 'ShopeePay',
	ovo: 'OVO',
	dana: 'DANA',
	linkaja: 'LinkAja',
	bca_va: 'BCA Virtual Account',
	bni_va: 'BNI Virtual Account',
	bri_va: 'BRI Virtual Account',
	mandiri_va: 'Mandiri Virtual Account',
	permata_va: 'Permata Virtual Account',
	cimb_va: 'CIMB Virtual Account',
}

const DEFAULT_PAYMENT_METHODS: PaymentMethodCatalogItem[] = [
	{ id: 'qris', label: 'QRIS', provider: DEFAULT_PAYMENT_PROVIDER },
	{
		id: 'bca_va',
		label: 'BCA Virtual Account',
		provider: DEFAULT_PAYMENT_PROVIDER,
	},
	{
		id: 'bni_va',
		label: 'BNI Virtual Account',
		provider: DEFAULT_PAYMENT_PROVIDER,
	},
	{
		id: 'bri_va',
		label: 'BRI Virtual Account',
		provider: DEFAULT_PAYMENT_PROVIDER,
	},
	{
		id: 'mandiri_va',
		label: 'Mandiri Virtual Account',
		provider: DEFAULT_PAYMENT_PROVIDER,
	},
	{ id: 'gopay', label: 'GoPay', provider: DEFAULT_PAYMENT_PROVIDER },
	{ id: 'ovo', label: 'OVO', provider: DEFAULT_PAYMENT_PROVIDER },
]

function toNumber(value: unknown): number {
	if (value === null || value === undefined || value === '') return 0
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrencyAmount(value: unknown, currency: unknown = 'IDR'): string {
	const amount = toNumber(value)
	const normalizedCurrency = nonEmptyString(currency) || 'IDR'
	try {
		return new Intl.NumberFormat('id-ID', {
			style: 'currency',
			currency: normalizedCurrency,
			maximumFractionDigits: 0,
		}).format(amount)
	} catch {
		return `${normalizedCurrency} ${Math.round(amount).toLocaleString('id-ID')}`
	}
}

function buildPaymentSuccessRedirectUrl(
	baseUrl: unknown,
	params: {
		token?: string | null
		orderId?: string | null
		invoiceId?: string | null
	},
): string | null {
	const normalized = nonEmptyString(baseUrl)
	if (!normalized) return null

	const query = new URLSearchParams()
	if (params.token) query.set('token', params.token)
	if (params.orderId) query.set('order_id', params.orderId)
	if (params.invoiceId) query.set('invoice_id', params.invoiceId)
	const queryText = query.toString()
	if (!queryText) return normalized

	try {
		const url = new URL(normalized)
		for (const [key, value] of query.entries()) {
			url.searchParams.set(key, value)
		}
		return url.toString()
	} catch {
		const separator = normalized.includes('?') ? '&' : '?'
		return `${normalized}${separator}${queryText}`
	}
}

function toBigIntNumber(
	value: bigint | number | null | undefined,
): number | null {
	if (value === null || value === undefined) return null
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	const casted = Number(value)
	return Number.isFinite(casted) ? casted : null
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	const parsed = value instanceof Date ? value : new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function normalizeProvider(value: unknown): string {
	const provider = String(value || '')
		.trim()
		.toLowerCase()
	return provider || DEFAULT_PAYMENT_PROVIDER
}

function formatPaymentMethodLabel(method: string): string {
	const normalized = String(method || '')
		.trim()
		.toLowerCase()
	if (!normalized) return 'Payment Method'
	const mapped = PAYMENT_METHOD_LABEL_OVERRIDES[normalized]
	if (mapped) return mapped
	return normalized
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((word) =>
			word.length <= 3
				? word.toUpperCase()
				: word.charAt(0).toUpperCase() + word.slice(1),
		)
		.join(' ')
}

function resolvePaymentMethod(value: unknown): ResolvedPaymentMethod {
	const raw = String(value || '')
		.trim()
		.toLowerCase()
	if (!raw) {
		return {
			provider: DEFAULT_PAYMENT_PROVIDER,
			method: 'qris',
			key: 'qris',
		}
	}

	const separatorIndex = raw.indexOf(':')
	if (separatorIndex === -1) {
		return {
			provider: DEFAULT_PAYMENT_PROVIDER,
			method: raw,
			key: raw,
		}
	}

	const provider = normalizeProvider(raw.slice(0, separatorIndex))
	const method = raw.slice(separatorIndex + 1).trim() || 'qris'
	return {
		provider,
		method,
		key:
			provider === DEFAULT_PAYMENT_PROVIDER ? method : `${provider}:${method}`,
	}
}

function normalizeInvoiceStatus(status: unknown): string {
	const normalized = String(status || '')
		.trim()
		.toUpperCase()
	if (!normalized) return 'NOT_PAID'
	if (PAID_INVOICE_STATUSES.includes(normalized)) return 'PAID'
	if (CANCELED_INVOICE_STATUSES.includes(normalized)) return normalized
	return normalized
}

function isPaidStatus(status: unknown): boolean {
	return normalizeInvoiceStatus(status) === 'PAID'
}

function isCancelableJourney(phase: string | null | undefined): boolean {
	const normalized = String(phase || '')
		.trim()
		.toLowerCase()
	if (!normalized) return false
	return OPEN_ORDER_PHASES.includes(normalized)
}

function parseJson(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	return value as Record<string, unknown>
}

function asJsonArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}

function extractAiResponseText(response: unknown): string {
	const record = parseJson(response)
	const preview = parseJson(record.preview)
	const timelineText = asJsonArray(preview.timeline)
		.map((item) => {
			const row = parseJson(item)
			if (row.type !== 'text') return ''
			return nonEmptyString(row.content) || ''
		})
		.filter((text) => text.length > 0)
		.join('\n\n')
	return timelineText || nonEmptyString(record.content) || ''
}

function hasInternalPromptLeak(text: string): boolean {
	const normalized = String(text || '').toLowerCase()
	return [
		'tugas anda',
		'instruksi internal',
		'agent behavior',
		'system instruction',
		'prompt',
		'json',
	].some((marker) => normalized.includes(marker))
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
	if (value === null || value === undefined) {
		return {} as Prisma.InputJsonValue
	}
	return value as Prisma.InputJsonValue
}

function nonEmptyString(value: unknown): string | null {
	const normalized = String(value || '').trim()
	return normalized || null
}

function generateSku(): string {
	return Math.random().toString().slice(2, 7).padStart(5, '0')
}

function resolveSku(value: unknown): string {
	const normalized = String(value || '').trim()
	return normalized || generateSku()
}

function uniqStrings(values: Array<string | null | undefined>): string[] {
	const dedupe = new Set<string>()
	for (const value of values) {
		const normalized = String(value || '').trim()
		if (!normalized) continue
		dedupe.add(normalized)
	}
	return [...dedupe]
}

function parsePaymentMethodEntry(
	value: unknown,
	defaultProvider: string,
): PaymentMethodCatalogItem | null {
	if (typeof value === 'string') {
		const raw = nonEmptyString(value)
		if (!raw) return null
		const selection = resolvePaymentMethod(
			raw.includes(':')
				? raw
				: defaultProvider === DEFAULT_PAYMENT_PROVIDER
					? raw
					: `${defaultProvider}:${raw}`,
		)
		return {
			id: selection.key,
			label: formatPaymentMethodLabel(selection.method),
			provider: selection.provider,
		}
	}

	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const record = value as Record<string, unknown>
		const fallbackProvider = normalizeProvider(
			record.provider || defaultProvider,
		)
		const idValue = nonEmptyString(
			record.id || record.method || record.code || record.value,
		)
		if (!idValue) return null

		const selection = resolvePaymentMethod(
			idValue.includes(':')
				? idValue
				: fallbackProvider === DEFAULT_PAYMENT_PROVIDER
					? idValue
					: `${fallbackProvider}:${idValue}`,
		)
		const label =
			nonEmptyString(record.label || record.name) ||
			formatPaymentMethodLabel(selection.method)

		return {
			id: selection.key,
			label,
			provider: selection.provider,
		}
	}

	return null
}

function parsePaymentMethods(
	rawValue: unknown,
	defaultProvider: string,
): PaymentMethodCatalogItem[] {
	if (rawValue === null || rawValue === undefined) return []

	let parsedEntries: unknown[] = []

	if (Array.isArray(rawValue)) {
		parsedEntries = rawValue
	} else if (typeof rawValue === 'string') {
		const raw = rawValue.trim()
		if (!raw) return []

		if (raw.startsWith('[') || raw.startsWith('{')) {
			try {
				const parsed = JSON.parse(raw) as unknown
				if (Array.isArray(parsed)) {
					parsedEntries = parsed
				} else if (parsed && typeof parsed === 'object') {
					parsedEntries = Object.entries(parsed as Record<string, unknown>).map(
						([key, value]) => {
							if (value && typeof value === 'object' && !Array.isArray(value)) {
								return {
									id: key,
									...(value as Record<string, unknown>),
								}
							}
							if (typeof value === 'string') {
								return {
									id: key,
									label: value,
								}
							}
							return { id: key }
						},
					)
				}
			} catch {
				parsedEntries = []
			}
		}

		if (parsedEntries.length === 0) {
			parsedEntries = raw
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean)
		}
	} else if (rawValue && typeof rawValue === 'object') {
		parsedEntries = Object.entries(rawValue as Record<string, unknown>).map(
			([key, value]) => {
				if (value && typeof value === 'object' && !Array.isArray(value)) {
					return {
						id: key,
						...(value as Record<string, unknown>),
					}
				}
				if (typeof value === 'string') {
					return {
						id: key,
						label: value,
					}
				}
				return { id: key }
			},
		)
	}

	const deduped = new Map<string, PaymentMethodCatalogItem>()
	for (const entry of parsedEntries) {
		const parsed = parsePaymentMethodEntry(entry, defaultProvider)
		if (!parsed) continue
		deduped.set(parsed.id, parsed)
	}

	return [...deduped.values()]
}

function paymentMethodsCatalog(rawValue?: unknown) {
	const configuredExplicit = parsePaymentMethods(
		rawValue,
		DEFAULT_PAYMENT_PROVIDER,
	)
	if (configuredExplicit.length > 0) return configuredExplicit

	const configuredGlobal = parsePaymentMethods(
		process.env.PAYMENT_METHODS,
		DEFAULT_PAYMENT_PROVIDER,
	)
	if (configuredGlobal.length > 0) return configuredGlobal

	const configuredPakasir = parsePaymentMethods(
		process.env.PAKASIR_PAYMENT_METHODS,
		DEFAULT_PAYMENT_PROVIDER,
	)
	if (configuredPakasir.length > 0) return configuredPakasir

	return DEFAULT_PAYMENT_METHODS
}

function normalizePakasirMode(value: unknown): 'live' | 'sandbox' {
	return String(value || '')
		.trim()
		.toLowerCase() === 'sandbox'
		? 'sandbox'
		: 'live'
}

function normalizeUrl(value: unknown): string {
	return String(value || '')
		.trim()
		.replace(/\/+$/, '')
}

function resolvePakasirEnvBaseUrl(mode: 'live' | 'sandbox'): string {
	const explicit = normalizeUrl(process.env.PAKASIR_BASE_URL)
	if (explicit) return explicit

	if (mode === 'sandbox') {
		const sandboxUrl = normalizeUrl(process.env.PAKASIR_SANDBOX_BASE_URL)
		if (sandboxUrl) return sandboxUrl
	}

	const liveUrl = normalizeUrl(process.env.PAKASIR_LIVE_BASE_URL)
	if (liveUrl) return liveUrl
	return 'https://app.pakasir.com/api'
}

function parseStoredObject(
	value: string | null | undefined,
): Record<string, unknown> {
	const raw = String(value || '').trim()
	if (!raw) return {}
	try {
		const parsed = JSON.parse(raw) as unknown
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
			return {}
		return parsed as Record<string, unknown>
	} catch {
		return {}
	}
}

function maskApiKey(value: string | null | undefined): string | null {
	const apiKey = String(value || '').trim()
	if (!apiKey) return null
	if (apiKey.length <= 8) {
		return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`
	}
	return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`
}

function parsePositiveInt(value: unknown, fallback: number): number {
	const parsed = Number.parseInt(String(value || ''), 10)
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback
	return parsed
}

function parseBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value
	const normalized = String(value || '')
		.trim()
		.toLowerCase()
	return ['1', 'true', 'yes', 'y'].includes(normalized)
}

function parseCsvValues(value: unknown): string[] {
	return String(value || '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
}

function toHeaderString(value: unknown): string | null {
	if (typeof value === 'string' && value.trim()) {
		return value
			.split(',')
			.map((entry) => entry.trim())
			.find(Boolean) || null
	}
	if (Array.isArray(value)) {
		const firstString = value.find(
			(item) => typeof item === 'string' && item.trim(),
		) as string | undefined
		return firstString ? toHeaderString(firstString) : null
	}
	return null
}

function resolveForwardedOrigin(headers?: Record<string, unknown>): string | null {
	if (!headers) return null

	const forwardedHost = toHeaderString(
		headers['x-forwarded-host'] ||
			headers['X-Forwarded-Host'] ||
			headers['host'] ||
			headers['Host'],
	)
	const forwardedProto = toHeaderString(
		headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'],
	)

	if (forwardedHost && forwardedProto) {
		return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '')
	}

	return null
}

function resolvePublicApiBaseUrl(
	requestUrl?: string,
	headers?: Record<string, unknown>,
): string {
	const fromEnv = nonEmptyString(
		process.env.API_PUBLIC_URL ||
			process.env.PUBLIC_API_BASE_URL ||
			process.env.BACKEND_URL ||
			process.env.BETTER_AUTH_URL,
	)
	if (fromEnv) return fromEnv.replace(/\/+$/, '')

	const forwardedOrigin = resolveForwardedOrigin(headers)
	if (forwardedOrigin) return forwardedOrigin

	if (requestUrl) {
		try {
			const parsed = new URL(requestUrl)
			return `${parsed.protocol}//${parsed.host}`
		} catch {
			// ignore invalid URL
		}
	}

	return 'http://localhost:3010'
}

export const __test__ = {
	resolvePublicApiBaseUrl,
}

function toPakasirClientConfig(
	config: PakasirRuntimeConfig,
): PakasirClientConfigInput {
	return {
		mode: config.mode,
		baseUrl: config.base_url,
		projectSlug: config.project_slug,
		apiKey: config.api_key,
		redirectUrl: config.redirect_url,
	}
}

function isPaymentMethodInCatalog(
	method: string,
	catalog: PaymentMethodCatalogItem[],
): boolean {
	const normalized = String(method || '')
		.trim()
		.toLowerCase()
	if (!normalized) return false
	return catalog.some((item) => item.id.toLowerCase() === normalized)
}

function buildPublicToken() {
	return crypto.randomBytes(24).toString('base64url')
}

async function findOrderWithItemsAndInvoices(orderId: string, appId: string) {
	const order = await prisma.orders.findFirst({
		where: {
			id: orderId,
			app_id: appId,
		},
	})

	if (!order) return null

	const [items, invoices] = await Promise.all([
		prisma.order_items.findMany({
			where: { order_id: order.id },
			orderBy: { created_at: 'asc' },
		}),
		prisma.order_invoices.findMany({
			where: { order_id: order.id },
			orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
		}),
	])

	return { order, items, invoices }
}

function mapOrderWithDetails(args: {
	order: any
	items: any[]
	invoices: any[]
}) {
	const latestInvoice = args.invoices[0] || null
	return {
		id: args.order.id,
		order_number: toBigIntNumber(args.order.order_number),
		order_status: args.order.order_status || 'pending',
		journey_phase: args.order.journey_phase || 'cart',
		payment_provider: args.order.payment_provider || null,
		payment_method: args.order.payment_method || null,
		currency: args.order.currency || 'IDR',
		subtotal: toNumber(args.order.subtotal),
		discount: toNumber(args.order.discount),
		shipping_fee: toNumber(args.order.shipping_fee),
		grand_total: toNumber(args.order.grand_total),
		created_at: toIso(args.order.created_at),
		updated_at: toIso(args.order.updated_at),
		checkout_at: toIso(args.order.checkout_at),
		paid_at: toIso(args.order.paid_at),
		cancelled_at: toIso(args.order.cancelled_at),
		conversation_id: args.order.conversation_id,
		contact_id: args.order.contact_id,
		items: args.items.map((item) => ({
			id: item.id,
			product_id: item.product_id,
			variant_id: item.variant_id,
			product_name: item.product_name,
			variant_name: item.variant_name,
			quantity: item.quantity || 0,
			unit_price: toNumber(item.unit_price || item.price),
			line_total: toNumber(item.line_total),
			price: toNumber(item.price),
			metadata: parseJson(item.metadata),
		})),
		latest_invoice: latestInvoice
			? {
					id: latestInvoice.id,
					status: normalizeInvoiceStatus(latestInvoice.status),
					provider: latestInvoice.provider || 'custom',
					provider_invoice_id: latestInvoice.provider_invoice_id,
					payment_method: latestInvoice.payment_method,
					payment_number: latestInvoice.payment_number,
					payment_link: latestInvoice.payment_link,
					checkout_url: latestInvoice.checkout_url,
					public_token: latestInvoice.public_token,
					amount: toNumber(latestInvoice.amount),
					paid_at: toIso(latestInvoice.paid_at),
					expiry_date: toIso(latestInvoice.expiry_date),
				}
			: null,
		invoices: args.invoices.map((invoice) => ({
			id: invoice.id,
			status: normalizeInvoiceStatus(invoice.status),
			provider: invoice.provider || 'custom',
			provider_invoice_id: invoice.provider_invoice_id,
			payment_method: invoice.payment_method,
			payment_number: invoice.payment_number,
			payment_link: invoice.payment_link,
			checkout_url: invoice.checkout_url,
			public_token: invoice.public_token,
			amount: toNumber(invoice.amount),
			paid_at: toIso(invoice.paid_at),
			expiry_date: toIso(invoice.expiry_date),
			created_at: toIso(invoice.created_at),
		})),
	}
}

export abstract class CommerceService {
	private static ensureValidAppId(appId: string | null | undefined): string {
		const resolved = String(appId || '').trim()
		if (!resolved || !isUuid(resolved)) {
			throw new Error('App context is required')
		}
		return resolved
	}

	private static getPakasirSettingsKey(appId: string): string {
		return `${PAKASIR_SETTINGS_KEY_PREFIX}${appId}`.slice(0, 100)
	}

	private static async getStoredPakasirConfig(appId: string) {
		const key = this.getPakasirSettingsKey(appId)
		const row = await prisma.platform_settings.findUnique({
			where: { key },
			select: { value: true },
		})
		return parseStoredObject(row?.value)
	}

	private static resolveEnvPakasirConfig(): PakasirRuntimeConfig {
		const mode = normalizePakasirMode(process.env.PAKASIR_MODE)
		return {
			mode,
			base_url: resolvePakasirEnvBaseUrl(mode),
			project_slug:
				nonEmptyString(process.env.PAKASIR_PROJECT_SLUG) ||
				nonEmptyString(process.env.PAKASIR_PROJECT),
			api_key: nonEmptyString(process.env.PAKASIR_API_KEY) || '',
			redirect_url: nonEmptyString(process.env.PAKASIR_REDIRECT_URL),
			payment_methods: paymentMethodsCatalog(),
			source: 'env',
		}
	}

	private static async resolvePakasirConfig(
		appId: string,
	): Promise<PakasirRuntimeConfig> {
		const envConfig = this.resolveEnvPakasirConfig()
		const stored = await this.getStoredPakasirConfig(appId)

		if (Object.keys(stored).length === 0) {
			return envConfig
		}

		const hasModeOverride = nonEmptyString(stored.mode) !== null
		const hasBaseUrlOverride = nonEmptyString(stored.base_url) !== null
		const hasProjectSlugOverride = nonEmptyString(stored.project_slug) !== null
		const hasApiKeyOverride = nonEmptyString(stored.api_key) !== null
		const hasRedirectOverride = nonEmptyString(stored.redirect_url) !== null
		const parsedPaymentMethods = paymentMethodsCatalog(stored.payment_methods)
		const hasPaymentMethodOverride =
			Array.isArray(stored.payment_methods) ||
			(typeof stored.payment_methods === 'string' &&
				String(stored.payment_methods).trim().length > 0)

		const nextMode = hasModeOverride
			? normalizePakasirMode(stored.mode)
			: envConfig.mode
		const merged: PakasirRuntimeConfig = {
			mode: nextMode,
			base_url:
				nonEmptyString(stored.base_url) || resolvePakasirEnvBaseUrl(nextMode),
			project_slug:
				nonEmptyString(stored.project_slug) || envConfig.project_slug,
			api_key: nonEmptyString(stored.api_key) || envConfig.api_key,
			redirect_url:
				nonEmptyString(stored.redirect_url) || envConfig.redirect_url,
			payment_methods:
				parsedPaymentMethods.length > 0
					? parsedPaymentMethods
					: envConfig.payment_methods,
			source: 'mixed',
		}

		const usingEnvFallback =
			(!hasModeOverride && Boolean(envConfig.mode)) ||
			(!hasBaseUrlOverride && Boolean(envConfig.base_url)) ||
			(!hasProjectSlugOverride && Boolean(envConfig.project_slug)) ||
			(!hasApiKeyOverride && Boolean(envConfig.api_key)) ||
			(!hasRedirectOverride && Boolean(envConfig.redirect_url)) ||
			(!hasPaymentMethodOverride && envConfig.payment_methods.length > 0)

		merged.source = usingEnvFallback ? 'mixed' : 'db'
		return merged
	}

	static async getPakasirSettings(
		appId: string,
		requestUrl?: string,
		headers?: Record<string, unknown>,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		const resolved = await this.resolvePakasirConfig(resolvedAppId)
		const webhookBase = resolvePublicApiBaseUrl(requestUrl, headers)

		return {
			mode: resolved.mode,
			base_url: resolved.base_url,
			project_slug: resolved.project_slug,
			redirect_url: resolved.redirect_url,
			payment_methods: resolved.payment_methods,
			api_key_configured: Boolean(nonEmptyString(resolved.api_key)),
			api_key_masked: maskApiKey(resolved.api_key),
			project_slug_configured: Boolean(nonEmptyString(resolved.project_slug)),
			webhook_url: `${webhookBase}/api/webhooks/pakasir`,
			source: resolved.source,
		}
	}

	static async updatePakasirSettings(
		appId: string,
		input: Record<string, unknown>,
		actorId?: string | null,
		requestUrl?: string,
		headers?: Record<string, unknown>,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		const key = this.getPakasirSettingsKey(resolvedAppId)
		const existing = await prisma.platform_settings.findUnique({
			where: { key },
			select: { value: true },
		})
		const current = parseStoredObject(existing?.value)

		const payload = input || {}
		const has = (field: string) =>
			Object.prototype.hasOwnProperty.call(payload, field)

		const next: Record<string, unknown> = { ...current }

		if (has('mode')) {
			next.mode = normalizePakasirMode(payload.mode)
		}
		if (has('base_url') || has('baseUrl')) {
			next.base_url = nonEmptyString(payload.base_url || payload.baseUrl)
		}
		if (has('project_slug') || has('projectSlug')) {
			next.project_slug = nonEmptyString(
				payload.project_slug || payload.projectSlug,
			)
		}
		if (has('api_key') || has('apiKey')) {
			next.api_key = nonEmptyString(payload.api_key || payload.apiKey)
		}
		if (has('redirect_url') || has('redirectUrl')) {
			next.redirect_url = nonEmptyString(
				payload.redirect_url || payload.redirectUrl,
			)
		}
		if (has('payment_methods') || has('paymentMethods')) {
			const value = payload.payment_methods ?? payload.paymentMethods
			if (Array.isArray(value)) {
				next.payment_methods = value
			} else if (typeof value === 'string') {
				next.payment_methods = parseCsvValues(value)
			} else if (!value) {
				next.payment_methods = []
			} else {
				next.payment_methods = value
			}
		}

		next.updated_at = new Date().toISOString()

		await prisma.platform_settings.upsert({
			where: { key },
			update: {
				value: JSON.stringify(next),
				updated_at: new Date(),
				updated_by: actorId || null,
			},
			create: {
				key,
				value: JSON.stringify(next),
				updated_by: actorId || null,
			},
		})

		return this.getPakasirSettings(resolvedAppId, requestUrl, headers)
	}

	private static async recalculateOrderTotals(db: DBClient, orderId: string) {
		const items = await db.order_items.findMany({
			where: { order_id: orderId },
			select: {
				quantity: true,
				unit_price: true,
				price: true,
				line_total: true,
			},
		})

		const subtotal = items.reduce((sum, item) => {
			const line =
				toNumber(item.line_total) ||
				toNumber(item.unit_price || item.price) *
					Math.max(0, Number(item.quantity || 0))
			return sum + line
		}, 0)

		const current = await db.orders.findUnique({
			where: { id: orderId },
			select: {
				discount: true,
				shipping_fee: true,
			},
		})
		const discount = toNumber(current?.discount)
		const shippingFee = toNumber(current?.shipping_fee)
		const grandTotal = Math.max(0, subtotal - discount + shippingFee)

		await db.orders.update({
			where: { id: orderId },
			data: {
				subtotal,
				grand_total: grandTotal,
				updated_at: new Date(),
			},
		})
	}

	private static async ensureConversationOwned(
		db: DBClient,
		conversationId: string,
		appId: string,
	) {
		const conversation = await db.conversations.findFirst({
			where: {
				id: conversationId,
				app_id: appId,
			},
			select: {
				id: true,
				app_id: true,
				inbox_id: true,
				contact_id: true,
				pipeline_id: true,
				stage_id: true,
			},
		})

		if (!conversation) {
			throw new Error('Conversation not found')
		}

		return conversation
	}

	private static async ensureJourneyStage(
		db: DBClient,
		args: {
			conversationId: string
			appId: string
			journeyPhase: 'cart' | 'checkout' | 'payment_pending' | 'paid'
			actorId?: string | null
		},
	): Promise<StageSyncResult | null> {
		const conversation = await db.conversations.findFirst({
			where: {
				id: args.conversationId,
				app_id: args.appId,
			},
			select: {
				id: true,
				app_id: true,
				inbox_id: true,
				pipeline_id: true,
				stage_id: true,
			},
		})

		if (!conversation || !conversation.app_id) return null

		let targetPipelineId = conversation.pipeline_id

		if (targetPipelineId) {
			const validPipeline = await db.pipelines.findFirst({
				where: {
					id: targetPipelineId,
					app_id: args.appId,
				},
				select: { id: true },
			})
			if (!validPipeline) {
				targetPipelineId = null
			}
		}

		if (!targetPipelineId) {
			const defaultPipeline = await db.pipelines.findFirst({
				where: {
					app_id: args.appId,
					is_default: true,
				},
				orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
				select: { id: true },
			})
			targetPipelineId = defaultPipeline?.id || null
		}

		if (!targetPipelineId) {
			const firstPipeline = await db.pipelines.findFirst({
				where: { app_id: args.appId },
				orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
				select: { id: true },
			})
			targetPipelineId = firstPipeline?.id || null
		}

		if (!targetPipelineId) {
			const createdPipeline = await db.pipelines.create({
				data: {
					app_id: args.appId,
					name: 'Commerce Journey',
					pipeline_type: 'retail',
					is_default: false,
					settings: {},
				},
				select: { id: true },
			})
			targetPipelineId = createdPipeline.id
		}

		const existingStages = await db.pipeline_stages.findMany({
			where: { pipeline_id: targetPipelineId },
			orderBy: [{ stage_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
			select: { id: true, name: true, stage_order: true },
		})

		const stageMap = new Map<
			string,
			{ id: string; stage_order: number; name: string }
		>()
		for (const stage of existingStages) {
			stageMap.set(stage.name.trim().toLowerCase(), stage)
		}

		let nextStageOrder =
			existingStages.reduce(
				(max, stage) => Math.max(max, stage.stage_order),
				-1,
			) + 1

		for (const stageName of JOURNEY_STAGE_ORDER) {
			const key = stageName.toLowerCase()
			if (stageMap.has(key)) continue

			const created = await db.pipeline_stages.create({
				data: {
					pipeline_id: targetPipelineId,
					name: stageName,
					stage_order: nextStageOrder,
					stage_type: stageName.toLowerCase() === 'paid' ? 'won' : 'open',
					color:
						stageName.toLowerCase() === 'paid'
							? '#16A34A'
							: stageName.toLowerCase() === 'payment pending'
								? '#F59E0B'
								: '#3B82F6',
				},
				select: { id: true, stage_order: true, name: true },
			})

			stageMap.set(key, created)
			nextStageOrder += 1
		}

		const desiredStageName = JOURNEY_STAGE_MAP[args.journeyPhase]
		const targetStage = stageMap.get(desiredStageName.toLowerCase())
		if (!targetStage) {
			throw new Error(
				`Failed to resolve target stage for phase ${args.journeyPhase}`,
			)
		}

		const previousPipelineId = conversation.pipeline_id || null
		const previousStageId = conversation.stage_id || null
		const pipelineChanged = previousPipelineId !== targetPipelineId
		const stageChanged = previousStageId !== targetStage.id

		if (!pipelineChanged && !stageChanged) {
			return {
				changed: false,
				pipelineChanged: false,
				previousPipelineId,
				previousStageId,
				nextPipelineId: targetPipelineId,
				nextStageId: targetStage.id,
				conversationId: conversation.id,
				appId: conversation.app_id,
				inboxId: conversation.inbox_id || null,
			}
		}

		await db.conversation_sales.upsert({
			where: { conversation_id: conversation.id },
			update: {
				pipeline_id: targetPipelineId,
				stage_id: targetStage.id,
				stage_entered_at: new Date(),
				updated_at: new Date(),
			},
			create: {
				conversation_id: conversation.id,
				pipeline_id: targetPipelineId,
				stage_id: targetStage.id,
				stage_entered_at: new Date(),
				metadata: {},
				updated_at: new Date(),
			},
		})

		await db.conversations.update({
			where: { id: conversation.id },
			data: {
				pipeline_id: targetPipelineId,
				stage_id: targetStage.id,
				updated_at: new Date(),
			},
		})

		if (stageChanged) {
			await db.stage_transitions.create({
				data: {
					conversation_id: conversation.id,
					from_stage_id: previousStageId,
					to_stage_id: targetStage.id,
					transition_type: 'automatic',
					notes: `Commerce journey: ${args.journeyPhase}`,
					user_id: args.actorId || null,
				},
			})
		}

		return {
			changed: true,
			pipelineChanged,
			previousPipelineId,
			previousStageId,
			nextPipelineId: targetPipelineId,
			nextStageId: targetStage.id,
			conversationId: conversation.id,
			appId: conversation.app_id,
			inboxId: conversation.inbox_id || null,
		}
	}

	private static async dispatchStageChanges(
		result: StageSyncResult | null,
		actorId?: string | null,
	) {
		if (!result || !result.changed) return

		if (result.previousStageId !== result.nextStageId) {
			void BusinessWebhookDispatchService.dispatch({
				event: 'conversation.stage_status_updated',
				appId: result.appId,
				inboxId: result.inboxId,
				payload: {
					conversation_id: result.conversationId,
					previous_stage_id: result.previousStageId,
					current_stage_id: result.nextStageId,
					pipeline_id: result.nextPipelineId,
					updated_by: actorId || null,
				},
			})
		}

		if (result.pipelineChanged) {
			void BusinessWebhookDispatchService.dispatch({
				event: 'conversation.pipeline_status_updated',
				appId: result.appId,
				inboxId: result.inboxId,
				payload: {
					conversation_id: result.conversationId,
					previous_pipeline_id: result.previousPipelineId,
					current_pipeline_id: result.nextPipelineId,
					stage_id: result.nextStageId,
					updated_by: actorId || null,
				},
			})
		}
	}

	private static async logConversationAction(
		db: DBClient,
		args: {
			conversationId: string | null
			action: string
			actorId?: string | null
			targetId?: string | null
			metadata?: Record<string, unknown>
		},
	) {
		if (!args.conversationId || !isUuid(args.conversationId)) return
		await db.conversation_activity_log.create({
			data: {
				conversation_id: args.conversationId,
				action: args.action.slice(0, 50),
				actor_id: args.actorId || null,
				actor_type: args.actorId ? 'user' : 'system',
				target_id: args.targetId || null,
				metadata: toJsonInput(args.metadata || {}),
			},
		})
	}

	private static async ensureVipTag(args: {
		db: DBClient
		appId: string
		contactId: string
	}) {
		const paidOrders = await args.db.orders.findMany({
			where: {
				app_id: args.appId,
				contact_id: args.contactId,
				OR: [
					{ journey_phase: { in: PAID_PHASES } },
					{ order_status: { in: PAID_ORDER_STATUSES } },
				],
			},
			select: {
				id: true,
				grand_total: true,
			},
		})

		const paidCount = paidOrders.length
		const lifetime = paidOrders.reduce(
			(sum, order) => sum + toNumber(order.grand_total),
			0,
		)

		const isVip = lifetime >= 10_000_000 || paidCount >= 3
		if (isVip) {
			const tag = await args.db.contact_tags.upsert({
				where: {
					app_id_name: {
						app_id: args.appId,
						name: 'VIP',
					},
				},
				update: {},
				create: {
					app_id: args.appId,
					name: 'VIP',
					color: '#F59E0B',
				},
				select: { id: true },
			})

			await args.db.contact_tag_assignments.upsert({
				where: {
					contact_id_tag_id: {
						contact_id: args.contactId,
						tag_id: tag.id,
					},
				},
				update: {},
				create: {
					contact_id: args.contactId,
					tag_id: tag.id,
				},
			})
		}

		return {
			lifetime,
			paid_orders: paidCount,
			is_vip: isVip,
		}
	}

	private static async releaseActiveReservations(
		db: DBClient,
		args: {
			appId: string
			orderId: string
			reason: string
		},
	) {
		const reservations = await db.stock_reservations.findMany({
			where: {
				app_id: args.appId,
				order_id: args.orderId,
				status: 'active',
			},
		})

		for (const reservation of reservations) {
			const variant = await db.product_variants.findFirst({
				where: {
					id: reservation.variant_id,
					app_id: args.appId,
				},
				select: {
					id: true,
					stock_on_hand: true,
					stock_reserved: true,
					organization_id: true,
				},
			})

			if (!variant) {
				await db.stock_reservations.update({
					where: { id: reservation.id },
					data: {
						status: 'released',
						reason: args.reason,
						updated_at: new Date(),
					},
				})
				continue
			}

			const reservedBefore = Math.max(0, Number(variant.stock_reserved || 0))
			const reservedAfter = Math.max(
				0,
				reservedBefore - Math.max(0, reservation.quantity),
			)

			await db.product_variants.update({
				where: { id: variant.id },
				data: {
					stock_reserved: reservedAfter,
					updated_at: new Date(),
				},
			})

			await db.stock_reservations.update({
				where: { id: reservation.id },
				data: {
					status: 'released',
					reason: args.reason,
					updated_at: new Date(),
				},
			})

			await db.stock_movements.create({
				data: {
					app_id: args.appId,
					organization_id: variant.organization_id || null,
					variant_id: variant.id,
					reservation_id: reservation.id,
					order_id: args.orderId,
					movement_type: 'release_reservation',
					quantity: Math.max(0, reservation.quantity),
					stock_before: Math.max(0, Number(variant.stock_on_hand || 0)),
					stock_after: Math.max(0, Number(variant.stock_on_hand || 0)),
					note: args.reason,
					metadata: {
						reserved_before: reservedBefore,
						reserved_after: reservedAfter,
					},
				},
			})
		}
	}

	private static async reserveStockForOrder(
		db: DBClient,
		args: {
			appId: string
			orderId: string
			orderItems: Array<{
				id: string
				variant_id: string | null
				quantity: number | null
			}>
			expiresInMinutes: number
		},
	) {
		for (const item of args.orderItems) {
			if (!item.variant_id) continue
			const qty = Math.max(0, Number(item.quantity || 0))
			if (qty <= 0) continue

			const variant = await db.product_variants.findFirst({
				where: {
					id: item.variant_id,
					app_id: args.appId,
					is_active: true,
				},
				select: {
					id: true,
					stock_on_hand: true,
					stock_reserved: true,
					organization_id: true,
				},
			})

			if (!variant) {
				throw new Error(`Variant not found: ${item.variant_id}`)
			}

			const onHand = Math.max(0, Number(variant.stock_on_hand || 0))
			const reserved = Math.max(0, Number(variant.stock_reserved || 0))
			const available = onHand - reserved
			if (available < qty) {
				throw new Error(
					`Insufficient stock for variant ${item.variant_id}. Available ${Math.max(0, available)}, requested ${qty}`,
				)
			}

			const reservedAfter = reserved + qty
			await db.product_variants.update({
				where: { id: variant.id },
				data: {
					stock_reserved: reservedAfter,
					updated_at: new Date(),
				},
			})

			const reservation = await db.stock_reservations.create({
				data: {
					app_id: args.appId,
					organization_id: variant.organization_id || null,
					order_id: args.orderId,
					order_item_id: item.id,
					variant_id: variant.id,
					quantity: qty,
					status: 'active',
					reason: 'checkout',
					expires_at: new Date(Date.now() + args.expiresInMinutes * 60 * 1000),
				},
				select: { id: true },
			})

			await db.stock_movements.create({
				data: {
					app_id: args.appId,
					organization_id: variant.organization_id || null,
					variant_id: variant.id,
					reservation_id: reservation.id,
					order_id: args.orderId,
					movement_type: 'reserve',
					quantity: qty,
					stock_before: onHand,
					stock_after: onHand,
					note: 'Stock reserved on checkout',
					metadata: {
						reserved_before: reserved,
						reserved_after: reservedAfter,
					},
				},
			})
		}
	}

	private static async finalizeReservedStock(
		db: DBClient,
		args: { appId: string; orderId: string },
	) {
		const reservations = await db.stock_reservations.findMany({
			where: {
				app_id: args.appId,
				order_id: args.orderId,
				status: 'active',
			},
		})

		for (const reservation of reservations) {
			const qty = Math.max(0, Number(reservation.quantity || 0))
			if (qty <= 0) {
				await db.stock_reservations.update({
					where: { id: reservation.id },
					data: {
						status: 'finalized',
						updated_at: new Date(),
					},
				})
				continue
			}

			const variant = await db.product_variants.findFirst({
				where: {
					id: reservation.variant_id,
					app_id: args.appId,
				},
				select: {
					id: true,
					stock_on_hand: true,
					stock_reserved: true,
					organization_id: true,
				},
			})
			if (!variant) continue

			const onHandBefore = Math.max(0, Number(variant.stock_on_hand || 0))
			const reservedBefore = Math.max(0, Number(variant.stock_reserved || 0))
			const onHandAfter = Math.max(0, onHandBefore - qty)
			const reservedAfter = Math.max(0, reservedBefore - qty)

			await db.product_variants.update({
				where: { id: variant.id },
				data: {
					stock_on_hand: onHandAfter,
					stock_reserved: reservedAfter,
					updated_at: new Date(),
				},
			})

			await db.stock_reservations.update({
				where: { id: reservation.id },
				data: {
					status: 'finalized',
					reason: 'paid',
					updated_at: new Date(),
				},
			})

			await db.stock_movements.create({
				data: {
					app_id: args.appId,
					organization_id: variant.organization_id || null,
					variant_id: variant.id,
					reservation_id: reservation.id,
					order_id: args.orderId,
					movement_type: 'deduct',
					quantity: qty,
					stock_before: onHandBefore,
					stock_after: onHandAfter,
					note: 'Stock deducted after payment',
					metadata: {
						reserved_before: reservedBefore,
						reserved_after: reservedAfter,
					},
				},
			})
		}
	}

	private static async buildSummaryData(appId: string, conversationId: string) {
		const conversation = await prisma.conversations.findFirst({
			where: {
				id: conversationId,
				app_id: appId,
			},
			select: {
				id: true,
				app_id: true,
				contact_id: true,
				pipeline_id: true,
				stage_id: true,
				created_at: true,
				contacts: {
					select: {
						id: true,
						name: true,
						email: true,
						phone_number: true,
						avatar_url: true,
					},
				},
			},
		})

		if (!conversation || !conversation.contact_id) {
			return {
				conversation: null,
				customer: null,
				vip_stats: {
					lifetime: 0,
					paid_orders: 0,
					is_vip: false,
				},
				open_order: null,
				history: [],
				tags: [],
				notes: [],
			}
		}

		const [openOrder, historyOrders, tags, notes, vipStats] = await Promise.all(
			[
				prisma.orders.findFirst({
					where: {
						app_id: appId,
						conversation_id: conversation.id,
						journey_phase: { in: OPEN_ORDER_PHASES },
						NOT: {
							order_status: {
								in: ['cancelled', 'expired', 'completed', 'paid'],
							},
						},
					},
					orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
				}),
				prisma.orders.findMany({
					where: {
						app_id: appId,
						contact_id: conversation.contact_id,
						OR: [
							{ journey_phase: { in: PAID_PHASES } },
							{ order_status: { in: PAID_ORDER_STATUSES } },
						],
					},
					orderBy: [
						{ paid_at: 'desc' },
						{ updated_at: 'desc' },
						{ created_at: 'desc' },
					],
					take: 10,
				}),
				prisma.contact_tag_assignments.findMany({
					where: {
						contact_id: conversation.contact_id,
					},
					include: {
						contact_tags: {
							select: {
								id: true,
								name: true,
								color: true,
							},
						},
					},
				}),
				prisma.contact_notes.findMany({
					where: {
						contact_id: conversation.contact_id,
					},
					orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
					take: 5,
				}),
				this.ensureVipTag({
					db: prisma,
					appId,
					contactId: conversation.contact_id,
				}),
			],
		)

		const openOrderData = openOrder
			? await findOrderWithItemsAndInvoices(openOrder.id, appId)
			: null
		const historyOrderIds = historyOrders.map((order) => order.id)
		const [historyItems, historyInvoices] =
			historyOrderIds.length > 0
				? await Promise.all([
						prisma.order_items.findMany({
							where: { order_id: { in: historyOrderIds } },
							orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
						}),
						prisma.order_invoices.findMany({
							where: { order_id: { in: historyOrderIds } },
							orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
						}),
					])
				: [[], []]

		const itemsByOrderId = new Map<string, typeof historyItems>()
		for (const item of historyItems) {
			const list = itemsByOrderId.get(item.order_id) || []
			list.push(item)
			itemsByOrderId.set(item.order_id, list)
		}

		const invoicesByOrderId = new Map<string, typeof historyInvoices>()
		for (const invoice of historyInvoices) {
			const list = invoicesByOrderId.get(invoice.order_id) || []
			list.push(invoice)
			invoicesByOrderId.set(invoice.order_id, list)
		}

		return {
			conversation,
			customer: conversation.contacts,
			vip_stats: vipStats,
			open_order:
				openOrderData && openOrderData.order
					? mapOrderWithDetails({
							order: openOrderData.order,
							items: openOrderData.items,
							invoices: openOrderData.invoices,
						})
					: null,
			history: historyOrders.map((order) =>
				mapOrderWithDetails({
					order,
					items: itemsByOrderId.get(order.id) || [],
					invoices: invoicesByOrderId.get(order.id) || [],
				}),
			),
			tags: tags.map((assignment) => ({
				id: assignment.contact_tags.id,
				name: assignment.contact_tags.name,
				color: assignment.contact_tags.color || '#3B82F6',
			})),
			notes: notes.map((note) => ({
				id: note.id,
				content: note.content,
				created_at: toIso(note.created_at),
			})),
		}
	}

	private static extractWebhookReferenceCandidates(
		payload: Record<string, unknown>,
	) {
		const pick = (keys: string[]): string | null => {
			for (const key of keys) {
				if (!Object.prototype.hasOwnProperty.call(payload, key)) continue
				const value = nonEmptyString(payload[key])
				if (value) return value
			}
			const nested = parseJson(payload.data)
			for (const key of keys) {
				const value = nonEmptyString(nested[key])
				if (value) return value
			}
			return null
		}

		return uniqStrings([
			pick(['event_id', 'id']),
			pick(['transaction_id', 'transactionId']),
			pick(['reference_id', 'reference']),
			pick(['external_id', 'externalId']),
			pick(['invoice_id', 'provider_invoice_id']),
			pick(['order_id']),
		])
	}

	private static buildWebhookExternalId(payload: Record<string, unknown>) {
		const candidates = this.extractWebhookReferenceCandidates(payload)
		if (candidates.length > 0) {
			return candidates[0]
		}
		const hash = crypto
			.createHash('sha256')
			.update(JSON.stringify(payload || {}))
			.digest('hex')
		return `pakasir:${hash}`
	}

	private static async markOrderPaidFromPakasir(args: {
		appId: string
		orderId: string
		invoiceId: string
		verified: PakasirTransactionNormalized
		rawPayload: Record<string, unknown>
		pakasirConfig?: PakasirRuntimeConfig
	}) {
		const outcome = await prisma.$transaction(async (tx) => {
			const order = await tx.orders.findFirst({
				where: {
					id: args.orderId,
					app_id: args.appId,
				},
				select: {
					id: true,
					app_id: true,
					contact_id: true,
					conversation_id: true,
				},
			})
			if (!order || !order.app_id) {
				throw new Error('Order not found for paid webhook processing')
			}

			const invoice = await tx.order_invoices.findUnique({
				where: { id: args.invoiceId },
				select: {
					id: true,
					status: true,
					order_id: true,
					amount: true,
					payment_link: true,
					public_token: true,
				},
			})
			if (!invoice) {
				throw new Error('Invoice not found for paid webhook processing')
			}

			if (isPaidStatus(invoice.status)) {
				return {
					already_paid: true,
					order,
				}
			}

			const now = new Date()
			await tx.order_invoices.update({
				where: { id: args.invoiceId },
				data: {
					status: 'PAID',
					paid_at: now,
					verified_at: now,
					provider: 'pakasir',
					provider_invoice_id:
						args.verified.providerInvoiceId ||
						args.verified.referenceId ||
						null,
					payment_method: args.verified.method || undefined,
					payment_number: args.verified.paymentNumber || undefined,
					payment_link:
						args.verified.paymentLink ||
						invoice.payment_link ||
						PakasirClient.buildHostedPaymentUrl(
							args.verified.providerInvoiceId || args.verified.referenceId,
							args.pakasirConfig
								? toPakasirClientConfig(args.pakasirConfig)
								: undefined,
							{
								amount: toNumber(invoice.amount),
								orderId: args.orderId,
								method: args.verified.method,
							},
						),
					provider_payload: toJsonInput({
						webhook_payload: args.rawPayload,
						verification: args.verified.raw,
					}),
				},
			})

			await tx.orders.update({
				where: { id: args.orderId },
				data: {
					journey_phase: 'paid',
					order_status: 'completed',
					payment_provider: 'pakasir',
					paid_at: now,
					updated_at: now,
				},
			})

			await this.finalizeReservedStock(tx, {
				appId: args.appId,
				orderId: args.orderId,
			})

			const stageSync = order.conversation_id
				? await this.ensureJourneyStage(tx, {
						conversationId: order.conversation_id,
						appId: args.appId,
						journeyPhase: 'paid',
					})
				: null

			if (order.conversation_id) {
				await this.logConversationAction(tx, {
					conversationId: order.conversation_id,
					action: 'order.paid',
					targetId: args.orderId,
					metadata: {
						order_id: args.orderId,
						invoice_id: args.invoiceId,
						provider: 'pakasir',
						provider_invoice_id:
							args.verified.providerInvoiceId || args.verified.referenceId,
					},
				})
			}

			let vipStats: {
				lifetime: number
				paid_orders: number
				is_vip: boolean
			} | null = null
			if (order.contact_id) {
				vipStats = await this.ensureVipTag({
					db: tx,
					appId: args.appId,
					contactId: order.contact_id,
				})
			}

			return {
				already_paid: false,
				order,
				stageSync,
				vipStats,
			}
		})

		if (outcome.already_paid) {
			await this.sendPakasirPaymentSuccessNotification({
				appId: outcome.order.app_id || args.appId,
				orderId: args.orderId,
				invoiceId: args.invoiceId,
			}).catch((error) => {
				console.error(
					'[CommerceService] Failed sending Pakasir paid notification for already-paid order (fail-open):',
					error,
				)
			})
			return outcome
		}

		await this.dispatchStageChanges((outcome as any).stageSync || null)

		void BusinessWebhookDispatchService.dispatch({
			event: 'order.paid',
			appId: outcome.order.app_id,
			payload: {
				order_id: args.orderId,
				invoice_id: args.invoiceId,
				provider: 'pakasir',
				provider_invoice_id:
					args.verified.providerInvoiceId || args.verified.referenceId,
				status: 'PAID',
				contact_id: outcome.order.contact_id,
			},
		})
		const paidEventAppId = outcome.order.app_id || args.appId
		await this.refreshDecisionFromCommerceEvent({
			appId: paidEventAppId,
			conversationId: outcome.order.conversation_id,
			event: 'order.paid',
		})

		await this.sendPakasirPaymentSuccessNotification({
			appId: paidEventAppId,
			orderId: args.orderId,
			invoiceId: args.invoiceId,
		}).catch((error) => {
			console.error(
				'[CommerceService] Failed sending Pakasir paid notification (fail-open):',
				error,
			)
		})

		return outcome
	}

	private static buildPaymentSuccessFallbackText(params: {
		contactName?: string | null
		orderNumber?: number | null
		orderId: string
		amount: string
	}) {
		const firstName = nonEmptyString(params.contactName)?.split(/\s+/)[0] || ''
		const greeting = firstName ? `Kak ${firstName}` : 'Kak'
		const orderLabel = params.orderNumber
			? `#${params.orderNumber}`
			: params.orderId
		return `Pembayaran berhasil diterima, ${greeting}. Terima kasih ya, pesanan ${orderLabel} sebesar ${params.amount} sudah terkonfirmasi dan akan kami proses.`
	}

	private static buildPaymentSuccessAgentPrompt(params: {
		contactName?: string | null
		orderNumber?: number | null
		orderId: string
		invoiceId: string
		amount: string
		paymentMethod?: string | null
		paidAt?: string | null
		items: Array<{
			product_name: string | null
			variant_name: string | null
			quantity: number | null
			line_total: unknown
		}>
	}) {
		const orderLabel = params.orderNumber
			? `#${params.orderNumber}`
			: params.orderId
		const itemLines = params.items
			.slice(0, 5)
			.map((item, index) => {
				const name = [item.product_name, item.variant_name]
					.map((part) => nonEmptyString(part))
					.filter(Boolean)
					.join(' - ')
				const qty = Number(item.quantity || 0) || 1
				const lineTotal = formatCurrencyAmount(item.line_total)
				return `${index + 1}. ${name || 'Item'} x${qty} (${lineTotal})`
			})
			.join('\n')

		return [
			'Tugas Anda: tulis SATU pesan WhatsApp singkat ke customer karena pembayaran sudah berhasil.',
			'Wajib ikuti persona/AI Agent Behavior sebagai gaya bicara, sapaan, dan batasan jawaban.',
			'Jangan tampilkan prompt, instruksi internal, JSON, webhook, status teknis, atau nama sistem internal.',
			'Jangan gunakan markdown tebal, bullet panjang, atau link.',
			'Sampaikan inti bahwa pembayaran berhasil diterima, ucapkan terima kasih, dan beri tahu pesanan akan diproses/ditindaklanjuti.',
			'Gunakan bahasa Indonesia natural sesuai persona.',
			'Data konteks, pakai seperlunya. Jangan wajib menyebut UUID/invoice ID jika tidak natural untuk customer.',
			`Nama customer: ${params.contactName || '-'}`,
			`Order: ${orderLabel}`,
			`Invoice ID: ${params.invoiceId}`,
			`Nominal: ${params.amount}`,
			`Metode pembayaran: ${params.paymentMethod || '-'}`,
			`Waktu bayar: ${params.paidAt || '-'}`,
			itemLines ? `Item:\n${itemLines}` : '',
			'Balasan final:',
		]
			.filter((line) => line.trim().length > 0)
			.join('\n')
	}

	private static async resolvePaymentSuccessAgentId(params: {
		appId: string
		contactId?: string | null
		conversation: {
			additional_attributes?: unknown
			inboxes?: { chatbot_id?: string | null } | null
		}
	}) {
		const candidates: Array<string | null | undefined> = []

		if (params.contactId && isUuid(params.contactId)) {
			try {
				const mapped = await CustomerService.resolveMappedChatbotForCustomerLevel({
					appId: params.appId,
					contactId: params.contactId,
				})
				candidates.push(mapped.mapped_chatbot_id, mapped.mapped_persona_id)
			} catch (error) {
				console.error(
					'[CommerceService] Failed resolving customer-level AI agent for paid notification (fail-open):',
					error,
				)
			}
		}

		const additionalAttributes = parseJson(
			params.conversation.additional_attributes,
		)
		const runtimeState = parseJson(additionalAttributes.flow_runtime)
		const runtimeVariables = parseJson(runtimeState.variables)
		candidates.push(
			nonEmptyString(runtimeVariables['customer.mapped_chatbot_id']),
			nonEmptyString(runtimeVariables['customer.mapped_persona_id']),
			nonEmptyString(runtimeVariables['decision.persona_id']),
			params.conversation.inboxes?.chatbot_id,
		)

		const configured = uniqStrings(candidates).find((candidate) =>
			isUuid(candidate),
		)
		if (configured) return configured

		return ChatbotService.resolveDefaultChatbotId(params.appId)
	}

	private static async sendPakasirPaymentSuccessNotification(args: {
		appId: string
		orderId: string
		invoiceId: string
	}) {
		if (!isUuid(args.appId) || !isUuid(args.orderId) || !isUuid(args.invoiceId)) {
			return null
		}

		const order = await prisma.orders.findFirst({
			where: {
				id: args.orderId,
				app_id: args.appId,
			},
			select: {
				id: true,
				app_id: true,
				contact_id: true,
				conversation_id: true,
				order_number: true,
				currency: true,
				grand_total: true,
				payment_method: true,
				paid_at: true,
			},
		})
		if (!order?.conversation_id) return null

		const uniqueTempId = `pakasir-paid:${args.invoiceId}`
		const existingMessage = await prisma.messages.findFirst({
			where: {
				conversation_id: order.conversation_id,
				unique_temp_id: uniqueTempId,
			},
			select: { id: true },
			orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
		})
		if (existingMessage?.id) return existingMessage.id

		const [invoice, items, conversation] = await Promise.all([
			prisma.order_invoices.findUnique({
				where: { id: args.invoiceId },
				select: {
					id: true,
					amount: true,
					status: true,
					payment_method: true,
					paid_at: true,
				},
			}),
			prisma.order_items.findMany({
				where: { order_id: args.orderId },
				orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
				select: {
					product_name: true,
					variant_name: true,
					quantity: true,
					line_total: true,
				},
			}),
			prisma.conversations.findFirst({
				where: {
					id: order.conversation_id,
					app_id: args.appId,
				},
				select: {
					id: true,
					contact_id: true,
					additional_attributes: true,
					contacts: {
						select: {
							id: true,
							name: true,
						},
					},
					inboxes: {
						select: {
							chatbot_id: true,
						},
					},
				},
			}),
		])
		if (!conversation?.id) return null

		const amount = formatCurrencyAmount(
			invoice?.amount || order.grand_total,
			order.currency,
		)
		const orderNumber = toBigIntNumber(order.order_number)
		const contactName = nonEmptyString(conversation.contacts?.name)
		const fallbackText = this.buildPaymentSuccessFallbackText({
			contactName,
			orderNumber,
			orderId: order.id,
			amount,
		})

		let content = fallbackText
		let aiMeta: Record<string, unknown> = {}
		const agentId = await this.resolvePaymentSuccessAgentId({
			appId: args.appId,
			contactId: conversation.contact_id || order.contact_id,
			conversation,
		})

		if (agentId) {
			try {
				const response = await ChatbotService.generateAgentReply(
					agentId,
					args.appId,
					{
						message: this.buildPaymentSuccessAgentPrompt({
							contactName,
							orderNumber,
							orderId: order.id,
							invoiceId: args.invoiceId,
							amount,
							paymentMethod:
								invoice?.payment_method || order.payment_method || null,
							paidAt: toIso(invoice?.paid_at || order.paid_at),
							items,
						}),
						history: [],
						runTools: false,
						mode: 'live',
						entrypoint: 'webhook_live',
						conversationId: conversation.id,
						sourceMessageIds: [],
						skipRag: true,
						allowAllKnowledge: false,
						minimalContext: true,
					},
				)
				const generatedText = extractAiResponseText(response).trim()
				const responseMeta = parseJson((response as Record<string, unknown>).meta)
				if (generatedText && !hasInternalPromptLeak(generatedText)) {
					content = generatedText
					aiMeta = responseMeta
				}
			} catch (error) {
				console.error(
					'[CommerceService] Failed generating AI paid notification (fallback text will be used):',
					error,
				)
			}
		}

		const message = await MessageService.sendMessage({
			conversationId: conversation.id,
			senderType: 'bot',
			content,
			contentType: 'text',
			uniqueTempId,
			contentAttributes: {
				type: 'payment_success',
				source: 'pakasir_webhook',
				order_id: order.id,
				invoice_id: args.invoiceId,
				payment_provider: 'pakasir',
				payment_status: 'PAID',
				amount,
				ai_generated: content !== fallbackText,
				ai_agent_id: agentId || null,
				ai_agent_name: aiMeta.ai_agent_name || null,
				ai_response_log_id: aiMeta.ai_response_log_id || null,
				ai_provider_hit: Boolean(aiMeta.ai_provider_hit),
			},
		})

		void AIResponseLogService.attachMessageIds({
			logId: nonEmptyString(aiMeta.ai_response_log_id),
			messageIds: message?.id ? [message.id] : [],
			status: message?.id ? 'delivered' : 'generated',
		}).catch((error) => {
			console.error(
				'[CommerceService] Failed attaching paid notification AI log linkage (fail-open):',
				error,
			)
		})

		return message?.id || null
	}

	private static async sendPakasirPaymentSuccessNotificationFromReferences(args: {
		referenceCandidates: string[]
		appId?: string | null
	}) {
		const references = uniqStrings(args.referenceCandidates)
		if (references.length === 0) return null
		const uuidReferences = references.filter((reference) => isUuid(reference))
		const invoiceOrClauses: Prisma.order_invoicesWhereInput[] = [
			{ provider_invoice_id: { in: references } },
			{ xendit_invoice_id: { in: references } },
		]
		if (uuidReferences.length > 0) {
			invoiceOrClauses.unshift({ id: { in: uuidReferences } })
		}

		const invoice = await prisma.order_invoices.findFirst({
			where: { OR: invoiceOrClauses },
			orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
		})

		let order = invoice?.order_id
			? await prisma.orders.findUnique({ where: { id: invoice.order_id } })
			: null
		if (!order) {
			const orderOrClauses: Prisma.ordersWhereInput[] = [
				{ external_order_id: { in: references } },
			]
			if (uuidReferences.length > 0) {
				orderOrClauses.unshift({ id: { in: uuidReferences } })
			}
			order = await prisma.orders.findFirst({
				where: { OR: orderOrClauses },
				orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
			})
		}

		const resolvedInvoice =
			invoice ||
			(order
				? await prisma.order_invoices.findFirst({
						where: { order_id: order.id },
						orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
					})
				: null)
		const appId = order?.app_id || args.appId || null
		if (!appId || !order?.id || !resolvedInvoice?.id) return null

		return this.sendPakasirPaymentSuccessNotification({
			appId,
			orderId: order.id,
			invoiceId: resolvedInvoice.id,
		})
	}

	private static async getLatestInvoiceOrderIdsByStatus(
		appId: string,
		statuses: string[],
	): Promise<string[]> {
		const normalizedStatuses = uniqStrings(
			statuses.map((status) => normalizeInvoiceStatus(status)),
		)
		if (normalizedStatuses.length === 0) return []

		const params: unknown[] = [appId, ...normalizedStatuses]
		const placeholders = normalizedStatuses
			.map((_, index) => `$${index + 2}`)
			.join(', ')

		const rows = (await prisma.$queryRawUnsafe(
			`SELECT latest.order_id
			FROM (
				SELECT DISTINCT ON (oi.order_id)
					oi.order_id,
					UPPER(COALESCE(oi.status, 'NOT_PAID')) AS latest_status
				FROM order_invoices oi
				INNER JOIN orders o ON o.id = oi.order_id
				WHERE o.app_id = $1
				ORDER BY oi.order_id, oi.created_at DESC, oi.id DESC
			) latest
			WHERE latest.latest_status IN (${placeholders})`,
			...params,
		)) as Array<{ order_id: string }>

		return rows.map((row) => row.order_id).filter(Boolean)
	}

	static async listOrders(
		appId: string,
		input: {
			page?: unknown
			limit?: unknown
			search?: unknown
			journey_phase?: unknown
			order_status?: unknown
			payment_status?: unknown
		},
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		const page = Math.max(1, parsePositiveInt(input.page, DEFAULT_LIST_PAGE))
		const limit = Math.min(
			MAX_LIST_LIMIT,
			Math.max(1, parsePositiveInt(input.limit, DEFAULT_LIST_LIMIT)),
		)
		const skip = (page - 1) * limit
		const search = nonEmptyString(input.search)
		const journeyPhases = parseCsvValues(input.journey_phase).map((phase) =>
			phase.toLowerCase(),
		)
		const orderStatuses = parseCsvValues(input.order_status).map((status) =>
			status.toLowerCase(),
		)
		const paymentStatuses = parseCsvValues(input.payment_status).map((status) =>
			normalizeInvoiceStatus(status),
		)

		const andClauses: Prisma.ordersWhereInput[] = []

		if (journeyPhases.length > 0) {
			andClauses.push({
				journey_phase: {
					in: journeyPhases,
				},
			})
		}

		if (orderStatuses.length > 0) {
			andClauses.push({
				order_status: {
					in: orderStatuses,
				},
			})
		}

		if (paymentStatuses.length > 0) {
			const orderIds = await this.getLatestInvoiceOrderIdsByStatus(
				resolvedAppId,
				paymentStatuses,
			)
			if (orderIds.length === 0) {
				return {
					items: [],
					pagination: {
						page,
						limit,
						total_items: 0,
						total_pages: 0,
					},
				}
			}
			andClauses.push({
				id: { in: orderIds },
			})
		}

		if (search) {
			const searchClauses: Prisma.ordersWhereInput[] = []
			if (isUuid(search)) {
				searchClauses.push({ id: search })
				searchClauses.push({ contact_id: search })
				searchClauses.push({ conversation_id: search })
			}

			searchClauses.push({
				external_order_id: {
					contains: search,
					mode: 'insensitive',
				},
			})

			const numeric = Number.parseInt(search, 10)
			if (Number.isFinite(numeric) && numeric > 0) {
				searchClauses.push({
					order_number: BigInt(numeric),
				})
			}

			const contacts = await prisma.contacts.findMany({
				where: {
					app_id: resolvedAppId,
					OR: [
						{ name: { contains: search, mode: 'insensitive' } },
						{ email: { contains: search, mode: 'insensitive' } },
						{ phone_number: { contains: search, mode: 'insensitive' } },
					],
				},
				select: { id: true },
				take: 100,
			})

			const contactIds = contacts.map((contact) => contact.id)
			if (contactIds.length > 0) {
				searchClauses.push({
					contact_id: {
						in: contactIds,
					},
				})
			}

			andClauses.push({
				OR: searchClauses,
			})
		}

		const where: Prisma.ordersWhereInput = {
			app_id: resolvedAppId,
			...(andClauses.length > 0 ? { AND: andClauses } : {}),
		}

		const [totalItems, orders] = await Promise.all([
			prisma.orders.count({ where }),
			prisma.orders.findMany({
				where,
				orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
				skip,
				take: limit,
			}),
		])

		const orderIds = orders.map((order) => order.id)
		if (orderIds.length === 0) {
			return {
				items: [],
				pagination: {
					page,
					limit,
					total_items: totalItems,
					total_pages: Math.ceil(totalItems / limit),
				},
			}
		}

		const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ')
		const [itemCountRows, latestInvoiceRows] = await Promise.all([
			prisma.$queryRawUnsafe(
				`SELECT oi.order_id, COUNT(*)::int AS item_count
				FROM order_items oi
				WHERE oi.order_id IN (${placeholders})
				GROUP BY oi.order_id`,
				...orderIds,
			) as Promise<Array<{ order_id: string; item_count: number }>>,
			prisma.$queryRawUnsafe(
				`SELECT DISTINCT ON (oi.order_id)
					oi.id,
					oi.order_id,
					oi.status,
					oi.provider,
					oi.payment_method,
					oi.payment_number,
					oi.payment_link,
					oi.checkout_url,
					oi.amount,
					oi.paid_at,
					oi.expiry_date,
					oi.created_at
				FROM order_invoices oi
				WHERE oi.order_id IN (${placeholders})
				ORDER BY oi.order_id, oi.created_at DESC, oi.id DESC`,
				...orderIds,
			) as Promise<
				Array<{
					id: string
					order_id: string
					status: string | null
					provider: string | null
					payment_method: string | null
					payment_number: string | null
					payment_link: string | null
					checkout_url: string | null
					amount: number | null
					paid_at: Date | string | null
					expiry_date: Date | string | null
					created_at: Date | string | null
				}>
			>,
		])

		const itemCountByOrderId = new Map<string, number>(
			itemCountRows.map((row) => [row.order_id, Number(row.item_count || 0)]),
		)
		const latestInvoiceByOrderId = new Map(
			latestInvoiceRows.map((invoice) => [invoice.order_id, invoice]),
		)

		const contactIds = uniqStrings(orders.map((order) => order.contact_id))
		const conversationIds = uniqStrings(
			orders.map((order) => order.conversation_id),
		)

		const [contacts, conversations] = await Promise.all([
			contactIds.length > 0
				? prisma.contacts.findMany({
						where: { id: { in: contactIds } },
						select: {
							id: true,
							name: true,
							email: true,
							phone_number: true,
							avatar_url: true,
						},
					})
				: Promise.resolve([]),
			conversationIds.length > 0
				? prisma.conversations.findMany({
						where: { id: { in: conversationIds } },
						select: {
							id: true,
							inbox_id: true,
						},
					})
				: Promise.resolve([]),
		])

		const inboxIds = uniqStrings(
			conversations.map((conversation) => conversation.inbox_id),
		)
		const inboxes =
			inboxIds.length > 0
				? await prisma.inboxes.findMany({
						where: { id: { in: inboxIds } },
						select: { id: true, name: true },
					})
				: []

		const contactsById = new Map(
			contacts.map((contact) => [contact.id, contact]),
		)
		const conversationsById = new Map(
			conversations.map((conversation) => [conversation.id, conversation]),
		)
		const inboxById = new Map(inboxes.map((inbox) => [inbox.id, inbox]))

		const mapped = orders.map((order) => {
			const customer = order.contact_id
				? contactsById.get(order.contact_id) || null
				: null
			const conversation = order.conversation_id
				? conversationsById.get(order.conversation_id) || null
				: null
			const inbox = conversation?.inbox_id
				? inboxById.get(conversation.inbox_id) || null
				: null
			const latestInvoice = latestInvoiceByOrderId.get(order.id) || null
			const normalizedInvoiceStatus = latestInvoice
				? normalizeInvoiceStatus(latestInvoice.status)
				: 'NOT_PAID'

			return {
				id: order.id,
				order_number: toBigIntNumber(order.order_number),
				order_status: order.order_status || 'pending',
				journey_phase: order.journey_phase || 'cart',
				grand_total: toNumber(order.grand_total),
				created_at: toIso(order.created_at),
				updated_at: toIso(order.updated_at),
				item_count: itemCountByOrderId.get(order.id) || 0,
				invoice_status: normalizedInvoiceStatus,
				latest_invoice_summary: latestInvoice
					? {
							id: latestInvoice.id,
							status: normalizedInvoiceStatus,
							provider: latestInvoice.provider || 'custom',
							payment_method: latestInvoice.payment_method,
							payment_number: latestInvoice.payment_number,
							payment_link: latestInvoice.payment_link,
							checkout_url: latestInvoice.checkout_url,
							amount: toNumber(latestInvoice.amount),
							paid_at: toIso(latestInvoice.paid_at),
							expiry_date: toIso(latestInvoice.expiry_date),
							created_at: toIso(latestInvoice.created_at),
						}
					: null,
				customer: customer
					? {
							id: customer.id,
							name: customer.name,
							email: customer.email,
							phone_number: customer.phone_number,
							avatar_url: customer.avatar_url,
						}
					: null,
				conversation: conversation
					? {
							id: conversation.id,
							inbox_id: conversation.inbox_id,
							inbox_name: inbox?.name || null,
						}
					: null,
			}
		})

		return {
			items: mapped,
			pagination: {
				page,
				limit,
				total_items: totalItems,
				total_pages: Math.ceil(totalItems / limit),
			},
		}
	}

	static async getOrderDetail(appId: string, orderId: string) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(orderId)) throw new Error('Invalid order ID')

		const detail = await findOrderWithItemsAndInvoices(orderId, resolvedAppId)
		if (!detail) throw new Error('Order not found')

		const [customer, conversation, pakasirConfig] = await Promise.all([
			detail.order.contact_id
				? prisma.contacts.findUnique({
						where: { id: detail.order.contact_id },
						select: {
							id: true,
							name: true,
							email: true,
							phone_number: true,
							avatar_url: true,
						},
					})
				: Promise.resolve(null),
			detail.order.conversation_id
				? prisma.conversations.findUnique({
						where: { id: detail.order.conversation_id },
						select: {
							id: true,
							inbox_id: true,
						},
					})
				: Promise.resolve(null),
			this.resolvePakasirConfig(resolvedAppId),
		])

		const inbox = conversation?.inbox_id
			? await prisma.inboxes.findUnique({
					where: { id: conversation.inbox_id },
					select: { id: true, name: true },
				})
			: null

		return {
			...mapOrderWithDetails(detail),
			customer: customer
				? {
						id: customer.id,
						name: customer.name,
						email: customer.email,
						phone_number: customer.phone_number,
						avatar_url: customer.avatar_url,
					}
				: null,
			conversation: conversation
				? {
						id: conversation.id,
						inbox_id: conversation.inbox_id,
						inbox_name: inbox?.name || null,
					}
				: null,
			payment_methods: pakasirConfig.payment_methods,
		}
	}

	static async listProducts(appId: string) {
		const resolvedAppId = this.ensureValidAppId(appId)
		const [products, pakasirConfig] = await Promise.all([
			prisma.products.findMany({
				where: {
					app_id: resolvedAppId,
					is_active: true,
				},
				orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
			}),
			this.resolvePakasirConfig(resolvedAppId),
		])

		const productIds = products.map((product) => product.id)
		const variants =
			productIds.length > 0
				? await prisma.product_variants.findMany({
						where: {
							product_id: { in: productIds },
							app_id: resolvedAppId,
							is_active: true,
						},
						orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
					})
				: []

		const variantsByProductId = new Map<string, typeof variants>()
		for (const variant of variants) {
			const list = variantsByProductId.get(variant.product_id) || []
			list.push(variant)
			variantsByProductId.set(variant.product_id, list)
		}

		return {
			products: products.map((product) => ({
				id: product.id,
				name: product.name,
				sku: product.sku,
				image_url: product.image_url,
				description: product.description,
				base_price: toNumber(product.base_price),
				is_active: Boolean(product.is_active ?? true),
				metadata: parseJson(product.metadata),
				created_at: toIso(product.created_at),
				updated_at: toIso(product.updated_at),
				variants: (variantsByProductId.get(product.id) || []).map(
					(variant) => ({
						id: variant.id,
						product_id: variant.product_id,
						name: variant.name,
						sku: variant.sku,
						image_url: variant.image_url,
						attributes: parseJson(variant.attributes),
						price: toNumber(variant.price),
						stock_on_hand: Number(variant.stock_on_hand || 0),
						stock_reserved: Number(variant.stock_reserved || 0),
						available_stock: Math.max(
							0,
							Number(variant.stock_on_hand || 0) -
								Number(variant.stock_reserved || 0),
						),
						is_active: Boolean(variant.is_active ?? true),
						created_at: toIso(variant.created_at),
						updated_at: toIso(variant.updated_at),
					}),
				),
			})),
			payment_methods: pakasirConfig.payment_methods,
		}
	}

	static async createProduct(
		appId: string,
		input: {
			name: string
			sku?: string
			image_url?: string
			description?: string
			base_price?: number
			is_active?: boolean
			metadata?: Record<string, unknown>
		},
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		const name = String(input.name || '').trim()
		if (!name) {
			throw new Error('Product name is required')
		}

		const created = await prisma.products.create({
			data: {
				app_id: resolvedAppId,
				name,
				sku: resolveSku(input.sku),
				image_url: nonEmptyString(input.image_url),
				description: nonEmptyString(input.description),
				base_price: toNumber(input.base_price),
				is_active: input.is_active ?? true,
				metadata: toJsonInput(input.metadata || {}),
			},
		})

		return {
			id: created.id,
			name: created.name,
			sku: created.sku,
			image_url: created.image_url,
			description: created.description,
			base_price: toNumber(created.base_price),
			is_active: Boolean(created.is_active ?? true),
			metadata: parseJson(created.metadata),
			created_at: toIso(created.created_at),
			updated_at: toIso(created.updated_at),
		}
	}

	static async createVariant(
		appId: string,
		productId: string,
		input: {
			name: string
			sku?: string
			image_url?: string
			attributes?: Record<string, unknown>
			price?: number
			stock_on_hand?: number
			is_active?: boolean
		},
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(productId)) {
			throw new Error('Invalid product ID')
		}

		const product = await prisma.products.findFirst({
			where: {
				id: productId,
				app_id: resolvedAppId,
			},
			select: {
				id: true,
				organization_id: true,
			},
		})
		if (!product) {
			throw new Error('Product not found')
		}

		const name = String(input.name || '').trim()
		if (!name) {
			throw new Error('Variant name is required')
		}

		const initialStock = Math.max(0, Math.floor(toNumber(input.stock_on_hand)))

		const created = await prisma.product_variants.create({
			data: {
				product_id: product.id,
				app_id: resolvedAppId,
				organization_id: product.organization_id,
				name,
				sku: resolveSku(input.sku),
				image_url: nonEmptyString(input.image_url),
				attributes: toJsonInput(input.attributes || {}),
				price: toNumber(input.price),
				stock_on_hand: initialStock,
				stock_reserved: 0,
				is_active: input.is_active ?? true,
			},
		})

		if (initialStock > 0) {
			await prisma.stock_movements.create({
				data: {
					app_id: resolvedAppId,
					organization_id: product.organization_id || null,
					variant_id: created.id,
					movement_type: 'initial',
					quantity: initialStock,
					stock_before: 0,
					stock_after: initialStock,
					note: 'Initial stock on variant create',
					metadata: toJsonInput({}),
				},
			})
		}

		return {
			id: created.id,
			product_id: created.product_id,
			name: created.name,
			sku: created.sku,
			image_url: created.image_url,
			attributes: parseJson(created.attributes),
			price: toNumber(created.price),
			stock_on_hand: Number(created.stock_on_hand || 0),
			stock_reserved: Number(created.stock_reserved || 0),
			available_stock: Math.max(
				0,
				Number(created.stock_on_hand || 0) -
					Number(created.stock_reserved || 0),
			),
			is_active: Boolean(created.is_active ?? true),
			created_at: toIso(created.created_at),
			updated_at: toIso(created.updated_at),
		}
	}

	static async bulkUpsertVariants(
		appId: string,
		productId: string,
		input: {
			upserts?: unknown
			deactivate_variant_ids?: unknown
		},
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(productId)) {
			throw new Error('Invalid product ID')
		}

		const product = await prisma.products.findFirst({
			where: {
				id: productId,
				app_id: resolvedAppId,
			},
			select: {
				id: true,
				organization_id: true,
			},
		})
		if (!product) {
			throw new Error('Product not found')
		}

		const rawUpserts = Array.isArray(input.upserts) ? input.upserts : []
		const upserts = rawUpserts.map((entry) => {
			const payload =
				entry && typeof entry === 'object' && !Array.isArray(entry)
					? (entry as Record<string, unknown>)
					: {}
			const id = nonEmptyString(payload.id)
			const name = String(payload.name || '').trim()
			const sku = nonEmptyString(payload.sku)
			const imageUrl = nonEmptyString(payload.image_url)
			const price = Math.max(0, toNumber(payload.price))
			const stockOnHand = Math.max(
				0,
				Math.floor(toNumber(payload.stock_on_hand)),
			)
			const isActive =
				typeof payload.is_active === 'boolean' ? payload.is_active : true
			const attributes = parseJson(payload.attributes)

			if (id && !isUuid(id)) {
				throw new Error(`Invalid variant ID: ${id}`)
			}
			if (!name) {
				throw new Error('Variant name is required')
			}

			return {
				id,
				name,
				sku,
				image_url: imageUrl,
				price,
				stock_on_hand: stockOnHand,
				is_active: isActive,
				attributes,
			}
		})

		const deactivateVariantIds = uniqStrings(
			Array.isArray(input.deactivate_variant_ids)
				? input.deactivate_variant_ids.map((value) =>
						String(value || '').trim(),
					)
				: [],
		)
		for (const variantId of deactivateVariantIds) {
			if (!isUuid(variantId)) {
				throw new Error(`Invalid variant ID: ${variantId}`)
			}
		}

		const duplicateSku = (() => {
			const seen = new Set<string>()
			for (const item of upserts) {
				const key = String(item.sku || '')
					.trim()
					.toLowerCase()
				if (!key) continue
				if (seen.has(key)) return item.sku
				seen.add(key)
			}
			return null
		})()
		if (duplicateSku) {
			throw new Error(`Duplicate SKU in request: ${duplicateSku}`)
		}

		const targetVariantIds = uniqStrings([
			...upserts.map((item) => item.id),
			...deactivateVariantIds,
		])

		const upserted = await prisma.$transaction(async (tx) => {
			const existingVariants =
				targetVariantIds.length > 0
					? await tx.product_variants.findMany({
							where: {
								app_id: resolvedAppId,
								product_id: product.id,
								id: { in: targetVariantIds },
							},
						})
					: []
			const existingById = new Map(
				existingVariants.map((variant) => [variant.id, variant]),
			)

			for (const id of targetVariantIds) {
				if (!existingById.has(id)) {
					throw new Error(`Variant not found for product: ${id}`)
				}
			}

			const touched: typeof existingVariants = []
			for (const item of upserts) {
				if (item.id) {
					const variant = existingById.get(item.id)
					if (!variant) {
						throw new Error(`Variant not found for product: ${item.id}`)
					}
					const updated = await tx.product_variants.update({
						where: { id: variant.id },
						data: {
							name: item.name,
							sku: item.sku,
							image_url: item.image_url,
							attributes: toJsonInput(item.attributes),
							price: item.price,
							is_active: item.is_active,
							updated_at: new Date(),
						},
					})
					touched.push(updated)
					continue
				}

				const created = await tx.product_variants.create({
					data: {
						product_id: product.id,
						app_id: resolvedAppId,
						organization_id: product.organization_id,
						name: item.name,
						sku: item.sku || generateSku(),
						image_url: item.image_url,
						attributes: toJsonInput(item.attributes),
						price: item.price,
						stock_on_hand: item.stock_on_hand,
						stock_reserved: 0,
						is_active: item.is_active,
					},
				})
				if (item.stock_on_hand > 0) {
					await tx.stock_movements.create({
						data: {
							app_id: resolvedAppId,
							organization_id: product.organization_id || null,
							variant_id: created.id,
							movement_type: 'initial',
							quantity: item.stock_on_hand,
							stock_before: 0,
							stock_after: item.stock_on_hand,
							note: 'Initial stock on variant create',
							metadata: toJsonInput({}),
						},
					})
				}
				touched.push(created)
			}

			if (deactivateVariantIds.length > 0) {
				await tx.product_variants.updateMany({
					where: {
						app_id: resolvedAppId,
						product_id: product.id,
						id: { in: deactivateVariantIds },
					},
					data: {
						is_active: false,
						updated_at: new Date(),
					},
				})
			}

			return touched
		})

		return {
			product_id: product.id,
			upserted: upserted.map((variant) => ({
				id: variant.id,
				product_id: variant.product_id,
				name: variant.name,
				sku: variant.sku,
				image_url: variant.image_url,
				attributes: parseJson(variant.attributes),
				price: toNumber(variant.price),
				stock_on_hand: Number(variant.stock_on_hand || 0),
				stock_reserved: Number(variant.stock_reserved || 0),
				available_stock: Math.max(
					0,
					Number(variant.stock_on_hand || 0) -
						Number(variant.stock_reserved || 0),
				),
				is_active: Boolean(variant.is_active ?? true),
				created_at: toIso(variant.created_at),
				updated_at: toIso(variant.updated_at),
			})),
			deactivated_variant_ids: deactivateVariantIds,
		}
	}

	static async updateProduct(
		appId: string,
		productId: string,
		input: Record<string, unknown>,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(productId)) throw new Error('Invalid product ID')

		const updateData: Prisma.productsUpdateInput = {
			updated_at: new Date(),
		}

		if (Object.prototype.hasOwnProperty.call(input, 'name')) {
			const name = String(input.name || '').trim()
			if (!name) throw new Error('Product name cannot be empty')
			updateData.name = name
		}
		if (Object.prototype.hasOwnProperty.call(input, 'sku')) {
			updateData.sku = nonEmptyString(input.sku)
		}
		if (Object.prototype.hasOwnProperty.call(input, 'image_url')) {
			updateData.image_url = nonEmptyString(input.image_url)
		}
		if (Object.prototype.hasOwnProperty.call(input, 'description')) {
			updateData.description = nonEmptyString(input.description)
		}
		if (
			Object.prototype.hasOwnProperty.call(input, 'base_price') ||
			Object.prototype.hasOwnProperty.call(input, 'price')
		) {
			updateData.base_price = toNumber(input.base_price || input.price)
		}
		if (Object.prototype.hasOwnProperty.call(input, 'is_active')) {
			updateData.is_active = Boolean(input.is_active)
		}
		if (Object.prototype.hasOwnProperty.call(input, 'metadata')) {
			updateData.metadata = toJsonInput(parseJson(input.metadata))
		}

		const updated = await prisma.products.updateManyAndReturn({
			where: {
				id: productId,
				app_id: resolvedAppId,
			},
			data: updateData,
		})
		const product = updated[0]
		if (!product) throw new Error('Product not found')

		return {
			id: product.id,
			name: product.name,
			sku: product.sku,
			image_url: product.image_url,
			description: product.description,
			base_price: toNumber(product.base_price),
			is_active: Boolean(product.is_active ?? true),
			metadata: parseJson(product.metadata),
			created_at: toIso(product.created_at),
			updated_at: toIso(product.updated_at),
		}
	}

	static async deactivateProduct(appId: string, productId: string) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(productId)) throw new Error('Invalid product ID')

		const updated = await prisma.$transaction(async (tx) => {
			const product = await tx.products.findFirst({
				where: {
					id: productId,
					app_id: resolvedAppId,
				},
				select: { id: true },
			})
			if (!product) throw new Error('Product not found')

			await tx.products.update({
				where: { id: product.id },
				data: {
					is_active: false,
					updated_at: new Date(),
				},
			})

			await tx.product_variants.updateMany({
				where: {
					product_id: product.id,
					app_id: resolvedAppId,
				},
				data: {
					is_active: false,
					updated_at: new Date(),
				},
			})

			return product.id
		})

		return {
			id: updated,
			is_active: false,
		}
	}

	static async updateVariant(
		appId: string,
		variantId: string,
		input: Record<string, unknown>,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(variantId)) throw new Error('Invalid variant ID')

		const updateData: Prisma.product_variantsUpdateInput = {
			updated_at: new Date(),
		}

		if (Object.prototype.hasOwnProperty.call(input, 'name')) {
			const name = String(input.name || '').trim()
			if (!name) throw new Error('Variant name cannot be empty')
			updateData.name = name
		}
		if (Object.prototype.hasOwnProperty.call(input, 'sku')) {
			updateData.sku = nonEmptyString(input.sku)
		}
		if (Object.prototype.hasOwnProperty.call(input, 'image_url')) {
			updateData.image_url = nonEmptyString(input.image_url)
		}
		if (Object.prototype.hasOwnProperty.call(input, 'attributes')) {
			updateData.attributes = toJsonInput(parseJson(input.attributes))
		}
		if (Object.prototype.hasOwnProperty.call(input, 'price')) {
			updateData.price = toNumber(input.price)
		}
		if (Object.prototype.hasOwnProperty.call(input, 'is_active')) {
			updateData.is_active = Boolean(input.is_active)
		}

		const variant = await prisma.product_variants.updateManyAndReturn({
			where: {
				id: variantId,
				app_id: resolvedAppId,
			},
			data: updateData,
		})
		const updated = variant[0]
		if (!updated) throw new Error('Variant not found')

		return {
			id: updated.id,
			product_id: updated.product_id,
			name: updated.name,
			sku: updated.sku,
			image_url: updated.image_url,
			attributes: parseJson(updated.attributes),
			price: toNumber(updated.price),
			stock_on_hand: Number(updated.stock_on_hand || 0),
			stock_reserved: Number(updated.stock_reserved || 0),
			available_stock: Math.max(
				0,
				Number(updated.stock_on_hand || 0) -
					Number(updated.stock_reserved || 0),
			),
			is_active: Boolean(updated.is_active ?? true),
			created_at: toIso(updated.created_at),
			updated_at: toIso(updated.updated_at),
		}
	}

	static async deactivateVariant(appId: string, variantId: string) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(variantId)) throw new Error('Invalid variant ID')

		const variant = await prisma.product_variants.updateManyAndReturn({
			where: {
				id: variantId,
				app_id: resolvedAppId,
			},
			data: {
				is_active: false,
				updated_at: new Date(),
			},
		})
		const updated = variant[0]
		if (!updated) throw new Error('Variant not found')

		return {
			id: updated.id,
			is_active: false,
		}
	}

	static async listStockVariants(
		appId: string,
		input: {
			page?: unknown
			limit?: unknown
			search?: unknown
			low_stock?: unknown
			threshold?: unknown
			include_inactive?: unknown
		},
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		const page = Math.max(1, parsePositiveInt(input.page, DEFAULT_LIST_PAGE))
		const limit = Math.min(
			MAX_LIST_LIMIT,
			Math.max(1, parsePositiveInt(input.limit, DEFAULT_LIST_LIMIT)),
		)
		const search = nonEmptyString(input.search)
		const lowStockOnly = parseBoolean(input.low_stock)
		const includeInactive = parseBoolean(input.include_inactive)
		const threshold = Math.max(
			0,
			Math.floor(
				toNumber(
					input.threshold === undefined || input.threshold === null
						? 10
						: input.threshold,
				),
			),
		)

		const matchingProductIds = search
			? (
					await prisma.products.findMany({
						where: {
							app_id: resolvedAppId,
							OR: [
								{ name: { contains: search, mode: 'insensitive' } },
								{ sku: { contains: search, mode: 'insensitive' } },
							],
						},
						select: { id: true },
						take: 100,
					})
				).map((product) => product.id)
			: []

		const variants = await prisma.product_variants.findMany({
			where: {
				app_id: resolvedAppId,
				...(includeInactive ? {} : { is_active: true }),
				...(search
					? {
							OR: [
								{ name: { contains: search, mode: 'insensitive' } },
								{ sku: { contains: search, mode: 'insensitive' } },
								...(matchingProductIds.length > 0
									? [{ product_id: { in: matchingProductIds } }]
									: []),
							],
						}
					: {}),
			},
			orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
		})

		const productIds = uniqStrings(
			variants.map((variant) => variant.product_id),
		)
		const products =
			productIds.length > 0
				? await prisma.products.findMany({
						where: { id: { in: productIds } },
						select: { id: true, name: true, sku: true },
					})
				: []
		const productsById = new Map(
			products.map((product) => [product.id, product]),
		)

		const filtered = variants
			.map((variant) => {
				const stockOnHand = Number(variant.stock_on_hand || 0)
				const stockReserved = Number(variant.stock_reserved || 0)
				const availableStock = Math.max(0, stockOnHand - stockReserved)
				const product = productsById.get(variant.product_id)
				return {
					id: variant.id,
					product_id: variant.product_id,
					product_name: product?.name || 'Product',
					product_sku: product?.sku || null,
					name: variant.name,
					sku: variant.sku,
					price: toNumber(variant.price),
					attributes: parseJson(variant.attributes),
					stock_on_hand: stockOnHand,
					stock_reserved: stockReserved,
					available_stock: availableStock,
					low_stock: availableStock <= threshold,
					is_active: Boolean(variant.is_active ?? true),
					updated_at: toIso(variant.updated_at),
				}
			})
			.filter((variant) => (lowStockOnly ? variant.low_stock : true))

		const totalItems = filtered.length
		const start = (page - 1) * limit
		const paged = filtered.slice(start, start + limit)

		return {
			items: paged,
			pagination: {
				page,
				limit,
				total_items: totalItems,
				total_pages: Math.ceil(totalItems / limit),
			},
		}
	}

	static async listStockMovements(
		appId: string,
		input: {
			page?: unknown
			limit?: unknown
			search?: unknown
			variant_id?: unknown
			movement_type?: unknown
		},
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		const page = Math.max(1, parsePositiveInt(input.page, DEFAULT_LIST_PAGE))
		const limit = Math.min(
			MAX_LIST_LIMIT,
			Math.max(1, parsePositiveInt(input.limit, DEFAULT_LIST_LIMIT)),
		)
		const search = nonEmptyString(input.search)
		const variantId = nonEmptyString(input.variant_id)
		const movementType = nonEmptyString(input.movement_type)

		if (variantId && !isUuid(variantId)) {
			throw new Error('Invalid variant ID')
		}

		const where: Prisma.stock_movementsWhereInput = {
			app_id: resolvedAppId,
			...(variantId ? { variant_id: variantId } : {}),
			...(movementType
				? {
						movement_type: {
							equals: movementType,
							mode: 'insensitive',
						},
					}
				: {}),
		}

		if (search) {
			const matchingProductIds = (
				await prisma.products.findMany({
					where: {
						app_id: resolvedAppId,
						OR: [
							{ name: { contains: search, mode: 'insensitive' } },
							{ sku: { contains: search, mode: 'insensitive' } },
						],
					},
					select: { id: true },
					take: 200,
				})
			).map((product) => product.id)

			const matchingVariants = (
				await prisma.product_variants.findMany({
					where: {
						app_id: resolvedAppId,
						OR: [
							{ name: { contains: search, mode: 'insensitive' } },
							{ sku: { contains: search, mode: 'insensitive' } },
							...(matchingProductIds.length > 0
								? [{ product_id: { in: matchingProductIds } }]
								: []),
						],
					},
					select: { id: true },
					take: 500,
				})
			).map((variant) => variant.id)

			where.AND = [
				{
					OR: [
						{ note: { contains: search, mode: 'insensitive' } },
						{ movement_type: { contains: search, mode: 'insensitive' } },
						...(matchingVariants.length > 0
							? [{ variant_id: { in: matchingVariants } }]
							: []),
					],
				},
			]
		}

		const [totalItems, rows] = await Promise.all([
			prisma.stock_movements.count({ where }),
			prisma.stock_movements.findMany({
				where,
				orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
				skip: (page - 1) * limit,
				take: limit,
			}),
		])

		const variantIds = uniqStrings(rows.map((row) => row.variant_id))
		const variants =
			variantIds.length > 0
				? await prisma.product_variants.findMany({
						where: { id: { in: variantIds } },
						select: {
							id: true,
							product_id: true,
							name: true,
							sku: true,
						},
					})
				: []
		const variantsById = new Map(
			variants.map((variant) => [variant.id, variant]),
		)

		const productIds = uniqStrings(
			variants.map((variant) => variant.product_id),
		)
		const products =
			productIds.length > 0
				? await prisma.products.findMany({
						where: { id: { in: productIds } },
						select: {
							id: true,
							name: true,
							sku: true,
						},
					})
				: []
		const productsById = new Map(
			products.map((product) => [product.id, product]),
		)

		return {
			items: rows.map((row) => {
				const variant = variantsById.get(row.variant_id)
				const product = variant ? productsById.get(variant.product_id) : null
				return {
					id: row.id,
					variant_id: row.variant_id,
					product_id: variant?.product_id || null,
					product_name: product?.name || 'Product',
					product_sku: product?.sku || null,
					variant_name: variant?.name || 'Variant',
					sku: variant?.sku || null,
					movement_type: row.movement_type,
					quantity: Math.max(0, Number(row.quantity || 0)),
					stock_before: Math.max(0, Number(row.stock_before || 0)),
					stock_after: Math.max(0, Number(row.stock_after || 0)),
					note: row.note || null,
					order_id: row.order_id || null,
					created_at: toIso(row.created_at),
				}
			}),
			pagination: {
				page,
				limit,
				total_items: totalItems,
				total_pages: Math.ceil(totalItems / limit),
			},
		}
	}

	static async adjustVariantStock(
		appId: string,
		variantId: string,
		input: {
			quantity: number
			note?: string
			movement_type?: string
		},
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(variantId)) throw new Error('Invalid variant ID')

		const quantity = Math.trunc(toNumber(input.quantity))
		if (quantity === 0) {
			throw new Error('Stock adjustment quantity cannot be zero')
		}

		const result = await prisma.$transaction(async (tx) => {
			const variant = await tx.product_variants.findFirst({
				where: {
					id: variantId,
					app_id: resolvedAppId,
				},
				select: {
					id: true,
					stock_on_hand: true,
					stock_reserved: true,
					organization_id: true,
				},
			})
			if (!variant) throw new Error('Variant not found')

			const onHandBefore = Math.max(0, Number(variant.stock_on_hand || 0))
			const reserved = Math.max(0, Number(variant.stock_reserved || 0))
			const onHandAfter = onHandBefore + quantity
			if (onHandAfter < reserved) {
				throw new Error(
					`Adjustment would violate reserved stock. Current reserved: ${reserved}`,
				)
			}

			const updated = await tx.product_variants.update({
				where: { id: variant.id },
				data: {
					stock_on_hand: onHandAfter,
					updated_at: new Date(),
				},
			})

			await tx.stock_movements.create({
				data: {
					app_id: resolvedAppId,
					organization_id: variant.organization_id || null,
					variant_id: variant.id,
					movement_type:
						nonEmptyString(input.movement_type) ||
						(quantity > 0 ? 'adjust_in' : 'adjust_out'),
					quantity: Math.abs(quantity),
					stock_before: onHandBefore,
					stock_after: onHandAfter,
					note:
						nonEmptyString(input.note) ||
						(quantity > 0 ? 'Manual stock increase' : 'Manual stock decrease'),
					metadata: {
						requested_delta: quantity,
					},
				},
			})

			return updated
		})

		return {
			id: result.id,
			stock_on_hand: Number(result.stock_on_hand || 0),
			stock_reserved: Number(result.stock_reserved || 0),
			available_stock: Math.max(
				0,
				Number(result.stock_on_hand || 0) - Number(result.stock_reserved || 0),
			),
			updated_at: toIso(result.updated_at),
		}
	}

	static async addToCart(
		appId: string,
		input: AddToCartInput,
		actorId?: string | null,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(input.conversation_id)) {
			throw new Error('Invalid conversation_id')
		}

		const normalizedItems = (Array.isArray(input.items) ? input.items : [])
			.map((item) => ({
				variant_id: String(item?.variant_id || '').trim(),
				product_id: String(item?.product_id || '').trim(),
				quantity: Math.trunc(toNumber(item?.quantity)),
			}))
			.filter(
				(item) =>
					(isUuid(item.variant_id) || isUuid(item.product_id)) &&
					item.quantity > 0,
			)

		if (normalizedItems.length === 0) {
			throw new Error('At least one valid item is required')
		}

		const outcome = await prisma.$transaction(async (tx) => {
			const conversation = await this.ensureConversationOwned(
				tx,
				input.conversation_id,
				resolvedAppId,
			)

			let order =
				input.order_id && isUuid(input.order_id)
					? await tx.orders.findFirst({
							where: {
								id: input.order_id,
								app_id: resolvedAppId,
							},
						})
					: null

			if (!order) {
				order = await tx.orders.findFirst({
					where: {
						app_id: resolvedAppId,
						conversation_id: conversation.id,
						journey_phase: { in: OPEN_ORDER_PHASES },
						NOT: {
							order_status: {
								in: ['cancelled', 'expired', 'completed', 'paid'],
							},
						},
					},
					orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
				})
			}

			if (!order) {
				order = await tx.orders.create({
					data: {
						app_id: resolvedAppId,
						organization_id: null,
						conversation_id: conversation.id,
						contact_id:
							nonEmptyString(input.contact_id) ||
							conversation.contact_id ||
							null,
						order_status: 'pending',
						payment_type: 'one_time_payment',
						payment_method: 'qris',
						payment_provider: 'pakasir',
						journey_phase: 'cart',
						currency: 'IDR',
						metadata: {},
					},
				})
			}

			const variantIds = uniqStrings(
				normalizedItems
					.map((item) => item.variant_id)
					.filter((item) => isUuid(item)),
			)
			const explicitProductIds = uniqStrings(
				normalizedItems
					.map((item) => item.product_id)
					.filter((item) => isUuid(item)),
			)
			const variants =
				variantIds.length > 0
					? await tx.product_variants.findMany({
							where: {
								id: { in: variantIds },
								app_id: resolvedAppId,
								is_active: true,
							},
						})
					: []
			if (variants.length !== variantIds.length) {
				throw new Error('One or more variants are unavailable')
			}

			const productIds = uniqStrings(
				[
					...variants.map((variant) => variant.product_id),
					...explicitProductIds,
				],
			)
			const products = await tx.products.findMany({
				where: {
					id: { in: productIds },
					app_id: resolvedAppId,
					is_active: true,
				},
			})
			if (products.length !== productIds.length) {
				throw new Error('One or more products are unavailable')
			}
			const productsById = new Map(
				products.map((product) => [product.id, product]),
			)
			const variantsById = new Map(
				variants.map((variant) => [variant.id, variant]),
			)

			for (const item of normalizedItems) {
				const variant = item.variant_id
					? variantsById.get(item.variant_id)
					: null
				const productId = variant?.product_id || item.product_id
				if (!productId) continue

				const product = productsById.get(productId)
				if (!product) continue

				const unitPrice = variant
					? toNumber(variant.price)
					: toNumber(product.base_price)
				const lineTotal = unitPrice * item.quantity
				const variantId = variant?.id || null

				const existingItem = await tx.order_items.findFirst({
					where: {
						order_id: order.id,
						product_id: productId,
						variant_id: variantId,
					},
					orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
				})

				if (existingItem) {
					const nextQty = Math.max(
						1,
						Number(existingItem.quantity || 0) + item.quantity,
					)
					const nextLine = unitPrice * nextQty
					await tx.order_items.update({
						where: { id: existingItem.id },
						data: {
							product_id: productId,
							variant_id: variantId,
							product_name:
								product?.name || existingItem.product_name || 'Product',
							variant_name:
								variant?.name || existingItem.variant_name || null,
							quantity: nextQty,
							price: unitPrice,
							unit_price: unitPrice,
							line_total: nextLine,
							metadata: {
								...(parseJson(existingItem.metadata) || {}),
								added_via: 'add_to_cart',
								product_only: !variantId,
							},
						},
					})
				} else {
					await tx.order_items.create({
						data: {
							order_id: order.id,
							product_id: productId,
							variant_id: variantId,
							product_name: product?.name || 'Product',
							variant_name: variant?.name || null,
							quantity: item.quantity,
							price: unitPrice,
							unit_price: unitPrice,
							line_total: lineTotal,
							metadata: {
								added_via: 'add_to_cart',
								product_only: !variantId,
							},
						},
					})
				}
			}

			await this.recalculateOrderTotals(tx, order.id)

			const updatedOrder = await tx.orders.update({
				where: { id: order.id },
				data: {
					journey_phase: 'cart',
					order_status: 'pending',
					payment_provider: 'pakasir',
					updated_at: new Date(),
					contact_id:
						nonEmptyString(input.contact_id) ||
						order.contact_id ||
						conversation.contact_id ||
						null,
				},
			})

			const stageSync = await this.ensureJourneyStage(tx, {
				conversationId: conversation.id,
				appId: resolvedAppId,
				journeyPhase: 'cart',
				actorId,
			})

			await this.logConversationAction(tx, {
				conversationId: conversation.id,
				action: 'order.add_to_cart',
				actorId,
				targetId: updatedOrder.id,
				metadata: {
					items: normalizedItems,
				},
			})

			return {
				orderId: updatedOrder.id,
				conversationId: updatedOrder.conversation_id,
				stageSync,
			}
		})

		await this.dispatchStageChanges(outcome.stageSync, actorId)

		void BusinessWebhookDispatchService.dispatch({
			event: 'order.add_to_cart',
			appId: resolvedAppId,
			payload: {
				order_id: outcome.orderId,
				conversation_id: input.conversation_id,
				items: normalizedItems,
			},
		})
		await this.refreshDecisionFromCommerceEvent({
			appId: resolvedAppId,
			conversationId: input.conversation_id,
			event: 'order.add_to_cart',
		})

		const detail = await findOrderWithItemsAndInvoices(
			outcome.orderId,
			resolvedAppId,
		)
		if (!detail) throw new Error('Failed to load cart order')

		return {
			order: mapOrderWithDetails(detail),
		}
	}

	static async checkoutOrder(
		appId: string,
		orderId: string,
		input: CheckoutInput,
		actorId?: string | null,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(orderId)) {
			throw new Error('Invalid order ID')
		}
		const pakasirConfig = await this.resolvePakasirConfig(resolvedAppId)

		const expiresInMinutes = Math.max(
			5,
			Math.min(24 * 60, Math.floor(toNumber(input.expires_in_minutes || 120))),
		)
		const paymentSelection = resolvePaymentMethod(input.payment_method)
		if (paymentSelection.provider !== DEFAULT_PAYMENT_PROVIDER) {
			throw new Error(
				`Unsupported payment provider "${paymentSelection.provider}". This commerce flow is currently configured for Pakasir.`,
			)
		}
		const paymentMethod = isPaymentMethodInCatalog(
			paymentSelection.key,
			pakasirConfig.payment_methods,
		)
			? paymentSelection.key
			: paymentSelection.method
		if (
			!isPaymentMethodInCatalog(paymentMethod, pakasirConfig.payment_methods)
		) {
			throw new Error(
				'Selected payment method is not enabled in Pakasir settings',
			)
		}

		const result = await prisma.$transaction(async (tx) => {
			const order = await tx.orders.findFirst({
				where: {
					id: orderId,
					app_id: resolvedAppId,
				},
			})
			if (!order) throw new Error('Order not found')
			if (!isCancelableJourney(order.journey_phase)) {
				throw new Error('Order cannot be checked out in its current phase')
			}

			const orderItems = await tx.order_items.findMany({
				where: { order_id: order.id },
				orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
			})
			if (orderItems.length === 0) {
				throw new Error('Cannot checkout an empty cart')
			}

			await this.releaseActiveReservations(tx, {
				appId: resolvedAppId,
				orderId: order.id,
				reason: 'checkout-refresh',
			})

			await this.reserveStockForOrder(tx, {
				appId: resolvedAppId,
				orderId: order.id,
				orderItems,
				expiresInMinutes,
			})

			await this.recalculateOrderTotals(tx, order.id)

			const updatedOrder = await tx.orders.update({
				where: { id: order.id },
				data: {
					journey_phase: 'checkout',
					order_status: 'pending',
					checkout_at: new Date(),
					payment_provider: paymentSelection.provider,
					payment_method: paymentMethod,
					updated_at: new Date(),
				},
			})

			const latestInvoice = await tx.order_invoices.findFirst({
				where: { order_id: order.id },
				orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
			})

			const invoiceToken = latestInvoice?.public_token || buildPublicToken()
			if (
				latestInvoice &&
				!isPaidStatus(latestInvoice.status) &&
				normalizeInvoiceStatus(latestInvoice.status) !== 'CANCELLED'
			) {
				await tx.order_invoices.update({
					where: { id: latestInvoice.id },
					data: {
						status: 'NOT_PAID',
						provider: paymentSelection.provider,
						payment_method: paymentMethod,
						amount: updatedOrder.grand_total || 0,
						public_token: invoiceToken,
						public_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
						expiry_date: new Date(Date.now() + expiresInMinutes * 60 * 1000),
					},
				})
			} else {
				await tx.order_invoices.create({
					data: {
						order_id: order.id,
						amount: updatedOrder.grand_total || 0,
						status: 'NOT_PAID',
						provider: paymentSelection.provider,
						payment_method: paymentMethod,
						public_token: invoiceToken,
						public_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
						expiry_date: new Date(Date.now() + expiresInMinutes * 60 * 1000),
						provider_payload: toJsonInput({
							phase: 'checkout',
							expires_in_minutes: expiresInMinutes,
							payment_provider: paymentSelection.provider,
						}),
					},
				})
			}

			const stageSync = updatedOrder.conversation_id
				? await this.ensureJourneyStage(tx, {
						conversationId: updatedOrder.conversation_id,
						appId: resolvedAppId,
						journeyPhase: 'checkout',
						actorId,
					})
				: null

			await this.logConversationAction(tx, {
				conversationId: updatedOrder.conversation_id,
				action: 'order.checkout',
				actorId,
				targetId: updatedOrder.id,
				metadata: {
					payment_provider: paymentSelection.provider,
					payment_method: paymentMethod,
					expires_in_minutes: expiresInMinutes,
				},
			})

			return {
				orderId: updatedOrder.id,
				conversationId: updatedOrder.conversation_id,
				stageSync,
			}
		})

		await this.dispatchStageChanges(result.stageSync, actorId)

		void BusinessWebhookDispatchService.dispatch({
			event: 'order.checkout',
			appId: resolvedAppId,
			payload: {
				order_id: result.orderId,
				payment_provider: paymentSelection.provider,
				payment_method: paymentMethod,
			},
		})
		await this.refreshDecisionFromCommerceEvent({
			appId: resolvedAppId,
			conversationId: result.conversationId,
			event: 'order.checkout',
		})

		const detail = await findOrderWithItemsAndInvoices(
			result.orderId,
			resolvedAppId,
		)
		if (!detail) throw new Error('Failed to load checkout order')

		return {
			order: mapOrderWithDetails(detail),
			payment_methods: pakasirConfig.payment_methods,
		}
	}

	static async sendPaymentLink(
		appId: string,
		orderId: string,
		input: SendPaymentLinkInput,
		actorId?: string | null,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(orderId)) throw new Error('Invalid order ID')
		const pakasirConfig = await this.resolvePakasirConfig(resolvedAppId)

		if (!PakasirClient.isConfigured(toPakasirClientConfig(pakasirConfig))) {
			throw new Error(
				'Pakasir integration is not configured. Please set API key in Pakasir settings.',
			)
		}
		if (!nonEmptyString(pakasirConfig.project_slug)) {
			throw new Error(
				'Pakasir project slug is not configured. Please set project_slug/project in Pakasir settings before sending payment links.',
			)
		}

		const existing = await findOrderWithItemsAndInvoices(orderId, resolvedAppId)
		if (!existing) throw new Error('Order not found')

		const order = existing.order
		if (!isCancelableJourney(order.journey_phase)) {
			throw new Error('Order cannot send payment link in its current phase')
		}

		const invoice =
			existing.invoices.find((item) => !isPaidStatus(item.status)) ||
			existing.invoices[0]
		if (!invoice) {
			throw new Error('Checkout is required before sending payment link')
		}

		const paymentSelection = resolvePaymentMethod(
			input.payment_method ||
				invoice.payment_method ||
				order.payment_method ||
				'qris',
		)
		if (paymentSelection.provider !== DEFAULT_PAYMENT_PROVIDER) {
			throw new Error(
				`Unsupported payment provider "${paymentSelection.provider}". This commerce flow is currently configured for Pakasir.`,
			)
		}
		const paymentMethod = isPaymentMethodInCatalog(
			paymentSelection.key,
			pakasirConfig.payment_methods,
		)
			? paymentSelection.key
			: paymentSelection.method
		if (
			!isPaymentMethodInCatalog(paymentMethod, pakasirConfig.payment_methods)
		) {
			throw new Error(
				'Selected payment method is not enabled in Pakasir settings',
			)
		}

		const conversation = order.conversation_id
			? await prisma.conversations.findFirst({
					where: {
						id: order.conversation_id,
						app_id: resolvedAppId,
					},
					select: {
						id: true,
						contact_id: true,
						contacts: {
							select: {
								name: true,
								email: true,
								phone_number: true,
							},
						},
					},
				})
			: null

		const amount = toNumber(order.grand_total)
		if (amount <= 0) {
			throw new Error('Order total must be greater than zero before payment')
		}
		const invoicePublicToken = invoice.public_token || buildPublicToken()
		const paymentSuccessRedirectUrl = buildPaymentSuccessRedirectUrl(
			pakasirConfig.redirect_url,
			{
				token: invoicePublicToken,
				orderId: order.id,
				invoiceId: invoice.id,
			},
		)

		const transaction = await PakasirClient.createTransaction(
			paymentMethod,
			{
				external_id: order.external_order_id || order.id,
				order_id: order.id,
				amount,
				currency: order.currency || 'IDR',
				description: `Order #${toBigIntNumber(order.order_number) || order.id}`,
				customer_name: conversation?.contacts?.name || undefined,
				customer_email: conversation?.contacts?.email || undefined,
				customer_phone: conversation?.contacts?.phone_number || undefined,
				redirect_url: paymentSuccessRedirectUrl || undefined,
				metadata: {
					order_id: order.id,
					invoice_id: invoice.id,
					conversation_id: order.conversation_id,
					app_id: resolvedAppId,
				},
			},
			toPakasirClientConfig(pakasirConfig),
		)

		const providerInvoiceId =
			transaction.providerInvoiceId || transaction.referenceId || order.id
		const paymentLink =
			transaction.paymentLink ||
			PakasirClient.buildHostedPaymentUrl(
				providerInvoiceId,
				toPakasirClientConfig(pakasirConfig),
				{
					amount,
					orderId: order.id,
					method: paymentMethod,
					redirectUrl: paymentSuccessRedirectUrl,
				},
			) ||
			invoice.payment_link ||
			null

		const updated = await prisma.$transaction(async (tx) => {
			const now = new Date()
			await tx.order_invoices.update({
				where: { id: invoice.id },
				data: {
					status: 'NOT_PAID',
					provider: paymentSelection.provider,
					provider_invoice_id: providerInvoiceId,
					payment_method: paymentSelection.key,
					payment_number: transaction.paymentNumber || invoice.payment_number,
					payment_link: paymentLink,
					checkout_url: paymentLink,
					public_token: invoicePublicToken,
					public_expires_at:
						invoice.public_expires_at ||
						new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
					provider_payload: toJsonInput({
						...(parseJson(invoice.provider_payload) || {}),
						create_response: transaction.raw,
					}),
				},
			})

			const updatedOrder = await tx.orders.update({
				where: { id: order.id },
				data: {
					journey_phase: 'payment_pending',
					order_status: 'pending',
					external_order_id: providerInvoiceId,
					payment_provider: paymentSelection.provider,
					payment_method: paymentSelection.key,
					updated_at: now,
				},
			})

			const stageSync = updatedOrder.conversation_id
				? await this.ensureJourneyStage(tx, {
						conversationId: updatedOrder.conversation_id,
						appId: resolvedAppId,
						journeyPhase: 'payment_pending',
						actorId,
					})
				: null

			await this.logConversationAction(tx, {
				conversationId: updatedOrder.conversation_id,
				action: 'order.payment_link_sent',
				actorId,
				targetId: updatedOrder.id,
				metadata: {
					invoice_id: invoice.id,
					provider_invoice_id: providerInvoiceId,
					payment_provider: paymentSelection.provider,
					payment_method: paymentSelection.key,
					payment_link: paymentLink,
				},
			})

			return {
				orderId: updatedOrder.id,
				conversationId: updatedOrder.conversation_id,
				stageSync,
			}
		})

		await this.dispatchStageChanges(updated.stageSync, actorId)

		if (updated.conversationId && paymentLink) {
			const templateText = nonEmptyString(input.message_template)
			const message =
				templateText ||
				`Berikut link pembayaran pesanan Anda: ${paymentLink}\nStatus invoice: NOT_PAID`
			await MessageService.sendMessage({
				conversationId: updated.conversationId,
				senderType: 'system',
				senderId: actorId || null,
				content: message,
				contentType: 'text',
				contentAttributes: {
					type: 'payment_link',
					payment_link: paymentLink,
					order_id: updated.orderId,
				},
			})
		}

		void BusinessWebhookDispatchService.dispatch({
			event: 'order.payment_link_sent',
			appId: resolvedAppId,
			payload: {
				order_id: updated.orderId,
				invoice_id: invoice.id,
				provider_invoice_id: providerInvoiceId,
				payment_provider: paymentSelection.provider,
				payment_method: paymentSelection.key,
				payment_link: paymentLink,
			},
		})
		await this.refreshDecisionFromCommerceEvent({
			appId: resolvedAppId,
			conversationId: updated.conversationId,
			event: 'order.payment_link_sent',
		})

		const detail = await findOrderWithItemsAndInvoices(
			updated.orderId,
			resolvedAppId,
		)
		if (!detail) throw new Error('Failed to load payment-link order')

		return {
			order: mapOrderWithDetails(detail),
			payment_link: paymentLink,
			provider_invoice_id: providerInvoiceId,
		}
	}

	static async cancelOrder(
		appId: string,
		orderId: string,
		input: CancelOrderInput,
		actorId?: string | null,
	) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(orderId)) throw new Error('Invalid order ID')
		const pakasirConfig = await this.resolvePakasirConfig(resolvedAppId)

		const orderData = await findOrderWithItemsAndInvoices(
			orderId,
			resolvedAppId,
		)
		if (!orderData) throw new Error('Order not found')

		if (!isCancelableJourney(orderData.order.journey_phase)) {
			throw new Error('Order cannot be cancelled in its current phase')
		}

		const latestInvoice = orderData.invoices[0]
		const providerId =
			nonEmptyString(latestInvoice?.provider_invoice_id) ||
			nonEmptyString(orderData.order.external_order_id)

		if (
			providerId &&
			PakasirClient.isConfigured(toPakasirClientConfig(pakasirConfig))
		) {
			try {
				await PakasirClient.cancelTransaction(
					providerId,
					input.reason,
					toPakasirClientConfig(pakasirConfig),
				)
			} catch (error) {
				console.warn('[commerce] Pakasir cancel transaction failed', error)
			}
		}

		const updated = await prisma.$transaction(async (tx) => {
			await this.releaseActiveReservations(tx, {
				appId: resolvedAppId,
				orderId,
				reason: input.reason || 'cancelled',
			})

			const order = await tx.orders.update({
				where: { id: orderId },
				data: {
					journey_phase: 'cancelled',
					order_status: 'cancelled',
					cancelled_at: new Date(),
					updated_at: new Date(),
				},
			})

			if (latestInvoice && !isPaidStatus(latestInvoice.status)) {
				await tx.order_invoices.update({
					where: { id: latestInvoice.id },
					data: {
						status: 'CANCELLED',
						provider_payload: toJsonInput({
							...(parseJson(latestInvoice.provider_payload) || {}),
							cancel_reason: input.reason || 'cancelled',
						}),
					},
				})
			}

			await this.logConversationAction(tx, {
				conversationId: order.conversation_id,
				action: 'order.cancelled',
				actorId,
				targetId: order.id,
				metadata: {
					reason: input.reason || null,
					provider_invoice_id: providerId,
				},
			})

			return {
				orderId: order.id,
				conversationId: order.conversation_id,
			}
		})

		void BusinessWebhookDispatchService.dispatch({
			event: 'order.cancelled',
			appId: resolvedAppId,
			payload: {
				order_id: updated.orderId,
				reason: input.reason || null,
				provider_invoice_id: providerId,
			},
		})
		await this.refreshDecisionFromCommerceEvent({
			appId: resolvedAppId,
			conversationId: updated.conversationId,
			event: 'order.cancelled',
		})

		const detail = await findOrderWithItemsAndInvoices(
			updated.orderId,
			resolvedAppId,
		)
		if (!detail) throw new Error('Failed to load cancelled order')

		return {
			order: mapOrderWithDetails(detail),
		}
	}

	private static async refreshDecisionFromCommerceEvent(params: {
		appId: string
		conversationId: string | null | undefined
		event: string
	}) {
		if (!params.conversationId || !isUuid(params.conversationId)) return
		try {
			await DecisionEngineService.evaluateCommerceEvent({
				appId: params.appId,
				conversationId: params.conversationId,
				event: params.event,
			})
		} catch (error) {
			console.error(
				`[CommerceService] Failed refresh decision signal on ${params.event}:`,
				error,
			)
		}
	}

	static async getConversationSummary(appId: string, conversationId: string) {
		const resolvedAppId = this.ensureValidAppId(appId)
		if (!isUuid(conversationId)) {
			throw new Error('Invalid conversation ID')
		}

		const [summary, pakasirConfig] = await Promise.all([
			this.buildSummaryData(resolvedAppId, conversationId),
			this.resolvePakasirConfig(resolvedAppId),
		])
		if (!summary.conversation) {
			throw new Error('Conversation not found')
		}

		return {
			conversation: {
				id: summary.conversation.id,
				contact_id: summary.conversation.contact_id,
				pipeline_id: summary.conversation.pipeline_id,
				stage_id: summary.conversation.stage_id,
			},
			customer: summary.customer
				? {
						id: summary.customer.id,
						name: summary.customer.name,
						email: summary.customer.email,
						phone_number: summary.customer.phone_number,
						avatar_url: summary.customer.avatar_url,
						is_vip: summary.vip_stats.is_vip,
						repeat_orders: summary.vip_stats.paid_orders,
						lifetime_value: summary.vip_stats.lifetime,
					}
				: null,
			badges: {
				vip: summary.vip_stats.is_vip,
				repeat_orders: summary.vip_stats.paid_orders,
				lifetime_value: summary.vip_stats.lifetime,
			},
			open_cart: summary.open_order,
			order_history: summary.history,
			tags: summary.tags,
			notes: summary.notes,
			payment_methods: pakasirConfig.payment_methods,
		}
	}

	private static async buildPublicInvoicePayload(
		invoice: NonNullable<
			Awaited<ReturnType<typeof prisma.order_invoices.findFirst>>
		>,
	) {
		const order = await prisma.orders.findUnique({
			where: { id: invoice.order_id },
			select: {
				id: true,
				app_id: true,
				order_number: true,
				order_status: true,
				journey_phase: true,
				currency: true,
				grand_total: true,
				subtotal: true,
				discount: true,
				shipping_fee: true,
				created_at: true,
				paid_at: true,
				contact_id: true,
				conversation_id: true,
			},
		})

		if (!order) return null

		const [items, contact, pakasirConfig] = await Promise.all([
			prisma.order_items.findMany({
				where: { order_id: order.id },
				orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
			}),
			order.contact_id
				? prisma.contacts.findUnique({
						where: { id: order.contact_id },
						select: {
							id: true,
							name: true,
							email: true,
							phone_number: true,
						},
					})
				: Promise.resolve(null),
			order.app_id
				? this.resolvePakasirConfig(order.app_id)
				: Promise.resolve(null),
		])

		const paymentLink =
			invoice.payment_link ||
			invoice.checkout_url ||
			PakasirClient.buildHostedPaymentUrl(
				invoice.provider_invoice_id || invoice.payment_number,
				pakasirConfig ? toPakasirClientConfig(pakasirConfig) : undefined,
				{
					amount: toNumber(invoice.amount) || toNumber(order.grand_total),
					orderId: order.id,
					method: invoice.payment_method,
				},
			)

		return {
			invoice: {
				id: invoice.id,
				status: normalizeInvoiceStatus(invoice.status),
				provider: invoice.provider || 'custom',
				provider_invoice_id: invoice.provider_invoice_id,
				public_token: invoice.public_token,
				payment_method: invoice.payment_method,
				payment_number: invoice.payment_number,
				payment_link: paymentLink,
				checkout_url: invoice.checkout_url,
				amount: toNumber(invoice.amount),
				paid_at: toIso(invoice.paid_at),
				expiry_date: toIso(invoice.expiry_date),
				created_at: toIso(invoice.created_at),
			},
			order: {
				id: order.id,
				order_number: toBigIntNumber(order.order_number),
				status: order.order_status,
				journey_phase: order.journey_phase,
				currency: order.currency || 'IDR',
				subtotal: toNumber(order.subtotal),
				discount: toNumber(order.discount),
				shipping_fee: toNumber(order.shipping_fee),
				grand_total: toNumber(order.grand_total),
				created_at: toIso(order.created_at),
				paid_at: toIso(order.paid_at),
				items: items.map((item) => ({
					id: item.id,
					product_name: item.product_name || 'Product',
					variant_name: item.variant_name,
					quantity: Number(item.quantity || 0),
					unit_price: toNumber(item.unit_price || item.price),
					line_total: toNumber(item.line_total),
				})),
			},
			customer: contact
				? {
						id: contact.id,
						name: contact.name,
						email: contact.email,
						phone_number: contact.phone_number,
					}
				: null,
		}
	}

	static async getPublicInvoiceByToken(token: string) {
		const normalizedToken = String(token || '').trim()
		if (!normalizedToken) {
			throw new Error('Invoice token is required')
		}

		const invoice = await prisma.order_invoices.findFirst({
			where: {
				public_token: normalizedToken,
			},
			orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
		})
		if (!invoice) return null

		if (invoice.public_expires_at && invoice.public_expires_at < new Date()) {
			return null
		}

		return this.buildPublicInvoicePayload(invoice)
	}

	static async getPublicPaymentSuccessDetail(input: {
		token?: string | null
		order_id?: string | null
		orderId?: string | null
		invoice_id?: string | null
		invoiceId?: string | null
		provider_invoice_id?: string | null
		providerInvoiceId?: string | null
	}) {
		const token = nonEmptyString(input.token)
		if (token) {
			return this.getPublicInvoiceByToken(token)
		}

		const orderId = nonEmptyString(input.order_id || input.orderId)
		const invoiceId = nonEmptyString(input.invoice_id || input.invoiceId)
		const providerInvoiceId = nonEmptyString(
			input.provider_invoice_id || input.providerInvoiceId,
		)

		const orClauses: Prisma.order_invoicesWhereInput[] = []
		if (invoiceId && isUuid(invoiceId)) {
			orClauses.push({ id: invoiceId })
		}
		if (orderId && isUuid(orderId)) {
			orClauses.push({ order_id: orderId })
		}
		if (providerInvoiceId) {
			orClauses.push({ provider_invoice_id: providerInvoiceId })
		}

		if (orClauses.length === 0) {
			throw new Error('Payment success reference is required')
		}

		const invoice = await prisma.order_invoices.findFirst({
			where: { OR: orClauses },
			orderBy: [
				{ paid_at: 'desc' },
				{ created_at: 'desc' },
				{ id: 'desc' },
			],
		})
		if (!invoice) return null

		if (
			!isPaidStatus(invoice.status) &&
			invoice.public_expires_at &&
			invoice.public_expires_at < new Date()
		) {
			return null
		}

		return this.buildPublicInvoicePayload(invoice)
	}

	static async handlePakasirWebhook(args: {
		payload: Record<string, unknown>
		headers?: Record<string, unknown>
	}) {
		const payload = args.payload || {}
		const externalId = this.buildWebhookExternalId(payload)
		const referenceCandidates = this.extractWebhookReferenceCandidates(payload)
		const eventType = String(
			payload.event || payload.type || 'transaction.update',
		)
		const statusCandidate = normalizeInvoiceStatus(
			payload.status || parseJson(payload.data).status,
		)

		const existingEvent = await prisma.webhook_events.findFirst({
			where: {
				source: 'pakasir',
				external_id: externalId,
			},
			orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
		})

		if (existingEvent?.status === 'processed') {
			if (statusCandidate === 'PAID') {
				await this.sendPakasirPaymentSuccessNotificationFromReferences({
					referenceCandidates,
					appId: existingEvent.app_id,
				}).catch((error) => {
					console.error(
						'[CommerceService] Failed ensuring paid notification for idempotent Pakasir webhook (fail-open):',
						error,
					)
				})
			}
			return {
				success: true,
				idempotent: true,
				event_id: existingEvent.id,
			}
		}

		const webhookEvent = existingEvent
			? await prisma.webhook_events.update({
					where: { id: existingEvent.id },
					data: {
						event_type: eventType,
						raw_payload: toJsonInput(payload),
						headers: toJsonInput(args.headers || {}),
						status: 'processing',
						error_message: null,
						retry_count: (existingEvent.retry_count || 0) + 1,
						updated_at: new Date(),
					},
				})
			: await prisma.webhook_events.create({
					data: {
						source: 'pakasir',
						event_type: eventType,
						raw_payload: toJsonInput(payload),
						headers: toJsonInput(args.headers || {}),
						status: 'processing',
						external_id: externalId,
						is_duplicate: false,
					},
				})

		if (referenceCandidates.length === 0) {
			await prisma.webhook_events.update({
				where: { id: webhookEvent.id },
				data: {
					status: 'failed',
					error_message: 'No transaction reference found in webhook payload',
					updated_at: new Date(),
				},
			})
			throw new Error('No transaction reference found in webhook payload')
		}

		const uuidReferenceCandidates = referenceCandidates.filter((reference) =>
			isUuid(reference),
		)
		const invoiceLookupClauses: Prisma.order_invoicesWhereInput[] = [
			{ provider_invoice_id: { in: referenceCandidates } },
			{ xendit_invoice_id: { in: referenceCandidates } },
		]
		if (uuidReferenceCandidates.length > 0) {
			invoiceLookupClauses.unshift({ id: { in: uuidReferenceCandidates } })
		}
		const invoice = await prisma.order_invoices.findFirst({
			where: {
				OR: invoiceLookupClauses,
			},
			orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
		})

		let order = invoice?.order_id
			? await prisma.orders.findUnique({
					where: { id: invoice.order_id },
				})
			: null

		if (!order) {
			const orderLookupClauses: Prisma.ordersWhereInput[] = [
				{ external_order_id: { in: referenceCandidates } },
			]
			if (uuidReferenceCandidates.length > 0) {
				orderLookupClauses.unshift({ id: { in: uuidReferenceCandidates } })
			}
			order = await prisma.orders.findFirst({
				where: {
					OR: orderLookupClauses,
				},
				orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
			})
		}

		if (!invoice && order) {
			const fallbackInvoice = await prisma.order_invoices.findFirst({
				where: { order_id: order.id },
				orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
			})
			if (fallbackInvoice) {
				const updatedInvoice = await prisma.order_invoices.update({
					where: { id: fallbackInvoice.id },
					data: {
						provider_invoice_id:
							fallbackInvoice.provider_invoice_id || referenceCandidates[0],
						provider: 'pakasir',
					},
				})
				const reloadedOrder = await prisma.orders.findUnique({
					where: { id: updatedInvoice.order_id },
				})
				if (reloadedOrder) {
					await prisma.webhook_events.update({
						where: { id: webhookEvent.id },
						data: {
							app_id: reloadedOrder.app_id,
							updated_at: new Date(),
						},
					})
				}
				const fallbackPakasirConfig = reloadedOrder?.app_id
					? await this.resolvePakasirConfig(reloadedOrder.app_id)
					: null
				const verified = await PakasirClient.getTransactionDetail(
					updatedInvoice.provider_invoice_id || referenceCandidates[0],
					fallbackPakasirConfig
						? toPakasirClientConfig(fallbackPakasirConfig)
						: undefined,
				)
				const normalizedStatus = normalizeInvoiceStatus(
					verified.status || statusCandidate,
				)
				if (normalizedStatus === 'PAID') {
					if (!reloadedOrder?.app_id) {
						throw new Error('Unable to resolve app context for paid webhook')
					}
					await this.markOrderPaidFromPakasir({
						appId: reloadedOrder.app_id,
						orderId: updatedInvoice.order_id,
						invoiceId: updatedInvoice.id,
						verified,
						rawPayload: payload,
						pakasirConfig: fallbackPakasirConfig || undefined,
					})
				}

				await prisma.webhook_events.update({
					where: { id: webhookEvent.id },
					data: {
						status: 'processed',
						processed_at: new Date(),
						error_message: null,
						updated_at: new Date(),
					},
				})

				return {
					success: true,
					status: normalizedStatus,
					order_id: updatedInvoice.order_id,
				}
			}
		}

		if (!invoice || !order || !order.app_id) {
			await prisma.webhook_events.update({
				where: { id: webhookEvent.id },
				data: {
					status: 'failed',
					error_message: 'Invoice/order not found for webhook reference',
					updated_at: new Date(),
				},
			})
			throw new Error('Invoice/order not found for webhook reference')
		}
		const orderAppId = order.app_id

		const verificationRef =
			invoice.provider_invoice_id ||
			order.external_order_id ||
			referenceCandidates[0]
		const pakasirConfig = await this.resolvePakasirConfig(orderAppId)
		const verified = await PakasirClient.getTransactionDetail(
			verificationRef,
			toPakasirClientConfig(pakasirConfig),
		)
		const normalizedStatus = normalizeInvoiceStatus(
			verified.status || statusCandidate,
		)

		if (normalizedStatus === 'PAID') {
			await this.markOrderPaidFromPakasir({
				appId: orderAppId,
				orderId: order.id,
				invoiceId: invoice.id,
				verified,
				rawPayload: payload,
				pakasirConfig,
			})
		} else if (
			normalizedStatus === 'CANCELLED' ||
			normalizedStatus === 'EXPIRED'
		) {
			await prisma.$transaction(async (tx) => {
				await tx.order_invoices.update({
					where: { id: invoice.id },
					data: {
						status: normalizedStatus,
						verified_at: new Date(),
						provider_payload: toJsonInput({
							...(parseJson(invoice.provider_payload) || {}),
							webhook_payload: payload,
							verification: verified.raw,
						}),
					},
				})

				await this.releaseActiveReservations(tx, {
					appId: orderAppId,
					orderId: order.id,
					reason: normalizedStatus.toLowerCase(),
				})

				await tx.orders.update({
					where: { id: order.id },
					data: {
						journey_phase:
							normalizedStatus === 'EXPIRED' ? 'expired' : 'cancelled',
						order_status:
							normalizedStatus === 'EXPIRED' ? 'expired' : 'cancelled',
						expired_at:
							normalizedStatus === 'EXPIRED' ? new Date() : order.expired_at,
						cancelled_at:
							normalizedStatus === 'CANCELLED'
								? new Date()
								: order.cancelled_at,
						updated_at: new Date(),
					},
				})

				await this.logConversationAction(tx, {
					conversationId: order.conversation_id,
					action:
						normalizedStatus === 'EXPIRED'
							? 'order.payment_expired'
							: 'order.cancelled',
					targetId: order.id,
					metadata: {
						invoice_id: invoice.id,
						provider: 'pakasir',
						provider_invoice_id: invoice.provider_invoice_id,
						status: normalizedStatus,
					},
				})
			})
		}

		await prisma.webhook_events.update({
			where: { id: webhookEvent.id },
			data: {
				status: 'processed',
				processed_at: new Date(),
				error_message: null,
				app_id: order.app_id,
				updated_at: new Date(),
			},
		})

		return {
			success: true,
			status: normalizedStatus,
			order_id: order.id,
			invoice_id: invoice.id,
			event_id: webhookEvent.id,
		}
	}
}
