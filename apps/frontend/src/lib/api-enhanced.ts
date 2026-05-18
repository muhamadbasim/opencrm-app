/**
 * Enhanced Frontend API Client with App Credentials
 * All API calls now require app_id from environment or localStorage
 */

export const API_BASE = import.meta.env.VITE_API_URL
	? `${import.meta.env.VITE_API_URL}/api`
	: 'http://localhost:3010/api'

const FALLBACK_APP_ID = `app_${crypto.randomUUID().replace(/-/g, '')}`

// App credentials - prioritize localStorage over environment
export const getAppId = () => {
	if (typeof localStorage !== 'undefined') {
		return (
			localStorage.getItem('scalechat_app_id') ||
			import.meta.env.VITE_APP_ID ||
			FALLBACK_APP_ID
		)
	}
	return import.meta.env.VITE_APP_ID || FALLBACK_APP_ID
}
export const getAppSecret = () => {
	if (typeof localStorage !== 'undefined') {
		return (
			localStorage.getItem('scalechat_app_secret') ||
			import.meta.env.VITE_APP_SECRET ||
			''
		)
	}
	return import.meta.env.VITE_APP_SECRET || ''
}

// Legacy exports for backward compatibility
export const APP_ID =
	import.meta.env.VITE_APP_ID || FALLBACK_APP_ID
export const APP_SECRET = import.meta.env.VITE_APP_SECRET || ''

function getAuthHeaders(): HeadersInit {
	const token =
		typeof localStorage !== 'undefined'
			? localStorage.getItem('scalechat_token')
			: null
	return {
		'Content-Type': 'application/json',
		...(token && { Authorization: `Bearer ${token}` }),
	}
}

async function apiRequest<T>(
	endpoint: string,
	options?: RequestInit & { _retry?: boolean },
): Promise<T> {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		...options,
		headers: {
			...getAuthHeaders(),
			...options?.headers,
		},
	})

	if (!response.ok) {
		// Handle 401 - Unauthorized (Token expired)
		if (
			response.status === 401 &&
			!options?._retry &&
			!endpoint.includes('/auth/refresh') &&
			!endpoint.includes('/auth/login')
		) {
			const refreshToken =
				typeof localStorage !== 'undefined'
					? localStorage.getItem('scalechat_refresh_token')
					: null

			if (refreshToken) {
				try {
					// Try to refresh token
					const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ refreshToken }),
					})

					if (refreshResponse.ok) {
						const data = await refreshResponse.json()
						// Update tokens
						if (typeof localStorage !== 'undefined') {
							localStorage.setItem('scalechat_token', data.token)
							if (data.refreshToken) {
								localStorage.setItem(
									'scalechat_refresh_token',
									data.refreshToken,
								)
							}
						}

						// Retry original request
						return apiRequest<T>(endpoint, {
							...options,
							_retry: true,
						})
					} else {
						// Refresh failed - Clear auth
						if (typeof localStorage !== 'undefined') {
							localStorage.removeItem('scalechat_token')
							localStorage.removeItem('scalechat_refresh_token')
							localStorage.removeItem('scalechat_user')
						}
						// Optional: Redirect to login or let the app handle the auth error
					}
				} catch (refreshError) {
					// Network error during refresh or confusing state
					console.error('Token refresh failed:', refreshError)
				}
			}
		}

		const error = await response
			.json()
			.catch(() => ({ error: 'Request failed' }))
		throw new Error(error.error || `HTTP ${response.status}`)
	}

	return response.json()
}

// ================== AUTH ==================

export const auth = {
	login: (email: string, password: string) =>
		apiRequest('/auth/login', {
			method: 'POST',
			body: JSON.stringify({
				app_id: getAppId(),
				app_secret: getAppSecret(),
				email,
				password,
			}),
		}),

	register: (name: string, email: string, password: string) =>
		apiRequest('/auth/register', {
			method: 'POST',
			body: JSON.stringify({
				app_id: getAppId(),
				app_secret: getAppSecret(),
				name,
				email,
				password,
			}),
		}),

	me: () => apiRequest('/auth/me'),

	refreshToken: (token: string) =>
		apiRequest('/auth/refresh', {
			method: 'POST',
			body: JSON.stringify({ token }),
		}),
}

// ================== APPS ==================

export const apps = {
	list: () => apiRequest('/apps'),
	create: (
		appName: string,
		description: string,
		allowedOrigins: string[] = [],
	) =>
		apiRequest('/apps', {
			method: 'POST',
			body: JSON.stringify({
				app_name: appName,
				description,
				allowed_origins: allowedOrigins,
			}),
		}),
	regenerateSecret: (appId: string) =>
		apiRequest(`/apps/${appId}/regenerate-secret`, { method: 'POST' }),
}

// ================== CONVERSATIONS ==================

