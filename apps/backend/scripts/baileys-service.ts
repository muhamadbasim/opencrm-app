import { config as loadDotEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import makeWASocket, {
	BufferJSON,
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	initAuthCreds,
	makeCacheableSignalKeyStore,
	type AuthenticationState,
	type WASocket,
} from '@whiskeysockets/baileys'
import { Prisma } from '../src/generated/prisma'
import prisma from '../src/lib/prisma'
import { ensureBaileysSessionStorage } from '../src/modules/whatsapp/baileys-storage'

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
	if (existsSync(envPath)) loadDotEnv({ path: envPath, override: false })
}

type PersistedAuthEnvelope = {
	creds?: unknown
	keys?: Record<string, Record<string, unknown | null>>
}

type RuntimeEntry = {
	channelId: string
	providerChannelKey: string
	phoneNumber: string | null
	socket: WASocket | null
	starting: boolean
	qrRetryCount: number
}

const PORT = Number(process.env.BAILEYS_SERVICE_PORT || 3020)
const INTERNAL_TOKEN = String(process.env.BAILEYS_SERVICE_INTERNAL_TOKEN || '').trim()
const entries = new Map<string, RuntimeEntry>()
const QR_RETRYABLE_DISCONNECT_CODES = new Set<number>([
	DisconnectReason.connectionClosed,
	DisconnectReason.connectionLost,
	DisconnectReason.timedOut,
	405,
	428,
])

const logger = {
	level: process.env.BAILEYS_LOG_LEVEL || 'silent',
	child() { return logger },
	trace(...args: unknown[]) { if (logger.level !== 'silent') console.log('[BaileysService:trace]', ...args) },
	debug(...args: unknown[]) { if (logger.level !== 'silent') console.log('[BaileysService:debug]', ...args) },
	info(...args: unknown[]) { if (logger.level !== 'silent') console.log('[BaileysService:info]', ...args) },
	warn(...args: unknown[]) { console.warn('[BaileysService]', ...args) },
	error(...args: unknown[]) { console.error('[BaileysService]', ...args) },
	fatal(...args: unknown[]) { console.error('[BaileysService]', ...args) },
} as const

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

// Fetch the current WA web version (cached) so the handshake is not rejected
// with "Connection Failure (code 405)" by a stale bundled version — which also
// prevents any QR from being emitted. Falls back to Baileys' bundled default
// when the fetch fails.
let cachedWaVersion: [number, number, number] | null = null
let cachedWaVersionAt = 0
const WA_VERSION_TTL_MS = 6 * 60 * 60 * 1000

async function resolveWaVersion(forceRefresh = false) {
	const now = Date.now()
	if (
		!forceRefresh &&
		cachedWaVersion &&
		now - cachedWaVersionAt < WA_VERSION_TTL_MS
	) {
		return cachedWaVersion
	}
	try {
		const { version, isLatest } = await fetchLatestBaileysVersion()
		cachedWaVersion = version as [number, number, number]
		cachedWaVersionAt = now
		console.log('[BaileysService] Using WA web version', version, { isLatest })
		return cachedWaVersion
	} catch (error) {
		console.warn(
			'[BaileysService] Failed to fetch latest WA version, using bundled default',
			error,
		)
		return cachedWaVersion
	}
}

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	})
}

function serializeBufferJson(value: unknown) {
	return JSON.parse(JSON.stringify(value, BufferJSON.replacer))
}

function deserializeBufferJson<T>(value: unknown): T {
	return JSON.parse(JSON.stringify(value ?? null), BufferJSON.reviver) as T
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const normalized = value.trim()
	return normalized.length ? normalized : null
}

function isUsableAuthEnvelope(value: unknown): value is PersistedAuthEnvelope {
	const record = asRecord(value)
	return Boolean(record.creds && typeof record.creds === 'object')
}

function toIsoString(value: Date | string | null | undefined) {
	if (!value) return null
	return typeof value === 'string' ? value : value.toISOString()
}

function extractDisconnectCode(error: unknown): number | null {
	const record = error as { output?: { statusCode?: unknown }; statusCode?: unknown }
	const outputCode = typeof record?.output?.statusCode === 'number' ? record.output.statusCode : null
	if (outputCode !== null) return outputCode
	return typeof record?.statusCode === 'number' ? record.statusCode : null
}

function buildDisconnectMessage(error: unknown) {
	if (error instanceof Error && error.message) return error.message
	const record = error as { data?: { reason?: unknown }; output?: { payload?: { message?: unknown } } }
	return (
		asString(record?.data?.reason) ||
		asString(record?.output?.payload?.message) ||
		'Baileys connection closed'
	)
}

function snapshotFromSession(channelId: string, session: any) {
	return {
		channelId,
		providerChannelKey: session.provider_channel_key,
		phoneNumber: session.phone_number || null,
		status: session.status || 'pending',
		pairingCode: session.pairing_code || null,
		qrCode: session.qr_code || null,
		lastError: session.last_error || null,
		lastConnectedAt: toIsoString(session.last_connected_at),
		lastSeenAt: toIsoString(session.last_seen_at),
		isConnected: session.status === 'connected',
	}
}

