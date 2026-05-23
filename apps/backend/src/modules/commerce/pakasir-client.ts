const REQUIRED_ENV = ['PAKASIR_API_KEY'] as const
const DEFAULT_BASE_URL = 'https://app.pakasir.com/api'

export type PakasirMode = 'live' | 'sandbox'

export type PakasirClientConfig = {
	baseUrl: string
	projectSlug: string | null
	apiKey: string
	redirectUrl: string | null
	mode: PakasirMode
}

export type PakasirClientConfigInput = {
	baseUrl?: string | null
	projectSlug?: string | null
	apiKey?: string | null
	redirectUrl?: string | null
	mode?: PakasirMode | string | null
}

export type PakasirHostedPaymentUrlOptions = {
	amount?: number | string | null
	orderId?: string | null
	method?: string | null
	redirectUrl?: string | null
}

function normalizeUrl(value: string): string {
	return value.trim().replace(/\/+$/, '')
}

function normalizeHostedBaseUrl(value: string): string {
	return normalizeUrl(value).replace(/\/api(?:\/.*)?$/i, '')
}

function normalizeMode(value: unknown): PakasirMode {
	const normalized = String(value || '')
		.trim()
		.toLowerCase()
	if (normalized === 'sandbox') return 'sandbox'
	return 'live'
}

function resolveBaseUrl(value: unknown, mode: PakasirMode): string {
	const explicit = normalizeUrl(String(value || ''))
	if (explicit) return explicit

	if (mode === 'sandbox') {
		const sandboxUrl = normalizeUrl(String(process.env.PAKASIR_SANDBOX_BASE_URL || ''))
		if (sandboxUrl) return sandboxUrl
	}

	const liveUrl = normalizeUrl(String(process.env.PAKASIR_LIVE_BASE_URL || ''))
	if (liveUrl) return liveUrl
	return DEFAULT_BASE_URL
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	return value as Record<string, unknown>
}

function pickNested(input: unknown, keys: string[]): unknown {
	const queue: unknown[] = [input]
	const visited = new Set<unknown>()

	while (queue.length > 0) {
		const current = queue.shift()
		if (!current || typeof current !== 'object' || visited.has(current)) continue
		visited.add(current)

		const record = current as Record<string, unknown>
		for (const key of keys) {
			if (Object.hasOwn(record, key)) {
				const value = record[key]
				if (value !== undefined && value !== null && `${value}`.trim() !== '') {
					return value
				}
			}
		}

		for (const value of Object.values(record)) {
			if (!value) continue
			if (typeof value === 'object') {
				queue.push(value)
			}
		}
	}

	return undefined
}

function toUpperText(value: unknown): string {
	if (typeof value !== 'string') return ''
	return value.trim().toUpperCase()
}

function toStringOrNull(value: unknown): string | null {
	if (value === null || value === undefined) return null
	const text = String(value).trim()
	return text ? text : null
}

function toPositiveIntegerString(value: unknown): string | null {
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value <= 0) return null
		return String(Math.round(value))
	}

	const text = toStringOrNull(value)
	if (!text) return null
	const digits = text.replace(/[^\d]/g, '')
	if (!digits) return null
	const numeric = Number(digits)
	if (!Number.isFinite(numeric) || numeric <= 0) return null
	return String(Math.round(numeric))
}

export type PakasirTransactionNormalized = {
	providerInvoiceId: string | null
	referenceId: string | null
	status: string
	paymentLink: string | null
	paymentNumber: string | null
	method: string | null
	raw: Record<string, unknown>
}

export abstract class PakasirClient {
	private static config: PakasirClientConfig | null = null

	private static getEnvConfig(): PakasirClientConfig {
		if (PakasirClient.config) return PakasirClient.config

		const missing = REQUIRED_ENV.filter((key) => {
			const value = process.env[key]
			return !value || !value.trim()
		})

		if (missing.length > 0) {
			throw new Error(
				`Missing Pakasir environment variables: ${missing.join(', ')}`,
			)
		}

		const mode = normalizeMode(process.env.PAKASIR_MODE)
		PakasirClient.config = {
			mode,
			baseUrl: resolveBaseUrl(process.env.PAKASIR_BASE_URL, mode),
			projectSlug:
				toStringOrNull(process.env.PAKASIR_PROJECT_SLUG) ||
				toStringOrNull(process.env.PAKASIR_PROJECT),
			apiKey: String(process.env.PAKASIR_API_KEY || '').trim(),
			redirectUrl: toStringOrNull(process.env.PAKASIR_REDIRECT_URL),
		}
		return PakasirClient.config
	}

