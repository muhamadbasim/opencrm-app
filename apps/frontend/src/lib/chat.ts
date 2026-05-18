import type { MessageProps } from '@/components/MessageItem'

export type ChatStatus = 'ai' | 'human' | 'handover' | 'done'
export type WhatsAppProviderFilter = 'all' | 'official' | 'baileys'
export type UiWhatsAppProvider = 'official' | 'baileys' | null
export type MessageSource = 'api' | 'local'
export type MessageFrom = 'customer' | 'ai'
export type MessageKind = 'text' | 'image'

export type UiAiAnalytics = {
  confidence: number | null
  intent: string | null
  workflowId: string | null
  workflowName: string | null
  ragLabel: string | null
  ragIntent: string | null
  updatedAt: string | null
  source: MessageSource
}

export type UiConversation = {
  id: string
  backendId: string | null
  inboxId: string | null
  provider: UiWhatsAppProvider
  name: string
  phone: string
  preview: string
  time: string
  unread: number
  status: ChatStatus
  handler: string
  intent: string
  online: boolean
  pinned?: boolean
  aiAnalytics?: UiAiAnalytics | null
  source: MessageSource
}

export type UiMessage = {
  id: string
  from: MessageFrom
  kind: MessageKind
  contentType: string
  text: string
  createdAt: string
  intent?: string | null
  time: string
  status?: 'sending' | 'failed' | 'read' | 'delivered'
  confidence?: number
  source: MessageSource
  sender?: { username: string; avatar_url?: string }
  reply_to?: { message: string; sender_username: string }
  media?: { url: string; caption?: string; mime_type?: string }
  extras?: Record<string, unknown>
}

export type LocalOutgoingMessage = {
  id: string
  conversationId: string
  message: string
  created_at: string
  status: 'sending' | 'failed'
}

export type ApiConversation = {
  id: string
  inbox_id: string
  meta?: {
    sender?: {
      id?: string
      name: string
      email?: string
      phone_number?: string
      thumbnail?: string
    }
    assignee?: { id?: string; name?: string; email?: string }
  }
  contacts?: { name?: string; email?: string; phone_number?: string }
  status?: 'open' | 'resolved' | 'pending'
  channel_type?: 'whatsapp' | 'instagram' | 'tiktok' | 'web'
  unread_count?: number
  timestamp?: number
  updated_at?: string
  additional_attributes?: Record<string, unknown>
  last_message?: Record<string, unknown>
}

export type ApiMessage = {
  id: string
  content?: string
  message?: string
  message_type: 'incoming' | 'outgoing'
  created_at: string | number
  conversation_id: string
  sender?: { id: string; name?: string; username?: string; email?: string; thumbnail?: string; avatar_url?: string }
  private: boolean
  status?: string
  content_type?: string
  source?: MessageSource
  content_attributes?: Record<string, unknown>
  additional_attributes?: Record<string, unknown>
  reply_to?: { message?: string; content?: string; sender_username?: string; sender?: { name?: string; username?: string } }
  media?: { url?: string; caption?: string; mime_type?: string; fileName?: string; filename?: string }
  attachments?: Array<Record<string, unknown>>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

export function formatRelativeChatTime(value?: string | number): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function normalizeWhatsappProviderFilter(value: unknown): WhatsAppProviderFilter {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'official') return 'official'
  if (normalized === 'baileys') return 'baileys'
  return 'all'
}

export function normalizeUiWhatsappProvider(value: unknown): UiWhatsAppProvider {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'baileys') return 'baileys'
  if (normalized === 'official' || normalized === 'whatsapp_cloud') return 'official'
  return null
}

export function matchesWhatsappProviderSelection(
  provider: UiWhatsAppProvider,
  selectedProvider: WhatsAppProviderFilter,
) {
  if (selectedProvider === 'all') return true
  return provider === selectedProvider
}