async function getChannel(channelId: string) {
	const channel = await prisma.whatsapp_channels.findFirst({
		where: { id: channelId, provider: 'baileys', deleted_at: null },
		select: {
			id: true,
			app_id: true,
			name: true,
			phone_number: true,
			extended_metadata: true,
		},
	})
	if (!channel?.app_id) throw new Error('Baileys channel not found')
	const metadata = asRecord(channel.extended_metadata)
	const providerChannelKey =
		asString(metadata.provider_channel_key) || asString(metadata.providerChannelKey)
	if (!providerChannelKey) throw new Error('Baileys channel missing provider channel key')
	return { ...channel, providerChannelKey }
}

async function upsertSession(channel: Awaited<ReturnType<typeof getChannel>>) {
	return prisma.baileys_sessions.upsert({
		where: { channel_id: channel.id },
		update: {
			app_id: channel.app_id,
			provider_channel_key: channel.providerChannelKey,
			phone_number: channel.phone_number,
			updated_at: new Date(),
			metadata: { channel_name: channel.name || null },
		},
		create: {
			channel_id: channel.id,
			app_id: channel.app_id,
			provider_channel_key: channel.providerChannelKey,
			phone_number: channel.phone_number,
			status: 'pending',
			metadata: { channel_name: channel.name || null },
		},
	})
}

function buildAuthState(session: Awaited<ReturnType<typeof upsertSession>>) {
	const restored = deserializeBufferJson<PersistedAuthEnvelope>(session.auth_state)
	const base = isUsableAuthEnvelope(restored) ? restored : null
	const persisted: PersistedAuthEnvelope = {
		creds: base?.creds || initAuthCreds(),
		keys: base?.keys && typeof base.keys === 'object' ? base.keys : {},
	}

	const persist = async () => {
		await prisma.baileys_sessions.update({
			where: { id: session.id },
			data: {
				auth_state: serializeBufferJson(persisted) as any,
				updated_at: new Date(),
				last_seen_at: new Date(),
			},
		})
	}

	const state: AuthenticationState = {
		creds: persisted.creds as AuthenticationState['creds'],
		keys: {
			get: async (type, ids) => {
				const category = asRecord((persisted.keys || {})[type])
				const data: Record<string, unknown> = {}
				for (const id of ids) {
					const value = category[id]
					if (value !== null && value !== undefined) data[id] = value
				}
				return data as any
			},
			set: async (data) => {
				for (const category of Object.keys(data || {})) {
					const nextValues = (data as Record<string, Record<string, unknown | null>>)[category]
					const bucket = { ...asRecord((persisted.keys || {})[category]) }
					for (const [id, value] of Object.entries(nextValues || {})) {
						if (value === null) delete bucket[id]
						else bucket[id] = value
					}
					;(persisted.keys ||= {})[category] = bucket
				}
				await persist()
			},
		},
	}

	return { state, saveCreds: persist }
}

async function getSession(channelId: string) {
	await ensureBaileysSessionStorage()
	const session = await prisma.baileys_sessions.findUnique({ where: { channel_id: channelId } })
	if (!session) throw new Error('Baileys session not found')
	return snapshotFromSession(channelId, session)
}