	private static getConfig(
		override?: PakasirClientConfigInput,
		allowMissingApiKey = false,
	): PakasirClientConfig {
		let envConfig: PakasirClientConfig | null = null
		try {
			envConfig = PakasirClient.getEnvConfig()
		} catch {
			envConfig = null
		}

		const mode = normalizeMode(override?.mode || envConfig?.mode || process.env.PAKASIR_MODE)
		const baseUrl =
			normalizeUrl(String(override?.baseUrl || '')) ||
			envConfig?.baseUrl ||
			resolveBaseUrl(process.env.PAKASIR_BASE_URL, mode)
		const projectSlug =
			toStringOrNull(override?.projectSlug) ||
			envConfig?.projectSlug ||
			toStringOrNull(process.env.PAKASIR_PROJECT_SLUG) ||
			toStringOrNull(process.env.PAKASIR_PROJECT)
		const redirectUrl =
			toStringOrNull(override?.redirectUrl) ||
			envConfig?.redirectUrl ||
			toStringOrNull(process.env.PAKASIR_REDIRECT_URL)
		const apiKey =
			toStringOrNull(override?.apiKey) ||
			envConfig?.apiKey ||
			String(process.env.PAKASIR_API_KEY || '').trim()

		if (!allowMissingApiKey && !apiKey) {
			throw new Error('Missing Pakasir API key')
		}

		return {
			mode,
			baseUrl,
			projectSlug,
			apiKey,
			redirectUrl,
		}
	}

	static isConfigured(config?: PakasirClientConfigInput): boolean {
		if (config && toStringOrNull(config.apiKey)) return true
		try {
			const resolved = PakasirClient.getConfig(config, true)
			return Boolean(resolved.apiKey && resolved.apiKey.trim())
		} catch {
			return false
		}
	}

	private static getHeaders(config: PakasirClientConfig) {
		return {
			accept: 'application/json',
			'content-type': 'application/json',
			authorization: `Bearer ${config.apiKey}`,
			'x-api-key': config.apiKey,
			'x-pakasir-mode': config.mode,
		}
	}

	private static async request(
		path: string,
		init: RequestInit,
		configOverride?: PakasirClientConfigInput,
	): Promise<Record<string, unknown>> {
		const config = PakasirClient.getConfig(configOverride)
		const url = `${config.baseUrl}/${path.replace(/^\/+/, '')}`

		const response = await fetch(url, {
			...init,
			headers: {
				...PakasirClient.getHeaders(config),
				...(init.headers || {}),
			},
		})

		const payload = (await response
			.json()
			.catch(() => ({ error: `Invalid JSON response from ${url}` }))) as Record<
			string,
			unknown
		>

		if (!response.ok) {
			const message = toStringOrNull(pickNested(payload, ['message', 'error']))
			throw new Error(
				`Pakasir request failed (${response.status})${message ? `: ${message}` : ''}`,
			)
		}

		return payload
	}

	static normalizeTransaction(input: unknown): PakasirTransactionNormalized {
		const raw = asRecord(input)
		const statusRaw = pickNested(raw, [
			'status',
			'payment_status',
			'transaction_status',
			'state',
		])
		const status = toUpperText(statusRaw)

		const paymentLink =
			toStringOrNull(
				pickNested(raw, [
					'payment_url',
					'payment_link',
					'checkout_url',
					'redirect_url',
					'url',
				]),
			) || null

		const providerInvoiceId =
			toStringOrNull(
				pickNested(raw, [
					'transaction_id',
					'transactionId',
					'invoice_id',
					'provider_invoice_id',
					'id',
				]),
			) || null

		const referenceId =
			toStringOrNull(
				pickNested(raw, [
					'external_id',
					'reference',
					'reference_id',
					'order_id',
					'order_number',
				]),
			) || null

		const paymentNumber =
			toStringOrNull(
				pickNested(raw, [
					'payment_number',
					'virtual_account',
					'va_number',
					'qr_string',
					'qr_content',
				]),
			) || null

		const method =
			toStringOrNull(
				pickNested(raw, [
					'payment_method',
					'method',
					'payment_channel',
					'channel',
				]),
			) || null

		return {
			providerInvoiceId,
			referenceId,
			status,
			paymentLink,
			paymentNumber,
			method,
			raw,
		}
	}