export function inferIntentKeyFromText(text: string): string {
  const normalized = text.toLowerCase()
  if (!normalized.trim()) return 'general'
  if (
    normalized.includes('halo') ||
    normalized.includes('hai') ||
    normalized.includes('pagi') ||
    normalized.includes('siang') ||
    normalized.includes('malam')
  ) return 'greeting'
  if (
    normalized.includes('stok') ||
    normalized.includes('ready') ||
    normalized.includes('tersedia')
  ) return 'stock'
  if (
    normalized.includes('harga') ||
    normalized.includes('diskon') ||
    normalized.includes('promo')
  ) return 'price'
  if (
    normalized.includes('ongkir') ||
    normalized.includes('kirim') ||
    normalized.includes('pengiriman')
  ) return 'shipping'
  if (
    normalized.includes('bayar') ||
    normalized.includes('transfer') ||
    normalized.includes('pembayaran')
  ) return 'payment'
  if (
    normalized.includes('komplain') ||
    normalized.includes('rusak') ||
    normalized.includes('refund')
  ) return 'complaint'
  if (
    normalized.includes('cs') ||
    normalized.includes('admin') ||
    normalized.includes('sales')
  ) return 'handover'
  if (
    normalized.includes('produk') ||
    normalized.includes('varian') ||
    normalized.includes('ukuran') ||
    normalized.includes('warna')
  ) return 'product'
  return 'general'
}

export function resolveUiStatus(raw: ApiConversation): ChatStatus {
  const status = String(raw.status || '').toLowerCase()
  if (status === 'resolved') return 'done'
  if (status === 'pending') return 'handover'
  if (raw.meta?.assignee?.id || raw.meta?.assignee?.name) return 'human'
  return 'ai'
}

export function normalizeConversation(raw: ApiConversation): ApiConversation | null {
  if (!raw || !raw.id) return null
  const senderName = raw.meta?.sender?.name || raw.contacts?.name || 'Pelanggan'
  return {
    ...raw,
    id: String(raw.id),
    inbox_id: String(raw.inbox_id || ''),
    meta: {
      sender: {
        id: raw.meta?.sender?.id,
        name: senderName,
        email: raw.meta?.sender?.email || raw.contacts?.email,
        phone_number: raw.meta?.sender?.phone_number || raw.contacts?.phone_number,
        thumbnail: raw.meta?.sender?.thumbnail,
      },
      assignee: raw.meta?.assignee,
    },
    status: raw.status || 'open',
    channel_type: raw.channel_type || 'whatsapp',
    unread_count: Number(raw.unread_count || 0),
    timestamp: raw.timestamp || new Date(raw.updated_at || Date.now()).getTime(),
    updated_at: raw.updated_at,
  }
}

export function toUiConversation(raw: ApiConversation): UiConversation | null {
  const normalized = normalizeConversation(raw)
  if (!normalized) return null
  const lastMessageText =
    toText(normalized.last_message?.content) ||
    toText(normalized.last_message?.message) ||
    'Belum ada pesan'
  const intent = inferIntentKeyFromText(lastMessageText)
  return {
    id: normalized.id,
    backendId: normalized.id,
    inboxId: normalized.inbox_id || null,
    provider: normalizeUiWhatsappProvider(
      normalized.additional_attributes?.provider || normalized.channel_type,
    ),
    name: normalized.meta?.sender?.name || 'Pelanggan',
    phone: normalized.meta?.sender?.phone_number || normalized.meta?.sender?.email || '-',
    preview: lastMessageText,
    time: formatRelativeChatTime(normalized.updated_at || normalized.timestamp),
    unread: Number(normalized.unread_count || 0),
    status: resolveUiStatus(normalized),
    handler: normalized.meta?.assignee?.name || 'AI Assistant',
    intent,
    online: normalized.status === 'open',
    pinned: false,
    aiAnalytics: {
      confidence: null,
      intent,
      workflowId: null,
      workflowName: null,
      ragLabel: null,
      ragIntent: null,
      updatedAt: normalized.updated_at || null,
      source: 'api',
    },
    source: 'api',
  }
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) return value
  }
  return null
}