export const conversations = {
	list: (status?: string, assignedAgentId?: string) => {
		const params = new URLSearchParams()
		if (status) params.set('status', status)
		if (assignedAgentId) params.set('assigned_agent_id', assignedAgentId)
		return apiRequest(`/conversations?${params}`)
	},

	get: (id: string) => apiRequest(`/conversations/${id}`),

	messages: (conversationId: string) =>
		apiRequest(`/conversations/${conversationId}/messages`),

	send: (
		conversationId: string,
		content: string,
		contentType: string = 'text',
	) =>
		apiRequest(`/conversations/${conversationId}/messages`, {
			method: 'POST',
			body: JSON.stringify({ content, content_type: contentType }),
		}),

	assign: (conversationId: string, agentId: string) =>
		apiRequest(`/conversations/${conversationId}/assign`, {
			method: 'POST',
			body: JSON.stringify({ agent_id: agentId }),
		}),

	updateStatus: (conversationId: string, status: string) =>
		apiRequest(`/conversations/${conversationId}/status`, {
			method: 'PUT',
			body: JSON.stringify({ status }),
		}),

	// Participants
	participants: {
		list: (conversationId: string) =>
			apiRequest(`/conversations/${conversationId}/participants`),
		add: (conversationId: string, userId: string) =>
			apiRequest(`/conversations/${conversationId}/participants`, {
				method: 'POST',
				body: JSON.stringify({ user_id: userId }),
			}),
		remove: (conversationId: string, userId: string) =>
			apiRequest(`/conversations/${conversationId}/participants/${userId}`, {
				method: 'DELETE',
			}),
	},

	// Tags
	tags: {
		list: (conversationId: string) =>
			apiRequest(`/conversations/${conversationId}/tags`),
		add: (conversationId: string, labelId: string) =>
			apiRequest(`/conversations/${conversationId}/tags`, {
				method: 'POST',
				body: JSON.stringify({ label_id: labelId }),
			}),
		remove: (conversationId: string, labelId: string) =>
			apiRequest(`/conversations/${conversationId}/tags/${labelId}`, {
				method: 'DELETE',
			}),
	},

	// Forms
	forms: {
		get: (conversationId: string) =>
			apiRequest(`/conversations/${conversationId}/form`),
		extract: (conversationId: string, force: boolean = false) =>
			apiRequest(`/conversations/${conversationId}/form/extract`, {
				method: 'POST',
				body: JSON.stringify({ force }),
			}),
	},

	// Sales Pipeline
	sale: {
		get: (conversationId: string) =>
			apiRequest(`/conversations/${conversationId}/sale`),
		create: (conversationId: string, dealValue: number = 0) =>
			apiRequest(`/conversations/${conversationId}/sale`, {
				method: 'POST',
				body: JSON.stringify({ deal_value: dealValue }),
			}),
		move: (conversationId: string, stageId: string, notes?: string) =>
			apiRequest(`/conversations/${conversationId}/sale/move`, {
				method: 'POST',
				body: JSON.stringify({ stage_id: stageId, notes }),
			}),
		updateValue: (conversationId: string, dealValue: number) =>
			apiRequest(`/conversations/${conversationId}/sale/value`, {
				method: 'PUT',
				body: JSON.stringify({ deal_value: dealValue }),
			}),
	},
}

// ================== CONTACTS ==================

export const contacts = {
	list: (page: number = 1, limit: number = 50) =>
		apiRequest(`/contacts?page=${page}&limit=${limit}`),

	get: (id: string) => apiRequest(`/contacts/${id}`),

	create: (data: any) =>
		apiRequest('/contacts', {
			method: 'POST',
			body: JSON.stringify(data),
		}),

	update: (id: string, data: any) =>
		apiRequest(`/contacts/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		}),

	updateProperties: (contactId: string, properties: any) =>
		apiRequest(`/contacts/${contactId}/properties`, {
			method: 'PUT',
			body: JSON.stringify({ properties }),
		}),

	merge: (
		targetId: string,
		sourceId: string,
		strategy: string = 'fill_missing',
	) =>
		apiRequest(`/contacts/${targetId}/merge`, {
			method: 'POST',
			body: JSON.stringify({
				source_contact_id: sourceId,
				merge_strategy: strategy,
			}),
		}),

	findDuplicates: () =>
		apiRequest('/contacts/find-duplicates', { method: 'POST' }),

	// Contact Notes
	notes: {
		list: (contactId: string) => apiRequest(`/contacts/${contactId}/notes`),
		create: (contactId: string, content: string) =>
			apiRequest(`/contacts/${contactId}/notes`, {
				method: 'POST',
				body: JSON.stringify({ content }),
			}),
		update: (noteId: string, content: string) =>
			apiRequest(`/contact-notes/${noteId}`, {
				method: 'PUT',
				body: JSON.stringify({ content }),
			}),
		delete: (noteId: string) =>
			apiRequest(`/contact-notes/${noteId}`, { method: 'DELETE' }),
	},
}

// ================== TEAM MANAGEMENT ==================

export const team = {
	agents: {
		list: (role?: string, divisionId?: string) => {
			const params = new URLSearchParams()
			if (role) params.set('role', role)
			if (divisionId) params.set('division_id', divisionId)
			return apiRequest(`/agents?${params}`)
		},
		updateProfile: (agentId: string, data: any) =>
			apiRequest(`/agents/${agentId}/profile`, {
				method: 'PUT',
				body: JSON.stringify(data),
			}),
		channels: {
			list: (agentId: string) => apiRequest(`/agents/${agentId}/channels`),
			assign: (
				agentId: string,
				inboxIds: string[],
				assignAll: boolean = false,
			) =>
				apiRequest(`/agents/${agentId}/channels`, {
					method: 'POST',
					body: JSON.stringify({ inbox_ids: inboxIds, assign_all: assignAll }),
				}),
			unassign: (agentId: string, inboxId: string) =>
				apiRequest(`/agents/${agentId}/channels/${inboxId}`, {
					method: 'DELETE',
				}),
		},
	},

	supervisors: {
		list: () => apiRequest('/supervisors'),
	},

	divisions: {
		list: () => apiRequest('/divisions'),
		create: (name: string, description: string, parentId?: string) =>
			apiRequest('/divisions', {
				method: 'POST',
				body: JSON.stringify({
					name,
					description,
					parent_division_id: parentId,
				}),
			}),
	},
}

// ================== CONTACT PROPERTIES ==================

export const contactProperties = {
	list: () => apiRequest('/contact-properties'),
	create: (data: any) =>
		apiRequest('/contact-properties', {
			method: 'POST',
			body: JSON.stringify(data),
		}),
	update: (id: string, data: any) =>
		apiRequest(`/contact-properties/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		}),
}