async function startSession(channelId: string, options?: { resetAuth?: boolean }) {
	await ensureBaileysSessionStorage()
	const channel = await getChannel(channelId)
	let entry = entries.get(channelId)
	if (!entry) {
		entry = {
			channelId,
			providerChannelKey: channel.providerChannelKey,
			phoneNumber: channel.phone_number,
			socket: null,
			starting: false,
			qrRetryCount: 0,
		}
		entries.set(channelId, entry)
	}

	entry.providerChannelKey = channel.providerChannelKey
	entry.phoneNumber = channel.phone_number

	if (entry.socket) {
		entry.socket.end(undefined)
		entry.socket = null
	}

	if (options?.resetAuth) {
		entry.qrRetryCount = 0
		await prisma.baileys_sessions.updateMany({
			where: { channel_id: channelId },
			data: {
				status: 'pending',
				auth_state: Prisma.DbNull,
				pairing_code: null,
				qr_code: null,
				last_error: null,
				updated_at: new Date(),
			},
		})
	}

	const session = await upsertSession(channel)
	const auth = buildAuthState(session)
	await prisma.baileys_sessions.update({
		where: { id: session.id },
		data: {
			status: 'connecting',
			pairing_code: null,
			qr_code: null,
			last_error: null,
			updated_at: new Date(),
		},
	})

	entry.starting = true
	const waVersion = await resolveWaVersion()
	const socket = makeWASocket({
		...(waVersion ? { version: waVersion } : {}),
		auth: {
			creds: auth.state.creds,
			keys: makeCacheableSignalKeyStore(auth.state.keys, logger as any),
		},
		logger: logger as any,
		browser: Browsers.macOS('Google Chrome'),
		printQRInTerminal: false,
		markOnlineOnConnect: false,
		getMessage: async () => undefined,
	})
	entry.socket = socket

	socket.ev.on('creds.update', () => {
		void auth.saveCreds().catch((error) => console.error('[BaileysService] Failed saving creds', error))
	})

	socket.ev.on('connection.update', (update) => {
		void (async () => {
			if (update.qr) {
				await prisma.baileys_sessions.update({
					where: { id: session.id },
					data: {
						status: 'qr_ready',
						qr_code: update.qr,
						pairing_code: null,
						last_error: null,
						last_seen_at: new Date(),
						updated_at: new Date(),
					},
				})
			}

			if (update.connection === 'open') {
				await prisma.baileys_sessions.update({
					where: { id: session.id },
					data: {
						status: 'connected',
						qr_code: null,
						pairing_code: null,
						last_error: null,
						last_connected_at: new Date(),
						last_seen_at: new Date(),
						updated_at: new Date(),
					},
				})
				return
			}

			if (update.connection === 'close') {
				entry!.socket = null
				entry!.starting = false
				const code = extractDisconnectCode(update.lastDisconnect?.error)
				const message = code !== null
					? `${buildDisconnectMessage(update.lastDisconnect?.error)} (code ${code})`
					: buildDisconnectMessage(update.lastDisconnect?.error)
				console.warn('[BaileysService] connection closed', { channelId, code, message })
				const retryableBeforeQr =
					!socket.authState.creds.registered &&
					code !== null &&
					QR_RETRYABLE_DISCONNECT_CODES.has(code) &&
					entry!.qrRetryCount < 5
				const shouldKeepQr = code === DisconnectReason.connectionClosed && update.qr
				await prisma.baileys_sessions.update({
					where: { id: session.id },
					data: {
						status: shouldKeepQr
							? 'qr_ready'
							: retryableBeforeQr
								? 'connecting'
								: 'disconnected',
						last_error: shouldKeepQr || retryableBeforeQr ? null : message,
						last_seen_at: new Date(),
						updated_at: new Date(),
					},
				})
				if (retryableBeforeQr) {
					entry!.qrRetryCount += 1
					if (code === 405) {
						await resolveWaVersion(true).catch(() => undefined)
					}
					setTimeout(() => {
						void startSession(channelId).catch((error) => {
							console.error('[BaileysService] retry failed', error)
						})
					}, 500)
				}
			}
		})().catch((error) => console.error('[BaileysService] connection.update failed', error))
	})

	const startedAt = Date.now()
	while (Date.now() - startedAt < 12_000) {
		const snapshot = await getSession(channelId)
		if (!['pending', 'connecting'].includes(snapshot.status)) return snapshot
		await sleep(300)
	}

	return getSession(channelId)
}

function isAuthorized(request: Request) {
	if (!INTERNAL_TOKEN) return true
	return request.headers.get('x-opencrm-internal-token') === INTERNAL_TOKEN
}

await ensureBaileysSessionStorage()

async function handleRequest(request: Request) {
	const url = new URL(request.url)
	try {
		if (url.pathname === '/health') return json({ status: 'healthy', service: 'baileys' })
		if (!isAuthorized(request)) return json({ error: 'Unauthorized' }, 401)

		const sessionMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/)
		if (sessionMatch && request.method === 'GET') {
			return json({ success: true, data: await getSession(sessionMatch[1]) })
		}

		const startMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/start$/)
		if (startMatch && request.method === 'POST') {
			return json({ success: true, data: await startSession(startMatch[1], { resetAuth: true }) })
		}

		if (url.pathname === '/api/v1/send' && request.method === 'POST') {
			return json({ error: 'Baileys send is not implemented in this lightweight service yet' }, 501)
		}

		return json({ error: 'Not found' }, 404)
	} catch (error) {
		console.error('[BaileysService] request failed', error)
		return json({ error: error instanceof Error ? error.message : 'Baileys service error' }, 500)
	}
}

function createRequest(req: import('node:http').IncomingMessage) {
	const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`)
	const headers = new Headers()
	for (const [key, value] of Object.entries(req.headers)) {
		if (Array.isArray(value)) {
			for (const item of value) headers.append(key, item)
		} else if (value !== undefined) {
			headers.set(key, value)
		}
	}

	return new Request(url, { method: req.method, headers })
}

createServer(async (req, res) => {
	const response = await handleRequest(createRequest(req))
	res.statusCode = response.status
	response.headers.forEach((value, key) => res.setHeader(key, value))
	res.end(Buffer.from(await response.arrayBuffer()))
}).listen(PORT, '127.0.0.1')

console.log(`[BaileysService] listening on http://127.0.0.1:${PORT}`)
