import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { MessageCircle, Instagram, Music2, Globe } from 'lucide-react'
import { conversations, ai, routing } from '@/lib/api'
import { formatChatTime } from '@/lib/timezone'
import {
	connectSocket,
	onMessageCreated,
	onAISuggestion,
	joinConversation,
	leaveConversation,
	removeAllListeners,
} from '@/lib/socket'

export const Route = createFileRoute(
	'/_app/conversations/$conversationId',
)({
	component: ConversationView,
})

interface Message {
	id: string
	content?: string
	message?: string
	message_type: 'incoming' | 'outgoing'
	created_at: string | number
	conversation_id: string
	sender?: {
		id: string
		name?: string
		username?: string
		email?: string
		thumbnail?: string
		avatar_url?: string
	}
	private: boolean
	status?: string
	content_type?: string
}

interface Conversation {
	id: string
	status: 'open' | 'resolved' | 'pending'
	channel_type: 'whatsapp' | 'instagram' | 'tiktok' | 'web'
	meta: {
		sender: {
			id: string
			name: string
			email?: string
			phone_number?: string
		}
		assignee?: {
			id: string
			name: string
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toText(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'number') return String(value)
	return ''
}

function shouldHideWorkflowTrace(raw: Record<string, unknown>): boolean {
	const senderType = toText(raw.sender_type).toLowerCase()
	const contentAttributes = isRecord(raw.content_attributes) ? raw.content_attributes : {}
	const source = toText(contentAttributes.source).toLowerCase()
	const type = toText(contentAttributes.type).toLowerCase()
	const event = toText(contentAttributes.event).toLowerCase()
	const isTrace =
		contentAttributes.trace === true || type === 'flow_trace' || event === 'node_entered'
	return isTrace || (senderType === 'system' && source === 'flow_runtime')
}

function ConversationView() {
	const { conversationId } = Route.useParams()
	const navigate = useNavigate()
	const [conversation, setConversation] = useState<Conversation | null>(null)
	const [messages, setMessages] = useState<Message[]>([])
	const [loading, setLoading] = useState(true)
	const [sending, setSending] = useState(false)
	const [newMessage, setNewMessage] = useState('')
	const [aiSuggestion, setAiSuggestion] = useState<string>('')
	const [loadingAI, setLoadingAI] = useState(false)
	const messagesEndRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		loadConversation()
		loadMessages()
	}, [conversationId])

	useEffect(() => {
		connectSocket()
		joinConversation(conversationId)

		onMessageCreated((data) => {
			if (data.conversation.id === conversationId) {
				loadMessages()
			}
		})

		onAISuggestion((data) => {
			if (data.conversationId === conversationId) {
				console.log('[AI] Received suggestion:', data.suggestion)
				setAiSuggestion(data.suggestion)
			}
		})

		return () => {
			leaveConversation(conversationId)
			removeAllListeners()
		}
	}, [conversationId])

	useEffect(() => {
		scrollToBottom()
	}, [messages])

	const loadConversation = async () => {
		try {
			const data: any = await conversations.get(conversationId)
			setConversation(data)
		} catch (error) {
			console.error('Failed to load conversation:', error)
		}
	}

	const loadMessages = async () => {
		try {
			const data: any = await conversations.getMessages(conversationId)
			// Support both old format (payload) and new format (results.messages)
			const rawMessages = data.results?.messages || data.payload || []
			const filtered = Array.isArray(rawMessages)
				? rawMessages.filter(
						(item) => isRecord(item) && !shouldHideWorkflowTrace(item),
					)
				: []
			setMessages(filtered)
		} catch (error) {
			console.error('Failed to load messages:', error)
		} finally {
			setLoading(false)
		}
	}