function firstRecordFromArray(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null
  return value.find(isRecord) || null
}

function normalizeContentType(item: any, extras: Record<string, unknown>, media: { mime_type?: string } | null): string {
  const explicit = toText(item?.content_type || item?.contentType || extras.content_type || extras.type).toLowerCase()
  if (explicit) return explicit
  const mime = toText(media?.mime_type || extras.mime_type || extras.mimetype).toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime) return 'document'
  if (extras.interactive) return 'interactive'
  if (extras.template) return 'template'
  if (extras.latitude || extras.longitude) return 'location'
  return 'text'
}

function normalizeMessageMedia(item: any, extras: Record<string, unknown>): { url: string; caption?: string; mime_type?: string } | undefined {
  const attachment = firstRecordFromArray(item?.attachments)
  const media = firstRecord(item?.media, extras.media, attachment)
  const url = toText(media?.url || media?.download_url || media?.file_url || extras.url || item?.media_url || item?.url)
  if (!url) return undefined
  const caption = toText(media?.caption || media?.fileName || media?.filename || extras.caption)
  const mimeType = toText(media?.mime_type || media?.mimeType || media?.content_type || extras.mime_type)
  return {
    url,
    caption: caption || undefined,
    mime_type: mimeType || undefined,
  }
}

function normalizeReplyTo(item: any, extras: Record<string, unknown>): MessageProps['reply_to'] | undefined {
  const reply = firstRecord(item?.reply_to, item?.in_reply_to, extras.reply_to, extras.in_reply_to, extras.context)
  if (!reply) return undefined
  const sender = firstRecord(reply.sender)
  const message = toText(reply.message || reply.content || reply.text || reply.body)
  if (!message) return undefined
  const senderUsername = toText(reply.sender_username || reply.sender_name || sender?.username || sender?.name) || 'Replied message'
  return {
    message,
    sender_username: senderUsername,
  }
}

function normalizeSender(item: any): MessageProps['sender'] | undefined {
  const sender = firstRecord(item?.sender)
  if (!sender) return undefined
  const username = toText(sender.username || sender.name || sender.email)
  if (!username) return undefined
  return {
    username,
    avatar_url: toText(sender.avatar_url || sender.thumbnail) || undefined,
  }
}

function normalizeMessageExtras(item: any): Record<string, unknown> {
  const contentAttributes = isRecord(item?.content_attributes) ? item.content_attributes : {}
  const additionalAttributes = isRecord(item?.additional_attributes) ? item.additional_attributes : {}
  const attachment = firstRecordFromArray(item?.attachments)
  return {
    ...contentAttributes,
    ...additionalAttributes,
    ...(attachment ? { attachment, media: firstRecord(item?.media, contentAttributes.media, additionalAttributes.media, attachment) || undefined } : {}),
  }
}

export function toMessageProps(item: ApiMessage | any): MessageProps {
  const extras = normalizeMessageExtras(item)
  const media = normalizeMessageMedia(item, extras)
  const contentType = normalizeContentType(item, extras, media || null)
  const message =
    toText(item?.message) ||
    toText(item?.content) ||
    toText(extras.caption) ||
    media?.caption ||
    ''

  return {
    id: toText(item?.id) || `msg-${Date.now()}`,
    message,
    message_type: item?.message_type === 'outgoing' ? 'outgoing' : 'incoming',
    content_type: contentType,
    created_at: toText(item?.created_at) || new Date().toISOString(),
    status: toText(item?.status) || undefined,
    sender: normalizeSender(item),
    reply_to: normalizeReplyTo(item, extras),
    media,
    extras,
  }
}