// ================== QUICK REPLIES ==================

export const quickReplies = {
	list: (category?: string) => {
		const params = category ? `?category=${category}` : ''
		return apiRequest(`/quick-replies${params}`)
	},
	create: (data: any) =>
		apiRequest('/quick-replies', {
			method: 'POST',
			body: JSON.stringify(data),
		}),
	update: (id: string, data: any) =>
		apiRequest(`/quick-replies/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		}),
	delete: (id: string) =>
		apiRequest(`/quick-replies/${id}`, { method: 'DELETE' }),
}

// ================== PIPELINES ==================

export const pipelines = {
	list: () => apiRequest('/pipelines'),
	get: (id: string) => apiRequest(`/pipelines/${id}`),
	stats: (id: string) => apiRequest(`/pipelines/${id}/stats`),
	kanban: (id: string) => apiRequest(`/pipelines/${id}/kanban`),
}

// ================== FORMS ==================

export const forms = {
	list: () => apiRequest('/forms'),
	get: (id: string) => apiRequest(`/forms/${id}`),
}

// ================== INBOXES ==================

export const inboxes = {
	list: () => apiRequest('/inboxes'),
	get: (id: string) => apiRequest(`/inboxes/${id}`),

	agents: (inboxId: string) => apiRequest(`/inboxes/${inboxId}/agents`),

	officeHours: {
		get: (inboxId: string) => apiRequest(`/inboxes/${inboxId}/office-hours`),
		update: (
			inboxId: string,
			schedule: any[],
			timezone: string = 'Asia/Jakarta',
		) =>
			apiRequest(`/inboxes/${inboxId}/office-hours`, {
				method: 'PUT',
				body: JSON.stringify({ schedule, timezone }),
			}),
		toggle: (inboxId: string, dayOfWeek: number, isActive: boolean) =>
			apiRequest(`/inboxes/${inboxId}/office-hours/toggle`, {
				method: 'POST',
				body: JSON.stringify({ day_of_week: dayOfWeek, is_active: isActive }),
			}),
	},

	autoResponders: {
		list: (inboxId: string) =>
			apiRequest(`/inboxes/${inboxId}/auto-responders`),
		create: (inboxId: string, data: any) =>
			apiRequest(`/inboxes/${inboxId}/auto-responders`, {
				method: 'POST',
				body: JSON.stringify(data),
			}),
	},
}

// ================== AUTO RESPONDERS ==================

export const autoResponders = {
	update: (id: string, data: any) =>
		apiRequest(`/auto-responders/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		}),
	delete: (id: string) =>
		apiRequest(`/auto-responders/${id}`, { method: 'DELETE' }),
	toggle: (id: string, isActive: boolean) =>
		apiRequest(`/auto-responders/${id}/toggle`, {
			method: 'POST',
			body: JSON.stringify({ is_active: isActive }),
		}),
	stats: (days: number = 7) =>
		apiRequest(`/auto-responders/stats?days=${days}`),
}

// ================== LABELS ==================

export const labels = {
	list: () => apiRequest('/labels'),
	create: (title: string, color: string, description?: string) =>
		apiRequest('/labels', {
			method: 'POST',
			body: JSON.stringify({ title, color, description }),
		}),
	update: (id: string, data: any) =>
		apiRequest(`/labels/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		}),
	delete: (id: string) => apiRequest(`/labels/${id}`, { method: 'DELETE' }),
}

// Export everything as default
export default {
	auth,
	apps,
	conversations,
	contacts,
	team,
	contactProperties,
	quickReplies,
	pipelines,
	forms,
	inboxes,
	autoResponders,
	labels,
}