	const handleSendMessage = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newMessage.trim() || sending) return

		setSending(true)
		try {
			await conversations.sendMessage(conversationId, {
				content: newMessage,
				message_type: 'outgoing',
			})
			setNewMessage('')
			setAiSuggestion('')
			loadMessages()
		} catch (error) {
			console.error('Failed to send message:', error)
			alert('Failed to send message')
		} finally {
			setSending(false)
		}
	}

	const handleGetAISuggestion = async () => {
		setLoadingAI(true)
		try {
			const result: any = await ai.getSuggestion(conversationId)
			setAiSuggestion(result.suggestion || '')
		} catch (error) {
			console.error('Failed to get AI suggestion:', error)
			alert('Failed to get AI suggestion')
		} finally {
			setLoadingAI(false)
		}
	}

	const handleUseAISuggestion = () => {
		setNewMessage(aiSuggestion)
		setAiSuggestion('')
	}

	const handleAutoRoute = async () => {
		try {
			const result: any = await routing.route(conversationId)
			if (result.success) {
				alert(`Routed to agent ${result.assigneeId} (${result.rule})`)
				loadConversation()
			} else {
				alert('No routing rule matched or no agents available')
			}
		} catch (error) {
			console.error('Failed to auto-route:', error)
			alert('Failed to auto-route conversation')
		}
	}

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}

	const getChannelIcon = (type?: string) => {
		switch (type) {
			case 'whatsapp':
				return <MessageCircle size={20} className="text-green-500" />
			case 'instagram':
				return <Instagram size={20} className="text-pink-600" />
			case 'tiktok':
				return <Music2 size={20} className="text-black" />
			default:
				return <Globe size={20} className="text-gray-500" />
		}
	}

	if (loading) {
		return (
			<div
				style={{
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontFamily: 'system-ui',
				}}
			>
				Loading conversation...
			</div>
		)
	}

	return (
		<div
			style={{
				fontFamily: 'system-ui',
				height: '100vh',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			{/* Header */}
			<header
				style={{
					background: 'white',
					borderBottom: '1px solid #e0e0e0',
					padding: '1rem 1.5rem',
					display: 'flex',
					alignItems: 'center',
					gap: '1rem',
				}}
			>
				<button
					onClick={() => navigate({ to: '/chat' })}
					style={{
						padding: '0.5rem 1rem',
						background: '#f5f5f5',
						border: 'none',
						borderRadius: '6px',
						cursor: 'pointer',
						fontWeight: '500',
					}}
				>
					← Back
				</button>
				<div style={{ flex: 1 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
						{getChannelIcon(conversation?.channel_type)}
						<div style={{ fontWeight: '600', fontSize: '1.1rem' }}>
							{conversation?.meta.sender.name || 'Unknown'}
						</div>
					</div>
					<div style={{ fontSize: '0.85rem', color: '#666' }}>
						{conversation?.meta.sender.email ||
							conversation?.meta.sender.phone_number ||
							'No contact info'}
					</div>
				</div>
				<button
					onClick={handleAutoRoute}
					style={{
						padding: '0.5rem 1rem',
						background: '#667eea',
						color: 'white',
						border: 'none',
						borderRadius: '6px',
						fontSize: '0.85rem',
						fontWeight: '600',
						cursor: 'pointer',
					}}
				>
					🎯 Auto-Route
				</button>
				<div
					style={{
						padding: '0.5rem 1rem',
						background:
							conversation?.status === 'open'
								? '#4caf50'
								: conversation?.status === 'pending'
									? '#ff9800'
									: '#9e9e9e',
						color: 'white',
						borderRadius: '6px',
						fontSize: '0.85rem',
						fontWeight: '600',
						textTransform: 'uppercase',
					}}
				>
					{conversation?.status}
				</div>
			</header>

			{/* Messages */}
			<div
				style={{
					flex: 1,
					overflowY: 'auto',
					padding: '1.5rem',
					background: '#f5f5f5',
				}}
			>
				{messages.length === 0 ? (
					<div
						style={{ textAlign: 'center', color: '#666', marginTop: '2rem' }}
					>
						No messages yet
					</div>
				) : (
					<div style={{ maxWidth: '900px', margin: '0 auto' }}>
						{messages.map((msg) => {
							const isOutgoing = msg.message_type === 'outgoing'
							return (
								<div
									key={msg.id}
									style={{
										display: 'flex',
										justifyContent: isOutgoing ? 'flex-end' : 'flex-start',
										marginBottom: '1rem',
									}}
								>
									<div
										style={{
											maxWidth: '70%',
											padding: '0.75rem 1rem',
											background: isOutgoing ? '#667eea' : 'white',
											color: isOutgoing ? 'white' : '#333',
											borderRadius: '12px',
											boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
										}}
									>
										{!isOutgoing && msg.sender && (
											<div
												style={{
													fontSize: '0.75rem',
													fontWeight: '600',
													marginBottom: '0.25rem',
													opacity: 0.8,
												}}
											>
												{msg.sender.username || msg.sender.name}
											</div>
										)}
										<div
											style={{
												whiteSpace: 'pre-wrap',
												wordBreak: 'break-word',
											}}
										>
											{msg.message || msg.content}
										</div>
										<div
											style={{
												fontSize: '0.7rem',
												marginTop: '0.25rem',
												opacity: 0.7,
												textAlign: 'right',
											}}
										>
											{formatChatTime(msg.created_at)}
										</div>
									</div>
								</div>
							)
						})}
						<div ref={messagesEndRef} />
					</div>
				)}
			</div>

			{/* Message Input */}
			<form
				onSubmit={handleSendMessage}
				style={{
					background: 'white',
					borderTop: '1px solid #e0e0e0',
					padding: '1rem 1.5rem',
				}}
			>
				<div
					style={{
						maxWidth: '900px',
						margin: '0 auto',
						display: 'flex',
						gap: '1rem',
					}}
				>
					<button
						type='button'
						onClick={handleGetAISuggestion}
						disabled={loadingAI}
						style={{
							padding: '0.75rem 1rem',
							background: loadingAI ? '#ccc' : '#f5f5f5',
							color: loadingAI ? '#999' : '#667eea',
							border: '2px solid #e0e0e0',
							borderRadius: '8px',
							fontSize: '1rem',
							fontWeight: '600',
							cursor: loadingAI ? 'not-allowed' : 'pointer',
						}}
					>
						{loadingAI ? '...' : '🤖'}
					</button>
					<input
						type='text'
						value={newMessage}
						onChange={(e) => setNewMessage(e.target.value)}
						placeholder="Type your message..."
						disabled={sending}
						style={{
							flex: 1,
							padding: '0.75rem 1rem',
							border: '2px solid #e0e0e0',
							borderRadius: '8px',
							fontSize: '1rem',
							outline: 'none',
						}}
					/>
					<button
						type='submit'
						disabled={sending || !newMessage.trim()}
						style={{
							padding: '0.75rem 2rem',
							background: sending || !newMessage.trim() ? '#ccc' : '#667eea',
							color: 'white',
							border: 'none',
							borderRadius: '8px',
							fontSize: '1rem',
							fontWeight: '600',
							cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
						}}
					>
						{sending ? 'Sending...' : 'Send'}
					</button>
				</div>
			</form>
		</div>
	)
}