export function toUiMessage(item: any, index = 0): UiMessage {
  const props = toMessageProps({ ...item, id: toText(item?.id) || `msg-${index}` })
  return {
    id: props.id,
    from: props.message_type === 'outgoing' ? 'ai' : 'customer',
    kind: props.content_type === 'image' ? 'image' : 'text',
    contentType: props.content_type,
    text: props.message,
    createdAt: props.created_at,
    time: formatRelativeChatTime(props.created_at),
    status:
      props.status === 'sending' || props.status === 'failed' || props.status === 'read' || props.status === 'delivered'
        ? props.status
        : undefined,
    intent: inferIntentKeyFromText(props.message),
    confidence: null,
    source: item?.source === 'local' ? 'local' : 'api',
    sender: props.sender,
    reply_to: props.reply_to,
    media: props.media,
    extras: props.extras,
  }
}

export function toUiMessages(rawMessages: any[]): UiMessage[] {
  return rawMessages.map((item, index) => toUiMessage(item, index))
}

export function markUiIncomingMessagesRead(messages: UiMessage[]): UiMessage[] {
  return messages.map((message) => message.from === 'customer'
    ? { ...message, status: 'read' as const }
    : message)
}

export function markApiIncomingMessagesRead(messages: ApiMessage[]): ApiMessage[] {
  return messages.map((message) => message.message_type === 'incoming'
    ? { ...message, status: 'read' }
    : message)
}

export function markConversationReadLocallyInRows(rows: ApiConversation[], conversationId: string | null, readAt = new Date().toISOString()): ApiConversation[] {
  if (!conversationId) return rows
  return rows.map((row) => (
    String(row.id) === String(conversationId)
      ? {
          ...row,
          unread_count: 0,
          additional_attributes: {
            ...(row.additional_attributes || {}),
            read_locally_at: readAt,
          },
        }
      : row
  ))
}

export function dedupeApiMessages(messages: ApiMessage[]): ApiMessage[] {
  const seen = new Set<string>()
  return messages.filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
}

export function sortApiMessages(messages: ApiMessage[]): ApiMessage[] {
  return [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export function dedupeUiMessages(messages: UiMessage[]): UiMessage[] {
  const seen = new Set<string>()
  return messages.filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
}

export function toChatWindowMessages(messages: UiMessage[]): MessageProps[] {
  return messages.map((message) => ({
    id: message.id,
    message: message.text,
    message_type: message.from === 'ai' ? 'outgoing' : 'incoming',
    content_type: message.contentType || message.kind,
    created_at: message.createdAt,
    status: message.status,
    sender: message.sender,
    reply_to: message.reply_to,
    media: message.media,
    extras: message.extras,
  }))
}

export function shouldHideWorkflowTrace(raw: Record<string, unknown>): boolean {
  const senderType = toText(raw.sender_type).toLowerCase()
  const contentAttributes = isRecord(raw.content_attributes) ? raw.content_attributes : {}
  const source = toText(contentAttributes.source).toLowerCase()
  const type = toText(contentAttributes.type).toLowerCase()
  const event = toText(contentAttributes.event).toLowerCase()
  const isTrace = contentAttributes.trace === true || type === 'flow_trace' || event === 'node_entered'
  return isTrace || (senderType === 'system' && source === 'flow_runtime')
}

export function isGroupableContentType(message: MessageProps | null) {
  if (!message) return false
  const contentType = message.content_type || 'text'
  if (message.reply_to) return false
  if (contentType === 'text') return true
  if (contentType === 'interactive' || contentType === 'template') return false
  if (contentType === 'image' || contentType === 'video') {
    return Boolean(message.message?.trim())
  }
  return false
}

export function shouldGroupMessages(previous: MessageProps | null, next: MessageProps | null) {
  if (!previous || !next) return false
  if (previous.message_type !== next.message_type) return false
  if (previous.content_type !== next.content_type) return false
  if (!isGroupableContentType(previous) || !isGroupableContentType(next)) return false
  const gapMs = Math.abs(new Date(next.created_at).getTime() - new Date(previous.created_at).getTime())
  return gapMs <= 5 * 60 * 1000
}