	static async createTransaction(
		method: string,
		payload: Record<string, unknown>,
		configOverride?: PakasirClientConfigInput,
	): Promise<PakasirTransactionNormalized> {
		const config = PakasirClient.getConfig(configOverride)
		const normalizedMethod = String(method || '').trim().toLowerCase() || 'qris'
		const projectSlug =
			toStringOrNull(payload.project_slug || payload.project) || config.projectSlug

		const requestBody: Record<string, unknown> = {
			...payload,
			api_key: payload.api_key || config.apiKey,
			mode: payload.mode || config.mode,
		}
		if (projectSlug) {
			requestBody.project_slug = projectSlug
			requestBody.project = projectSlug
		}
		if (config.redirectUrl && !requestBody.redirect_url && !requestBody.redirectUrl) {
			requestBody.redirect_url = config.redirectUrl
		}

		const response = await PakasirClient.request(
			`transactioncreate/${normalizedMethod}`,
			{
				method: 'POST',
				body: JSON.stringify(requestBody),
			},
			config,
		)

		return PakasirClient.normalizeTransaction(response)
	}

	static async getTransactionDetail(
		referenceId: string,
		configOverride?: PakasirClientConfigInput,
	): Promise<PakasirTransactionNormalized> {
		const normalizedReference = String(referenceId || '').trim()
		if (!normalizedReference) {
			throw new Error('Pakasir reference ID is required for transaction detail')
		}

		const config = PakasirClient.getConfig(configOverride)
		const payload: Record<string, unknown> = {
			api_key: config.apiKey,
			mode: config.mode,
			reference_id: normalizedReference,
			transaction_id: normalizedReference,
			external_id: normalizedReference,
		}
		if (config.projectSlug) {
			payload.project_slug = config.projectSlug
			payload.project = config.projectSlug
		}

		try {
			const response = await PakasirClient.request(
				'transactiondetail',
				{
					method: 'POST',
					body: JSON.stringify(payload),
				},
				config,
			)
			return PakasirClient.normalizeTransaction(response)
		} catch {
			const query = new URLSearchParams({
				mode: config.mode,
				reference_id: normalizedReference,
			})
			if (config.projectSlug) {
				query.set('project_slug', config.projectSlug)
				query.set('project', config.projectSlug)
			}
			const response = await PakasirClient.request(
				`transactiondetail?${query.toString()}`,
				{ method: 'GET' },
				config,
			)
			return PakasirClient.normalizeTransaction(response)
		}
	}

	static async cancelTransaction(
		referenceId: string,
		reason?: string,
		configOverride?: PakasirClientConfigInput,
	): Promise<PakasirTransactionNormalized> {
		const normalizedReference = String(referenceId || '').trim()
		if (!normalizedReference) {
			throw new Error('Pakasir reference ID is required for transaction cancel')
		}

		const config = PakasirClient.getConfig(configOverride)
		const response = await PakasirClient.request(
			'transactioncancel',
			{
				method: 'POST',
				body: JSON.stringify({
					api_key: config.apiKey,
					mode: config.mode,
					reference_id: normalizedReference,
					transaction_id: normalizedReference,
					...(config.projectSlug
						? {
								project_slug: config.projectSlug,
								project: config.projectSlug,
						  }
						: {}),
					...(reason ? { reason } : {}),
				}),
			},
			config,
		)

		return PakasirClient.normalizeTransaction(response)
	}

	static buildHostedPaymentUrl(
		identifier: string | null | undefined,
		configOverride?: PakasirClientConfigInput,
		options: PakasirHostedPaymentUrlOptions = {},
	): string | null {
		const normalized = toStringOrNull(identifier)
		if (normalized && /^https?:\/\//i.test(normalized)) return normalized

		const config = PakasirClient.getConfig(configOverride, true)
		const root = normalizeHostedBaseUrl(config.baseUrl)
		const orderId = toStringOrNull(options.orderId) || normalized
		const amount = toPositiveIntegerString(options.amount)

		if (config.projectSlug && amount && orderId) {
			const query = new URLSearchParams({ order_id: orderId })
			if (String(options.method || '').trim().toLowerCase() === 'qris') {
				query.set('qris_only', '1')
			}
			const redirectUrl = toStringOrNull(options.redirectUrl)
			if (redirectUrl) query.set('redirect', redirectUrl)
			return `${root}/pay/${encodeURIComponent(
				config.projectSlug,
			)}/${encodeURIComponent(amount)}?${query.toString()}`
		}

		return null
	}
}
