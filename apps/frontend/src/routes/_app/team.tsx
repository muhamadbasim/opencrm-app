import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { agentsManagement } from '@/lib/agents-api'
import {
	teams as teamsApi,
	inboxes as inboxesApi,
	type Team,
	type TeamMember,
} from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import DivisionManagement from '@/components/DivisionManagement'
import AgentSettings from '@/components/AgentSettings'
import {
	Search,
	ArrowUp,
	ArrowDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	ChevronsUpDown,
	UserPlus,
	Download,
	EyeOff,
	Copy,
	Check,
	Edit2,
	Trash2,
	Users,
	Mail,
	Phone,
	Activity,
	Settings,
	Settings2,
	Plus,
	X,
	UsersRound,
} from 'lucide-react'
import {
	connectSocket,
	disconnectSocket,
	onAgentPresence,
	removeAllListeners,
} from '@/lib/socket'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export const Route = createFileRoute('/_app/team')({
	component: AgentsManagementPage,
	beforeLoad: () => {
		throw redirect({
			to: '/settings' as any,
			search: { tab: 'teams' },
			replace: true,
		})
	},
})

interface Agent {
	id: string
	name: string
	email: string
	phone_number?: string
	role: 'admin' | 'agent' | 'supervisor'
	active: boolean
	status?: 'online' | 'offline' | 'busy' | 'away'
	divisions: Array<{
		id: string
		name: string
		color: string
	}>
	channels: string[]
	supervisor?: {
		id: string
		name: string
	}
	created_at: string
}

interface Division {
	id: string
	name: string
	description?: string
	color: string
	created_at: string
}

type SortOrder = 'asc' | 'desc'
type AgentsManagementTab =
	| 'agents'
	| 'supervisor'
	| 'divisions'
	| 'teams'
	| 'settings'
type AgentsManagementMode = 'full' | 'settings' | 'roles'

type AgentColumnId =
	| 'name'
	| 'email'
	| 'phone'
	| 'role'
	| 'supervisor'
	| 'status'
	| 'channels'
	| 'divisions'

type TeamColumnId =
	| 'name'
	| 'description'
	| 'members'
	| 'auto_assign'
	| 'created_at'

type TableColumn<TColumnId extends string> = {
	id: TColumnId
	label: string
}

const AGENT_COLUMNS: TableColumn<AgentColumnId>[] = [
	{ id: 'name', label: 'Name' },
	{ id: 'email', label: 'Email' },
	{ id: 'phone', label: 'Phone' },
	{ id: 'role', label: 'Role' },
	{ id: 'supervisor', label: 'Supervisor' },
	{ id: 'status', label: 'Status' },
	{ id: 'channels', label: 'Channels' },
	{ id: 'divisions', label: 'Divisions' },
]

const TEAM_COLUMNS: TableColumn<TeamColumnId>[] = [
	{ id: 'name', label: 'Name' },
	{ id: 'description', label: 'Description' },
	{ id: 'members', label: 'Members' },
	{ id: 'auto_assign', label: 'Auto Assign' },
	{ id: 'created_at', label: 'Created At' },
]

const DEFAULT_AGENT_COLUMN_VISIBILITY: Record<AgentColumnId, boolean> = {
	name: true,
	email: true,
	phone: true,
	role: true,
	supervisor: true,
	status: true,
	channels: true,
	divisions: true,
}

const DEFAULT_TEAM_COLUMN_VISIBILITY: Record<TeamColumnId, boolean> = {
	name: true,
	description: true,
	members: true,
	auto_assign: true,
	created_at: true,
}

function formatDateCell(value?: string | null) {
	if (!value) return '-'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '-'
	return date.toLocaleDateString('id-ID', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	})
}

function escapeCsvValue(value: unknown): string {
	const normalized =
		value === null || value === undefined
			? ''
			: String(value).replace(/\r?\n/g, ' ')
	return `"${normalized.replace(/"/g, '""')}"`
}

// Professional SVG Channel Icons
const ChannelIcon = ({
	channel,
	size = 20,
}: {
	channel: string
	size?: number
}) => {
	switch (channel) {
		case 'whatsapp':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
						fill="#25D366"
					/>
					<path
						d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.657 0-3.216-.5-4.516-1.36l-.324-.195-2.868.852.852-2.868-.195-.324A7.965 7.965 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"
						fill="#25D366"
					/>
				</svg>
			)
		case 'instagram':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<defs>
						<linearGradient
							id={`ig-grad-${size}`}
							x1="0%"
							y1="100%"
							x2="100%"
							y2="0%"
						>
							<stop offset="0%" stopColor="#FD5" />
							<stop offset="50%" stopColor="#FF543E" />
							<stop offset="100%" stopColor="#C837AB" />
						</linearGradient>
					</defs>
					<rect
						x="2"
						y="2"
						width="20"
						height="20"
						rx="5"
						stroke={`url(#ig-grad-${size})`}
						strokeWidth="2"
						fill="none"
					/>
					<circle
						cx="12"
						cy="12"
						r="4"
						stroke={`url(#ig-grad-${size})`}
						strokeWidth="2"
						fill="none"
					/>
					<circle cx="17.5" cy="6.5" r="1.5" fill={`url(#ig-grad-${size})`} />
				</svg>
			)
		case 'tiktok':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="#000"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M12.53 2h2.77a4.3 4.3 0 002.46 3.76 4.3 4.3 0 001.76.49v2.75a7 7 0 01-4.21-1.4v6.35a5.55 5.55 0 11-4.78-5.5v2.84a2.71 2.71 0 101.92 2.6V2h.08z" />
				</svg>
			)
		case 'messenger':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<defs>
						<linearGradient
							id={`msg-grad-${size}`}
							x1="0%"
							y1="100%"
							x2="100%"
							y2="0%"
						>
							<stop offset="0%" stopColor="#0078FF" />
							<stop offset="100%" stopColor="#00C6FF" />
						</linearGradient>
					</defs>
					<path
						d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.02.63.68 1.04 1.26.77l1.99-.88c.17-.07.36-.09.53-.05.88.24 1.82.37 2.79.37 5.64 0 10-4.13 10-9.73S17.64 2 12 2z"
						fill={`url(#msg-grad-${size})`}
					/>
					<path
						d="M6.53 14.19l2.69-4.26c.43-.68 1.34-.85 1.98-.37l2.14 1.6c.19.14.45.14.64 0l2.89-2.19c.39-.29.89.18.63.6l-2.69 4.26c-.43.68-1.34.85-1.98.37l-2.14-1.6c-.19-.14-.45-.14-.64 0l-2.89 2.19c-.39.29-.89-.18-.63-.6z"
						fill="white"
					/>
				</svg>
			)
		default:
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<rect
						x="2"
						y="4"
						width="20"
						height="16"
						rx="2"
						stroke="#9CA3AF"
						strokeWidth="2"
					/>
					<path
						d="M2 8l10 6 10-6"
						stroke="#9CA3AF"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</svg>
			)
	}
}

type AgentsManagementPageProps = {
	mode?: AgentsManagementMode
	initialTab?: AgentsManagementTab
}

export function AgentsManagementPage({
	mode = 'full',
	initialTab,
}: AgentsManagementPageProps = {}) {
	const appId =
		typeof localStorage !== 'undefined'
			? localStorage.getItem('scalechat_org_slug') ||
				localStorage.getItem('scalechat_app_id') ||
				''
			: ''
	const isSettingsMode = mode === 'settings'
	const defaultTab = initialTab ?? (isSettingsMode ? 'settings' : 'agents')
	const [activeTab, setActiveTab] = useState<AgentsManagementTab>(defaultTab)
	const [agents, setAgents] = useState<Agent[]>([])
	const [divisions, setDivisions] = useState<Division[]>([])
	const [teamsData, setTeamsData] = useState<Team[]>([])
	const [loading, setLoading] = useState(true)
	const [searchQuery, setSearchQuery] = useState('')
	const [showCreateModal, setShowCreateModal] = useState(false)
	const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
	const [loginLink, setLoginLink] = useState('')
	const [copiedLink, setCopiedLink] = useState(false)
	const [showTeamModal, setShowTeamModal] = useState(false)
	const [editingTeam, setEditingTeam] = useState<Team | null>(null)
	const [agentPage, setAgentPage] = useState(1)
	const [agentPerPage, setAgentPerPage] = useState(10)
	const [teamPage, setTeamPage] = useState(1)
	const [teamPerPage, setTeamPerPage] = useState(10)
	const [agentSortBy, setAgentSortBy] = useState<AgentColumnId>('name')
	const [agentSortOrder, setAgentSortOrder] = useState<SortOrder>('asc')
	const [teamSortBy, setTeamSortBy] = useState<TeamColumnId>('created_at')
	const [teamSortOrder, setTeamSortOrder] = useState<SortOrder>('desc')
	const [agentColumnVisibility, setAgentColumnVisibility] = useState<
		Record<AgentColumnId, boolean>
	>(DEFAULT_AGENT_COLUMN_VISIBILITY)
	const [teamColumnVisibility, setTeamColumnVisibility] = useState<
		Record<TeamColumnId, boolean>
	>(DEFAULT_TEAM_COLUMN_VISIBILITY)
	const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
	const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])

	useEffect(() => {
		loadLoginLink()
		if (isSettingsMode) return

		loadData()
		connectSocket()

		onAgentPresence((data) => {
			setAgents((prevAgents) =>
				prevAgents.map((agent) =>
					agent.id === data.userId
						? { ...agent, status: data.status as Agent['status'] }
						: agent,
				),
			)
		})

		return () => {
			removeAllListeners()
			disconnectSocket()
		}
	}, [isSettingsMode])

	useEffect(() => {
		setActiveTab(defaultTab)
	}, [defaultTab])

	const pickArrayFromResponse = <T,>(
		source: unknown,
		candidateKeys: string[],
	): T[] => {
		if (Array.isArray(source)) return source as T[]

		for (const key of candidateKeys) {
			if (
				typeof source === 'object' &&
				source !== null &&
				key in source &&
				Array.isArray((source as Record<string, unknown>)[key])
			) {
				return (source as Record<string, unknown>)[key] as T[]
			}
		}

		if (
			typeof source === 'object' &&
			source !== null &&
			'data' in source &&
			Array.isArray((source as Record<string, unknown>).data)
		) {
			return (source as Record<string, unknown>).data as T[]
		}
		return []
	}

	const loadData = async () => {
		try {
			const [agentsRes, divisionsRes, teamsRes] = await Promise.all([
				agentsManagement.list(),
				agentsManagement.divisions.list(),
				teamsApi.list(),
			])

			setAgents(pickArrayFromResponse<Agent>(agentsRes, ['agents']))
			setDivisions(pickArrayFromResponse<Division>(divisionsRes, ['divisions']))
			setTeamsData(pickArrayFromResponse<Team>(teamsRes, ['payload', 'teams']))
		} catch (e) {
			console.error('Failed to load data:', e)
		} finally {
			setLoading(false)
		}
	}

	const loadLoginLink = async () => {
		const storageKey = `scalechat_agent_login_link_${appId}`
		const cachedLink = localStorage.getItem(storageKey)

		if (cachedLink) {
			setLoginLink(cachedLink)
			return
		}

		try {
			const res = (await agentsManagement.getLoginLink()) as {
				loginLink?: string
			}
			const link = res.loginLink || ''
			if (link) {
				setLoginLink(link)
				localStorage.setItem(storageKey, link)
			}
		} catch (e) {
			console.error('Failed to load login link:', e)
		}
	}

	const copyLoginLink = () => {
		navigator.clipboard.writeText(loginLink)
		setCopiedLink(true)
		setTimeout(() => setCopiedLink(false), 2000)
	}

	const handleDelete = async (id: string, name: string) => {
		if (
			!confirm(
				`Are you sure you want to delete ${name}? This action cannot be undone.`,
			)
		)
			return

		try {
			await agentsManagement.delete(id)
			loadData()
		} catch (e) {
			console.error('Failed to delete agent:', e)
			alert('Failed to delete agent')
		}
	}

	const handleEdit = (agent: Agent) => {
		setEditingAgent(agent)
		setShowCreateModal(true)
	}

	const getStatusColor = (status?: string) => {
		switch (status) {
			case 'online':
				return 'bg-green-500'
			case 'busy':
				return 'bg-red-500'
			case 'away':
				return 'bg-yellow-500'
			default:
				return 'bg-gray-400'
		}
	}

	const normalizedSearch = searchQuery.trim().toLowerCase()

	const agentScopeRows = useMemo(() => {
		return agents.filter((agent) =>
			activeTab === 'supervisor'
				? agent.role === 'supervisor' || agent.role === 'admin'
				: agent.role === 'agent',
		)
	}, [agents, activeTab])

	const filteredSortedAgents = useMemo(() => {
		const filtered = normalizedSearch
			? agentScopeRows.filter((agent) => {
					const divisionsLabel = agent.divisions
						.map((div) => div.name)
						.join(' ')
					const channelsLabel = agent.channels.join(' ')
					const searchable = [
						agent.name,
						agent.email,
						agent.phone_number || '',
						agent.role,
						agent.supervisor?.name || '',
						agent.status || '',
						divisionsLabel,
						channelsLabel,
					]
					return searchable.some((value) =>
						value.toLowerCase().includes(normalizedSearch),
					)
				})
			: agentScopeRows

		const sorted = [...filtered].sort((a, b) => {
			const valueA =
				agentSortBy === 'name'
					? a.name
					: agentSortBy === 'email'
						? a.email
						: agentSortBy === 'phone'
							? a.phone_number || ''
							: agentSortBy === 'role'
								? a.role
								: agentSortBy === 'supervisor'
									? a.supervisor?.name || ''
									: agentSortBy === 'status'
										? a.status || 'offline'
										: agentSortBy === 'channels'
											? String(a.channels.length)
											: a.divisions.map((div) => div.name).join(',')
			const valueB =
				agentSortBy === 'name'
					? b.name
					: agentSortBy === 'email'
						? b.email
						: agentSortBy === 'phone'
							? b.phone_number || ''
							: agentSortBy === 'role'
								? b.role
								: agentSortBy === 'supervisor'
									? b.supervisor?.name || ''
									: agentSortBy === 'status'
										? b.status || 'offline'
										: agentSortBy === 'channels'
											? String(b.channels.length)
											: b.divisions.map((div) => div.name).join(',')

			const compare =
				agentSortBy === 'channels'
					? Number(valueA) - Number(valueB)
					: String(valueA).localeCompare(String(valueB), 'id', {
							sensitivity: 'base',
						})
			return agentSortOrder === 'asc' ? compare : -compare
		})

		return sorted
	}, [agentScopeRows, normalizedSearch, agentSortBy, agentSortOrder])

	const getTeamMemberCount = (
		team: Team & { team_members?: unknown[]; members?: TeamMember[] },
	) => {
		const members = team.members
		const teamMembers = team.team_members
		if (Array.isArray(members)) return members.length
		if (Array.isArray(teamMembers)) return teamMembers.length
		return 0
	}

	const filteredSortedTeams = useMemo(() => {
		const filtered = normalizedSearch
			? teamsData.filter((team) =>
					[team.name, team.description || '']
						.join(' ')
						.toLowerCase()
						.includes(normalizedSearch),
				)
			: teamsData

		const sorted = [...filtered].sort((a, b) => {
			const valueA =
				teamSortBy === 'name'
					? a.name
					: teamSortBy === 'description'
						? a.description || ''
						: teamSortBy === 'members'
							? getTeamMemberCount(a)
							: teamSortBy === 'auto_assign'
								? Number(Boolean(a.allow_auto_assign))
								: new Date(a.created_at || '').getTime() || 0
			const valueB =
				teamSortBy === 'name'
					? b.name
					: teamSortBy === 'description'
						? b.description || ''
						: teamSortBy === 'members'
							? getTeamMemberCount(b)
							: teamSortBy === 'auto_assign'
								? Number(Boolean(b.allow_auto_assign))
								: new Date(b.created_at || '').getTime() || 0

			const compare =
				teamSortBy === 'members' ||
				teamSortBy === 'auto_assign' ||
				teamSortBy === 'created_at'
					? Number(valueA) - Number(valueB)
					: String(valueA).localeCompare(String(valueB), 'id', {
							sensitivity: 'base',
						})

			return teamSortOrder === 'asc' ? compare : -compare
		})

		return sorted
	}, [teamsData, normalizedSearch, teamSortBy, teamSortOrder])

	const visibleAgentColumns = useMemo(
		() => AGENT_COLUMNS.filter((column) => agentColumnVisibility[column.id]),
		[agentColumnVisibility],
	)

	const visibleTeamColumns = useMemo(
		() => TEAM_COLUMNS.filter((column) => teamColumnVisibility[column.id]),
		[teamColumnVisibility],
	)

	const agentTotalRows = filteredSortedAgents.length
	const teamTotalRows = filteredSortedTeams.length
	const agentTotalPages = Math.max(1, Math.ceil(agentTotalRows / agentPerPage))
	const teamTotalPages = Math.max(1, Math.ceil(teamTotalRows / teamPerPage))
	const currentAgentPage = Math.min(agentPage, agentTotalPages)
	const currentTeamPage = Math.min(teamPage, teamTotalPages)

	const paginatedAgents = useMemo(() => {
		const start = (currentAgentPage - 1) * agentPerPage
		return filteredSortedAgents.slice(start, start + agentPerPage)
	}, [filteredSortedAgents, currentAgentPage, agentPerPage])

	const paginatedTeams = useMemo(() => {
		const start = (currentTeamPage - 1) * teamPerPage
		return filteredSortedTeams.slice(start, start + teamPerPage)
	}, [filteredSortedTeams, currentTeamPage, teamPerPage])

	const selectedAgentSet = useMemo(
		() => new Set(selectedAgentIds),
		[selectedAgentIds],
	)
	const selectedTeamSet = useMemo(
		() => new Set(selectedTeamIds),
		[selectedTeamIds],
	)

	const currentAgentPageIds = useMemo(
		() => paginatedAgents.map((agent) => agent.id),
		[paginatedAgents],
	)
	const currentTeamPageIds = useMemo(
		() => paginatedTeams.map((team) => team.id),
		[paginatedTeams],
	)

	const selectedAgentOnCurrentPage = currentAgentPageIds.filter((id) =>
		selectedAgentSet.has(id),
	).length
	const selectedTeamOnCurrentPage = currentTeamPageIds.filter((id) =>
		selectedTeamSet.has(id),
	).length

	const allAgentsCurrentPageSelected =
		currentAgentPageIds.length > 0 &&
		selectedAgentOnCurrentPage === currentAgentPageIds.length
	const allTeamsCurrentPageSelected =
		currentTeamPageIds.length > 0 &&
		selectedTeamOnCurrentPage === currentTeamPageIds.length

	useEffect(() => {
		if (agentPage <= agentTotalPages) return
		setAgentPage(agentTotalPages)
	}, [agentPage, agentTotalPages])

	useEffect(() => {
		if (teamPage <= teamTotalPages) return
		setTeamPage(teamTotalPages)
	}, [teamPage, teamTotalPages])

	useEffect(() => {
		setAgentPage(1)
		setTeamPage(1)
	}, [searchQuery])

	useEffect(() => {
		setSelectedAgentIds([])
	}, [activeTab])

	useEffect(() => {
		if (activeTab === 'teams') return
		setSelectedTeamIds([])
	}, [activeTab])

	const setAgentColumnVisible = (columnId: AgentColumnId, visible: boolean) => {
		setAgentColumnVisibility((prev) => {
			const visibleCount = Object.values(prev).filter(Boolean).length
			if (!visible && prev[columnId] && visibleCount <= 1) return prev
			return { ...prev, [columnId]: visible }
		})
	}

	const setTeamColumnVisible = (columnId: TeamColumnId, visible: boolean) => {
		setTeamColumnVisibility((prev) => {
			const visibleCount = Object.values(prev).filter(Boolean).length
			if (!visible && prev[columnId] && visibleCount <= 1) return prev
			return { ...prev, [columnId]: visible }
		})
	}

	const toggleAgentSelection = (agentId: string, checked: boolean) => {
		setSelectedAgentIds((prev) => {
			if (checked) {
				if (prev.includes(agentId)) return prev
				return [...prev, agentId]
			}
			return prev.filter((id) => id !== agentId)
		})
	}

	const toggleTeamSelection = (teamId: string, checked: boolean) => {
		setSelectedTeamIds((prev) => {
			if (checked) {
				if (prev.includes(teamId)) return prev
				return [...prev, teamId]
			}
			return prev.filter((id) => id !== teamId)
		})
	}

	const toggleCurrentAgentPageSelection = (checked: boolean) => {
		if (currentAgentPageIds.length === 0) return
		setSelectedAgentIds((prev) => {
			if (checked) {
				return Array.from(new Set([...prev, ...currentAgentPageIds]))
			}
			const currentSet = new Set(currentAgentPageIds)
			return prev.filter((id) => !currentSet.has(id))
		})
	}

	const toggleCurrentTeamPageSelection = (checked: boolean) => {
		if (currentTeamPageIds.length === 0) return
		setSelectedTeamIds((prev) => {
			if (checked) {
				return Array.from(new Set([...prev, ...currentTeamPageIds]))
			}
			const currentSet = new Set(currentTeamPageIds)
			return prev.filter((id) => !currentSet.has(id))
		})
	}

	const exportSelectedAgents = () => {
		if (selectedAgentIds.length === 0) {
			toast.error('Select at least one row first')
			return
		}

		const byId = new Map(filteredSortedAgents.map((agent) => [agent.id, agent]))
		const rows = selectedAgentIds
			.map((id) => byId.get(id))
			.filter((agent): agent is Agent => Boolean(agent))

		if (rows.length === 0) {
			toast.error('Selected rows are not available')
			return
		}

		const headers = [
			'Name',
			'Email',
			'Phone',
			'Role',
			'Supervisor',
			'Status',
			'Channels',
			'Divisions',
		]
		const csvLines = rows.map((agent) =>
			[
				agent.name,
				agent.email,
				agent.phone_number || '',
				agent.role,
				agent.supervisor?.name || '',
				agent.status || 'offline',
				agent.channels.join(' | '),
				agent.divisions.map((division) => division.name).join(' | '),
			]
				.map((value) => escapeCsvValue(value))
				.join(','),
		)
		const csv = [
			headers.map((header) => escapeCsvValue(header)).join(','),
			...csvLines,
		].join('\n')
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
		const url = window.URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = `agents-selected-${new Date().toISOString().slice(0, 10)}.csv`
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		window.URL.revokeObjectURL(url)

		toast.success(`Exported ${rows.length} row(s)`)
	}

	const exportSelectedTeams = () => {
		if (selectedTeamIds.length === 0) {
			toast.error('Select at least one row first')
			return
		}

		const byId = new Map(filteredSortedTeams.map((team) => [team.id, team]))
		const rows = selectedTeamIds
			.map((id) => byId.get(id))
			.filter((team): team is Team => Boolean(team))

		if (rows.length === 0) {
			toast.error('Selected rows are not available')
			return
		}

		const headers = [
			'Name',
			'Description',
			'Members',
			'Auto Assign',
			'Created At',
		]
		const csvLines = rows.map((team) =>
			[
				team.name,
				team.description || '',
				getTeamMemberCount(team),
				team.allow_auto_assign ? 'YES' : 'NO',
				formatDateCell(team.created_at),
			]
				.map((value) => escapeCsvValue(value))
				.join(','),
		)
		const csv = [
			headers.map((header) => escapeCsvValue(header)).join(','),
			...csvLines,
		].join('\n')
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
		const url = window.URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = `teams-selected-${new Date().toISOString().slice(0, 10)}.csv`
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		window.URL.revokeObjectURL(url)

		toast.success(`Exported ${rows.length} row(s)`)
	}

	const renderAgentCell = (columnId: AgentColumnId, agent: Agent) => {
		switch (columnId) {
			case 'name':
				return (
					<div className="flex items-center gap-2">
						<div
							className={`h-2.5 w-2.5 rounded-full ${getStatusColor(agent.status)}`}
						/>
						<div>
							<p className="font-medium text-gray-900">{agent.name}</p>
						</div>
					</div>
				)
			case 'email':
				return (
					<div className="flex items-center gap-1.5 text-gray-700">
						<Mail size={12} className="text-gray-400" />
						<span className="text-xs">{agent.email}</span>
					</div>
				)
			case 'phone':
				return (
					<div className="flex items-center gap-1.5 text-gray-700">
						<Phone size={12} className="text-gray-400" />
						<span className="text-xs">{agent.phone_number || '-'}</span>
					</div>
				)
			case 'role':
				return (
					<span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-700">
						{agent.role}
					</span>
				)
			case 'supervisor':
				return (
					<span className="text-xs text-gray-600">
						{agent.supervisor?.name || '-'}
					</span>
				)
			case 'status':
				return (
					<span className="inline-flex items-center gap-1 text-xs capitalize text-gray-700">
						<Activity size={12} className="text-gray-400" />
						{agent.status || 'offline'}
					</span>
				)
			case 'channels':
				return (
					<div className="flex flex-wrap items-center gap-1.5">
						{agent.channels.length > 0 ? (
							agent.channels.map((channel) => (
								<div
									key={channel}
									className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white"
									title={channel}
								>
									<ChannelIcon channel={channel} size={14} />
								</div>
							))
						) : (
							<span className="text-xs text-gray-400">-</span>
						)}
					</div>
				)
			case 'divisions':
				return (
					<div className="flex flex-wrap gap-1">
						{agent.divisions.length > 0 ? (
							agent.divisions.map((division) => (
								<span
									key={division.id}
									className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
									style={{ backgroundColor: division.color }}
								>
									{division.name}
								</span>
							))
						) : (
							<span className="text-xs text-gray-400">-</span>
						)}
					</div>
				)
			default:
				return null
		}
	}

	const renderTeamCell = (columnId: TeamColumnId, team: Team) => {
		switch (columnId) {
			case 'name':
				return (
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100">
							<UsersRound size={16} className="text-teal-600" />
						</div>
						<div>
							<p className="font-medium text-gray-900">{team.name}</p>
						</div>
					</div>
				)
			case 'description':
				return (
					<span className="text-xs text-gray-600">
						{team.description || 'No description'}
					</span>
				)
			case 'members':
				return (
					<span className="text-xs text-gray-700">
						{getTeamMemberCount(team)}
					</span>
				)
			case 'auto_assign':
				return (
					<span
						className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
							team.allow_auto_assign
								? 'bg-emerald-100 text-emerald-700'
								: 'bg-gray-100 text-gray-600'
						}`}
					>
						{team.allow_auto_assign ? 'Enabled' : 'Disabled'}
					</span>
				)
			case 'created_at':
				return (
					<span className="text-xs text-gray-600">
						{formatDateCell(team.created_at)}
					</span>
				)
			default:
				return null
		}
	}

	return (
		<div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
			<PageHeader
				title="Agents Management"
				description="You can create, edit and delete agents from this page. You also assign channel to specific agent."
				icon={<Users size={24} />}
				className="mb-0 border-b-0"
				actions={
					loginLink ? (
						<div className="flex items-center gap-2">
							<a
								href={loginLink}
								className="text-sm text-blue-600 hover:underline truncate max-w-xs"
								target="_blank"
								rel="noopener noreferrer"
							>
								Agent login link
							</a>
							<button
								onClick={copyLoginLink}
								className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition flex items-center gap-1.5 text-sm font-medium"
							>
								{copiedLink ? <Check size={14} /> : <Copy size={14} />}
								{copiedLink ? 'Copied' : 'Copy'}
							</button>
						</div>
					) : undefined
				}
				tabs={
					mode === 'full' ? (
						<div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
							<button
								onClick={() => setActiveTab('agents')}
								className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
									activeTab !== 'settings'
										? 'bg-emerald-100 text-emerald-800'
										: 'text-gray-600 hover:bg-gray-100'
								}`}
							>
								<Users size={15} />
								Roles Management
							</button>
							<button
								onClick={() => setActiveTab('settings')}
								className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
									activeTab === 'settings'
										? 'bg-emerald-100 text-emerald-800'
										: 'text-gray-600 hover:bg-gray-100'
								}`}
							>
								<Settings size={15} />
								Settings
							</button>
						</div>
					) : undefined
				}
			/>

			{/* Sub-tabs (Only show for roles views) */}
			{!isSettingsMode && activeTab !== 'settings' && (
				<div className="bg-white border-b border-gray-200 px-4 lg:px-8">
					<div className="flex gap-1">
						{(['agents', 'supervisor', 'divisions', 'teams'] as const).map(
							(tab) => (
								<button
									key={tab}
									onClick={() => setActiveTab(tab)}
									className={`px-4 py-3 text-sm font-medium transition ${
										activeTab === tab
											? 'border-b-2 border-emerald-500 text-emerald-600'
											: 'text-gray-600 hover:text-gray-900'
									}`}
								>
									{tab === 'agents' && 'Agent List'}
									{tab === 'supervisor' && 'Supervisor List'}
									{tab === 'divisions' && 'Division List'}
									{tab === 'teams' && 'Teams List'}
								</button>
							),
						)}
					</div>
				</div>
			)}

			<div className="flex-1 overflow-y-auto px-4 pb-8 lg:px-8">
				<div className="mt-4">
					{/* Content based on active tab */}
					{activeTab === 'divisions' ? (
						<DivisionManagement divisions={divisions} onRefresh={loadData} />
					) : activeTab === 'settings' ? (
						<AgentSettings />
					) : activeTab === 'teams' ? (
						<>
							<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
								<div className="relative w-full lg:w-80">
									<Search
										className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
										size={16}
									/>
									<input
										type="text"
										placeholder="Search teams..."
										value={searchQuery}
										onChange={(event) => setSearchQuery(event.target.value)}
										className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
									/>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="outline"
										className="gap-2"
										disabled={selectedTeamIds.length === 0}
										onClick={exportSelectedTeams}
									>
										<Download size={14} />
										Export Selected
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button type="button" variant="outline" className="gap-2">
												<Settings2 size={14} />
												View
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-52">
											{TEAM_COLUMNS.map((column) => (
												<DropdownMenuCheckboxItem
													key={column.id}
													checked={teamColumnVisibility[column.id]}
													onCheckedChange={(checked) =>
														setTeamColumnVisible(column.id, checked === true)
													}
													disabled={
														teamColumnVisibility[column.id] &&
														Object.values(teamColumnVisibility).filter(Boolean)
															.length === 1
													}
												>
													{column.label}
												</DropdownMenuCheckboxItem>
											))}
										</DropdownMenuContent>
									</DropdownMenu>
									<button
										onClick={() => {
											setEditingTeam(null)
											setShowTeamModal(true)
										}}
										className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-600"
									>
										<Plus size={16} />
										Create Team
									</button>
								</div>
							</div>
							{loading ? (
								<div className="py-10 text-center text-gray-500">
									Loading...
								</div>
							) : (
								<div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
									<div className="overflow-x-auto">
										<table className="min-w-[980px] w-full text-left text-sm">
											<thead className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold uppercase text-gray-500">
												<tr>
													<th className="w-12 px-4 py-4">
														<Checkbox
															checked={allTeamsCurrentPageSelected}
															onCheckedChange={(checked) =>
																toggleCurrentTeamPageSelection(checked === true)
															}
															aria-label="Select all teams on current page"
														/>
													</th>
													{visibleTeamColumns.map((column) => (
														<th key={column.id} className="px-4 py-4">
															<div className="flex items-center gap-2">
																<span>{column.label}</span>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<button
																			type="button"
																			className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
																		>
																			{teamSortBy === column.id ? (
																				teamSortOrder === 'asc' ? (
																					<ArrowUp size={13} />
																				) : (
																					<ArrowDown size={13} />
																				)
																			) : (
																				<ChevronsUpDown size={13} />
																			)}
																		</button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent
																		align="end"
																		className="w-32"
																	>
																		<DropdownMenuItem
																			onClick={() => {
																				setTeamSortBy(column.id)
																				setTeamSortOrder('asc')
																				setTeamPage(1)
																			}}
																		>
																			<ArrowUp size={14} />
																			Asc
																		</DropdownMenuItem>
																		<DropdownMenuItem
																			onClick={() => {
																				setTeamSortBy(column.id)
																				setTeamSortOrder('desc')
																				setTeamPage(1)
																			}}
																		>
																			<ArrowDown size={14} />
																			Desc
																		</DropdownMenuItem>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			disabled={visibleTeamColumns.length <= 1}
																			onClick={() =>
																				setTeamColumnVisible(column.id, false)
																			}
																		>
																			<EyeOff size={14} />
																			Hide
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>
														</th>
													))}
													<th className="w-28 px-4 py-4 text-right">Actions</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-gray-100">
												{paginatedTeams.length === 0 ? (
													<tr>
														<td
															colSpan={visibleTeamColumns.length + 2}
															className="px-6 py-12 text-center text-gray-500"
														>
															No teams found.
														</td>
													</tr>
												) : (
													paginatedTeams.map((team) => (
														<tr key={team.id} className="hover:bg-gray-50/60">
															<td className="px-4 py-4">
																<Checkbox
																	checked={selectedTeamSet.has(team.id)}
																	onCheckedChange={(checked) =>
																		toggleTeamSelection(
																			team.id,
																			checked === true,
																		)
																	}
																	aria-label={`Select ${team.name}`}
																/>
															</td>
															{visibleTeamColumns.map((column) => (
																<td
																	key={`${team.id}-${column.id}`}
																	className="px-4 py-4"
																>
																	{renderTeamCell(column.id, team)}
																</td>
															))}
															<td className="px-4 py-4">
																<div className="flex items-center justify-end gap-1">
																	<button
																		onClick={async () => {
																			const res = await teamsApi.get(team.id)
																			if (res.success) {
																				setEditingTeam(res.payload)
																				setShowTeamModal(true)
																			}
																		}}
																		className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
																		title="Edit Team"
																	>
																		<Edit2 size={15} />
																	</button>
																	<button
																		onClick={async () => {
																			if (
																				!confirm(
																					`Are you sure you want to delete '${team.name}'?`,
																				)
																			)
																				return
																			try {
																				await teamsApi.delete(team.id)
																				toast.success('Team deleted')
																				loadData()
																			} catch {
																				toast.error('Failed to delete team')
																			}
																		}}
																		className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
																		title="Delete Team"
																	>
																		<Trash2 size={15} />
																	</button>
																</div>
															</td>
														</tr>
													))
												)}
											</tbody>
										</table>
									</div>
									<div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
										<p className="text-sm text-gray-500">
											{selectedTeamIds.length} of {teamTotalRows} row(s)
											selected.
										</p>
										<div className="flex flex-wrap items-center gap-3">
											<div className="flex items-center gap-2 text-sm text-gray-600">
												<span>Rows per page</span>
												<NativeSelect
													className="w-[86px]"
													value={String(teamPerPage)}
													onChange={(event) => {
														setTeamPerPage(Number(event.target.value))
														setTeamPage(1)
													}}
												>
													<NativeSelectOption value="10">10</NativeSelectOption>
													<NativeSelectOption value="20">20</NativeSelectOption>
													<NativeSelectOption value="50">50</NativeSelectOption>
													<NativeSelectOption value="100">
														100
													</NativeSelectOption>
												</NativeSelect>
											</div>
											<p className="text-sm font-medium text-gray-700">
												Page {currentTeamPage} of {teamTotalPages}
											</p>
											<div className="flex items-center gap-1">
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={teamPage <= 1}
													onClick={() => setTeamPage(1)}
													aria-label="First page"
												>
													<ChevronsLeft size={14} />
												</Button>
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={teamPage <= 1}
													onClick={() =>
														setTeamPage((prev) => Math.max(1, prev - 1))
													}
													aria-label="Previous page"
												>
													<ChevronLeft size={14} />
												</Button>
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={teamPage >= teamTotalPages}
													onClick={() =>
														setTeamPage((prev) =>
															Math.min(teamTotalPages, prev + 1),
														)
													}
													aria-label="Next page"
												>
													<ChevronRight size={14} />
												</Button>
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={teamPage >= teamTotalPages}
													onClick={() => setTeamPage(teamTotalPages)}
													aria-label="Last page"
												>
													<ChevronsRight size={14} />
												</Button>
											</div>
										</div>
									</div>
								</div>
							)}
						</>
					) : (
						<>
							<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
								<div className="relative w-full lg:w-80">
									<Search
										className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
										size={16}
									/>
									<input
										type="text"
										placeholder={`Search ${activeTab === 'supervisor' ? 'supervisors' : 'agents'}...`}
										value={searchQuery}
										onChange={(event) => setSearchQuery(event.target.value)}
										className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
									/>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="outline"
										className="gap-2"
										disabled={selectedAgentIds.length === 0}
										onClick={exportSelectedAgents}
									>
										<Download size={14} />
										Export Selected
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button type="button" variant="outline" className="gap-2">
												<Settings2 size={14} />
												View
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-52">
											{AGENT_COLUMNS.map((column) => (
												<DropdownMenuCheckboxItem
													key={column.id}
													checked={agentColumnVisibility[column.id]}
													onCheckedChange={(checked) =>
														setAgentColumnVisible(column.id, checked === true)
													}
													disabled={
														agentColumnVisibility[column.id] &&
														Object.values(agentColumnVisibility).filter(Boolean)
															.length === 1
													}
												>
													{column.label}
												</DropdownMenuCheckboxItem>
											))}
										</DropdownMenuContent>
									</DropdownMenu>
									<button
										onClick={() => {
											setEditingAgent(null)
											setShowCreateModal(true)
										}}
										className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-600"
									>
										<UserPlus size={16} />
										Create Agent
									</button>
								</div>
							</div>
							{loading ? (
								<div className="py-10 text-center text-gray-500">
									Loading...
								</div>
							) : (
								<div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
									<div className="overflow-x-auto">
										<table className="min-w-[1200px] w-full text-left text-sm">
											<thead className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold uppercase text-gray-500">
												<tr>
													<th className="w-12 px-4 py-4">
														<Checkbox
															checked={allAgentsCurrentPageSelected}
															onCheckedChange={(checked) =>
																toggleCurrentAgentPageSelection(
																	checked === true,
																)
															}
															aria-label="Select all agents on current page"
														/>
													</th>
													{visibleAgentColumns.map((column) => (
														<th key={column.id} className="px-4 py-4">
															<div className="flex items-center gap-2">
																<span>{column.label}</span>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<button
																			type="button"
																			className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
																		>
																			{agentSortBy === column.id ? (
																				agentSortOrder === 'asc' ? (
																					<ArrowUp size={13} />
																				) : (
																					<ArrowDown size={13} />
																				)
																			) : (
																				<ChevronsUpDown size={13} />
																			)}
																		</button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent
																		align="end"
																		className="w-32"
																	>
																		<DropdownMenuItem
																			onClick={() => {
																				setAgentSortBy(column.id)
																				setAgentSortOrder('asc')
																				setAgentPage(1)
																			}}
																		>
																			<ArrowUp size={14} />
																			Asc
																		</DropdownMenuItem>
																		<DropdownMenuItem
																			onClick={() => {
																				setAgentSortBy(column.id)
																				setAgentSortOrder('desc')
																				setAgentPage(1)
																			}}
																		>
																			<ArrowDown size={14} />
																			Desc
																		</DropdownMenuItem>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			disabled={visibleAgentColumns.length <= 1}
																			onClick={() =>
																				setAgentColumnVisible(column.id, false)
																			}
																		>
																			<EyeOff size={14} />
																			Hide
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>
														</th>
													))}
													<th className="w-28 px-4 py-4 text-right">Actions</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-gray-100">
												{paginatedAgents.length === 0 ? (
													<tr>
														<td
															colSpan={visibleAgentColumns.length + 2}
															className="px-6 py-12 text-center text-gray-500"
														>
															No{' '}
															{activeTab === 'supervisor'
																? 'supervisors'
																: 'agents'}{' '}
															found.
														</td>
													</tr>
												) : (
													paginatedAgents.map((agent) => (
														<tr key={agent.id} className="hover:bg-gray-50/60">
															<td className="px-4 py-4">
																<Checkbox
																	checked={selectedAgentSet.has(agent.id)}
																	onCheckedChange={(checked) =>
																		toggleAgentSelection(
																			agent.id,
																			checked === true,
																		)
																	}
																	aria-label={`Select ${agent.name}`}
																/>
															</td>
															{visibleAgentColumns.map((column) => (
																<td
																	key={`${agent.id}-${column.id}`}
																	className="px-4 py-4"
																>
																	{renderAgentCell(column.id, agent)}
																</td>
															))}
															<td className="px-4 py-4">
																<div className="flex items-center justify-end gap-1">
																	<button
																		onClick={() => handleEdit(agent)}
																		className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
																		title="Edit Agent"
																	>
																		<Edit2 size={15} />
																	</button>
																	<button
																		onClick={() =>
																			handleDelete(agent.id, agent.name)
																		}
																		className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
																		title="Delete Agent"
																	>
																		<Trash2 size={15} />
																	</button>
																</div>
															</td>
														</tr>
													))
												)}
											</tbody>
										</table>
									</div>
									<div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
										<p className="text-sm text-gray-500">
											{selectedAgentIds.length} of {agentTotalRows} row(s)
											selected.
										</p>
										<div className="flex flex-wrap items-center gap-3">
											<div className="flex items-center gap-2 text-sm text-gray-600">
												<span>Rows per page</span>
												<NativeSelect
													className="w-[86px]"
													value={String(agentPerPage)}
													onChange={(event) => {
														setAgentPerPage(Number(event.target.value))
														setAgentPage(1)
													}}
												>
													<NativeSelectOption value="10">10</NativeSelectOption>
													<NativeSelectOption value="20">20</NativeSelectOption>
													<NativeSelectOption value="50">50</NativeSelectOption>
													<NativeSelectOption value="100">
														100
													</NativeSelectOption>
												</NativeSelect>
											</div>
											<p className="text-sm font-medium text-gray-700">
												Page {currentAgentPage} of {agentTotalPages}
											</p>
											<div className="flex items-center gap-1">
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={agentPage <= 1}
													onClick={() => setAgentPage(1)}
													aria-label="First page"
												>
													<ChevronsLeft size={14} />
												</Button>
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={agentPage <= 1}
													onClick={() =>
														setAgentPage((prev) => Math.max(1, prev - 1))
													}
													aria-label="Previous page"
												>
													<ChevronLeft size={14} />
												</Button>
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={agentPage >= agentTotalPages}
													onClick={() =>
														setAgentPage((prev) =>
															Math.min(agentTotalPages, prev + 1),
														)
													}
													aria-label="Next page"
												>
													<ChevronRight size={14} />
												</Button>
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													disabled={agentPage >= agentTotalPages}
													onClick={() => setAgentPage(agentTotalPages)}
													aria-label="Last page"
												>
													<ChevronsRight size={14} />
												</Button>
											</div>
										</div>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</div>

			{/* Agent Modal */}
			{showCreateModal && (
				<AgentModal
					divisions={divisions}
					supervisors={agents.filter(
						(a) => a.role === 'supervisor' || a.role === 'admin',
					)}
					initialData={editingAgent}
					onClose={() => {
						setShowCreateModal(false)
						setEditingAgent(null)
					}}
					onSuccess={() => {
						setShowCreateModal(false)
						setEditingAgent(null)
						loadData()
					}}
				/>
			)}

			{/* Team Modal */}
			{showTeamModal && (
				<TeamModal
					agents={agents.map((a) => ({
						id: a.id,
						name: a.name,
						email: a.email,
						role: a.role,
					}))}
					initialData={editingTeam}
					onClose={() => {
						setShowTeamModal(false)
						setEditingTeam(null)
					}}
					onSuccess={() => {
						setShowTeamModal(false)
						setEditingTeam(null)
						loadData()
					}}
				/>
			)}
		</div>
	)
}

// Agent Modal Component (Create & Edit)
function AgentModal({
	divisions,
	supervisors,
	initialData,
	onClose,
	onSuccess,
}: {
	divisions: Division[]
	supervisors: Agent[]
	initialData?: Agent | null
	onClose: () => void
	onSuccess: () => void
}) {
	const [formData, setFormData] = useState({
		name: initialData?.name || '',
		email: initialData?.email || '',
		phone_number: initialData?.phone_number || '',
		password: '',
		role: initialData?.role || 'agent',
		supervisor_id: initialData?.supervisor?.id || '',
		divisions: initialData?.divisions?.map((d) => d.id) || ([] as string[]),
		channels: initialData?.channels || ([] as string[]),
		assign_to_all: false,
	})
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [availableChannels, setAvailableChannels] = useState<
		Array<{ id: string; name: string; channel_type: string }>
	>([])
	const [loadingChannels, setLoadingChannels] = useState(true)

	// Fetch available channels from the app
	useEffect(() => {
		const loadChannels = async () => {
			try {
				const res: any = await inboxesApi.list()
				const list = Array.isArray(res?.data)
					? res.data
					: Array.isArray(res?.payload)
						? res.payload
						: Array.isArray(res?.inboxes)
							? res.inboxes
							: []

				setAvailableChannels(
					list.map((inbox: any) => ({
						id: inbox.id,
						name: inbox.name,
						channel_type: inbox.channel_type,
					})),
				)
			} catch (e) {
				console.error('Failed to load channels:', e)
			} finally {
				setLoadingChannels(false)
			}
		}
		loadChannels()
	}, [])

	const toggleChannel = (channelId: string) => {
		if (formData.channels.includes(channelId)) {
			setFormData((prev) => ({
				...prev,
				channels: prev.channels.filter((c) => c !== channelId),
			}))
		} else {
			setFormData((prev) => ({
				...prev,
				channels: [...prev.channels, channelId],
			}))
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError('')
		setLoading(true)

		try {
			if (initialData) {
				// Edit Mode
				const updateData: any = {
					name: formData.name,
					email: formData.email,
					phone_number: formData.phone_number,
					role: formData.role,
					supervisor_id: formData.supervisor_id || null,
					divisions: formData.divisions,
					channels: formData.channels,
				}
				// Only send password if provided
				if (formData.password) {
					updateData.password = formData.password
				}

				await agentsManagement.update(initialData.id, updateData)
			} else {
				// Create Mode
				await agentsManagement.create(formData)
			}
			onSuccess()
		} catch (err: any) {
			setError(
				err.message || `Failed to ${initialData ? 'update' : 'create'} agent`,
			)
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
			<div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
				<form onSubmit={handleSubmit}>
					{/* Header */}
					<div className="px-6 py-4 border-b border-gray-200">
						<h2 className="text-xl font-bold text-gray-900">
							{initialData ? 'Edit Agent' : 'Create Agent'}
						</h2>
					</div>

					{/* Body */}
					<div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
						{error && (
							<div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
								{error}
							</div>
						)}

						{/* Basic Info */}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Name *
								</label>
								<input
									type="text"
									required
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
									placeholder="Type a name"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Email *
								</label>
								<input
									type="email"
									required
									value={formData.email}
									onChange={(e) =>
										setFormData({ ...formData, email: e.target.value })
									}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
									placeholder="Type an email"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Phone Number
								</label>
								<input
									type="tel"
									value={formData.phone_number}
									onChange={(e) =>
										setFormData({ ...formData, phone_number: e.target.value })
									}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
									placeholder="Type a phone number"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									{initialData
										? 'Password (leave empty to keep)'
										: 'Password *'}
								</label>
								<input
									type="password"
									required={!initialData}
									value={formData.password}
									onChange={(e) =>
										setFormData({ ...formData, password: e.target.value })
									}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
									placeholder={initialData ? 'New password' : 'Type a password'}
								/>
							</div>
						</div>

						{/* Role & Division */}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Role Position
								</label>
								<select
									value={formData.role}
									onChange={(e) =>
										setFormData({
											...formData,
											role: e.target.value as 'agent' | 'supervisor',
										})
									}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
								>
									<option value="agent">Agent</option>
									<option value="supervisor">Supervisor</option>
								</select>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Division
								</label>
								<select
									onChange={(e) => {
										const divId = e.target.value
										if (divId && !formData.divisions.includes(divId)) {
											setFormData({
												...formData,
												divisions: [...formData.divisions, divId],
											})
										}
									}}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
								>
									<option value="">Search division</option>
									{divisions.map((div) => (
										<option key={div.id} value={div.id}>
											{div.name}
										</option>
									))}
								</select>
								{formData.divisions.length > 0 && (
									<div className="mt-2 flex flex-wrap gap-2">
										{formData.divisions.map((divId) => {
											const div = divisions.find((d) => d.id === divId)
											return div ? (
												<div
													key={divId}
													className="px-2 py-1 rounded text-xs font-medium text-white flex items-center gap-1"
													style={{ backgroundColor: div.color }}
												>
													{div.name}
													<button
														type="button"
														onClick={() =>
															setFormData((prev) => ({
																...prev,
																divisions: prev.divisions.filter(
																	(id) => id !== divId,
																),
															}))
														}
														className="hover:bg-black/20 rounded-full p-0.5"
													>
														×
													</button>
												</div>
											) : null
										})}
									</div>
								)}
							</div>
						</div>

						{/* Supervisor Selection (Only for Agents) */}
						{formData.role === 'agent' && (
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Assign Supervisor
								</label>
								<select
									value={formData.supervisor_id}
									onChange={(e) =>
										setFormData({ ...formData, supervisor_id: e.target.value })
									}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
								>
									<option value="">Select Supervisor (Optional)</option>
									{supervisors.map((sup) => (
										<option key={sup.id} value={sup.id}>
											{sup.name}
										</option>
									))}
								</select>
							</div>
						)}

						{/* Channel Assignment */}
						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="block text-sm font-medium text-gray-700">
									Assign to Channel
								</label>
								{!initialData && (
									<label className="flex items-center gap-2 text-sm text-gray-600">
										<input
											type="checkbox"
											checked={formData.assign_to_all}
											onChange={(e) => {
												if (e.target.checked) {
													setFormData({
														...formData,
														assign_to_all: true,
														channels: availableChannels.map((c) => c.id),
													})
												} else {
													setFormData({
														...formData,
														assign_to_all: false,
														channels: [],
													})
												}
											}}
											className="rounded border-gray-300"
										/>
										Assign to all channels
									</label>
								)}
							</div>

							<div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
								{loadingChannels ? (
									<p className="text-sm text-gray-500">Loading channels...</p>
								) : availableChannels.length === 0 ? (
									<p className="text-sm text-gray-500">
										No channels configured. Please add channels first.
									</p>
								) : (
									<>
										{/* Group by channel type */}
										{['whatsapp', 'instagram', 'tiktok', 'messenger'].map(
											(type) => {
												const channelsOfType = availableChannels.filter(
													(c) => c.channel_type === type,
												)
												if (channelsOfType.length === 0) return null

												return (
													<div key={type}>
														<div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
															<ChannelIcon channel={type} size={16} />
															{type === 'whatsapp' && 'WhatsApp'}
															{type === 'instagram' && 'Instagram'}
															{type === 'tiktok' && 'TikTok'}
															{type === 'messenger' && 'Messenger'}
														</div>
														<div className="space-y-2">
															{channelsOfType.map((channel) => (
																<label
																	key={channel.id}
																	className={`flex items-center gap-3 p-3 bg-white rounded-lg border cursor-pointer transition ${
																		formData.channels.includes(channel.id)
																			? 'border-teal-500 bg-teal-50/50'
																			: 'border-gray-200 hover:border-teal-300'
																	}`}
																>
																	<input
																		type="checkbox"
																		checked={formData.channels.includes(
																			channel.id,
																		)}
																		onChange={() => toggleChannel(channel.id)}
																		className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
																	/>
																	<div className="flex items-center gap-2 flex-1">
																		<ChannelIcon
																			channel={channel.channel_type}
																			size={20}
																		/>
																		<div>
																			<p className="text-sm font-medium text-gray-900">
																				{channel.name}
																			</p>
																			<p className="text-xs text-gray-500 capitalize">
																				{channel.channel_type}
																			</p>
																		</div>
																	</div>
																</label>
															))}
														</div>
													</div>
												)
											},
										)}
									</>
								)}
							</div>
						</div>
					</div>

					{/* Footer */}
					<div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={loading}
							className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition text-sm disabled:opacity-50"
						>
							{loading
								? 'Saving...'
								: initialData
									? 'Update Agent'
									: 'Create Agent'}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}

// Team Modal Component (Create & Edit)
function TeamModal({
	agents,
	initialData,
	onClose,
	onSuccess,
}: {
	agents: Array<{ id: string; name: string; email: string; role: string }>
	initialData?: Team | null
	onClose: () => void
	onSuccess: () => void
}) {
	const [formData, setFormData] = useState({
		name: initialData?.name || '',
		description: initialData?.description || '',
		allow_auto_assign: initialData?.allow_auto_assign ?? true,
	})
	const [members, setMembers] = useState<TeamMember[]>(
		initialData?.members || [],
	)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [addingMember, setAddingMember] = useState(false)

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError('')
		setLoading(true)

		try {
			if (initialData) {
				// Update
				await teamsApi.update(initialData.id, formData)
			} else {
				// Create
				const res = await teamsApi.create(formData)
				// If creating and we have members to add, add them
				if (res.success && members.length > 0) {
					for (const member of members) {
						await teamsApi.addMember(res.payload.id, member.id)
					}
				}
			}
			toast.success(initialData ? 'Team updated' : 'Team created')
			onSuccess()
		} catch (err: any) {
			setError(err.message || 'Failed to save team')
		} finally {
			setLoading(false)
		}
	}

	const handleAddMember = async (userId: string) => {
		if (!initialData) {
			// For new teams, just add to local state
			const agent = agents.find((a) => a.id === userId)
			if (agent && !members.find((m) => m.id === userId)) {
				setMembers([
					...members,
					{ ...agent, active: true, joined_at: new Date().toISOString() },
				])
			}
			return
		}

		// For existing teams, call API
		setAddingMember(true)
		try {
			await teamsApi.addMember(initialData.id, userId)
			// Refresh team data
			const res = await teamsApi.get(initialData.id)
			if (res.success) {
				setMembers(res.payload.members || [])
			}
			toast.success('Member added')
		} catch (e) {
			toast.error('Failed to add member')
		} finally {
			setAddingMember(false)
		}
	}

	const handleRemoveMember = async (userId: string) => {
		if (!initialData) {
			// For new teams, just remove from local state
			setMembers(members.filter((m) => m.id !== userId))
			return
		}

		// For existing teams, call API
		try {
			await teamsApi.removeMember(initialData.id, userId)
			setMembers(members.filter((m) => m.id !== userId))
			toast.success('Member removed')
		} catch (e) {
			toast.error('Failed to remove member')
		}
	}

	const availableAgents = agents.filter(
		(a) => !members.find((m) => m.id === a.id),
	)

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
			<div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
				<form onSubmit={handleSubmit}>
					{/* Header */}
					<div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
						<h2 className="text-xl font-bold text-gray-900">
							{initialData ? 'Edit Team' : 'Create Team'}
						</h2>
						<button
							type="button"
							onClick={onClose}
							className="p-2 hover:bg-gray-100 rounded-lg transition"
						>
							<X size={20} />
						</button>
					</div>

					{/* Body */}
					<div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
						{error && (
							<div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
								{error}
							</div>
						)}

						{/* Team Name */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Team Name *
							</label>
							<input
								type="text"
								required
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
								placeholder="e.g. Sales Team"
							/>
						</div>

						{/* Description */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Description
							</label>
							<textarea
								value={formData.description}
								onChange={(e) =>
									setFormData({ ...formData, description: e.target.value })
								}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
								placeholder="Describe the team's purpose..."
								rows={3}
							/>
						</div>

						{/* Auto-assign Toggle */}
						<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
							<div>
								<p className="text-sm font-medium text-gray-700">
									Allow Auto-assign
								</p>
								<p className="text-xs text-gray-500">
									Automatically assign conversations to team members
								</p>
							</div>
							<button
								type="button"
								onClick={() =>
									setFormData({
										...formData,
										allow_auto_assign: !formData.allow_auto_assign,
									})
								}
								className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.allow_auto_assign ? 'bg-teal-500' : 'bg-gray-300'}`}
							>
								<span
									className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.allow_auto_assign ? 'translate-x-5' : 'translate-x-0'}`}
								/>
							</button>
						</div>

						{/* Team Members */}
						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="block text-sm font-medium text-gray-700">
									Team Members ({members.length})
								</label>
							</div>

							{/* Add Member Dropdown */}
							{availableAgents.length > 0 && (
								<select
									onChange={(e) => {
										if (e.target.value) {
											handleAddMember(e.target.value)
											e.target.value = ''
										}
									}}
									disabled={addingMember}
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm mb-3"
								>
									<option value="">+ Add team member...</option>
									{availableAgents.map((agent) => (
										<option key={agent.id} value={agent.id}>
											{agent.name} ({agent.email})
										</option>
									))}
								</select>
							)}

							{/* Members List */}
							<div className="space-y-2 max-h-48 overflow-y-auto">
								{members.length === 0 ? (
									<p className="text-sm text-gray-400 text-center py-4">
										No members yet
									</p>
								) : (
									members.map((member) => (
										<div
											key={member.id}
											className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
										>
											<div className="flex items-center gap-3">
												<div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-medium text-sm">
													{member.name.charAt(0).toUpperCase()}
												</div>
												<div>
													<p className="text-sm font-medium text-gray-900">
														{member.name}
													</p>
													<p className="text-xs text-gray-500">
														{member.email}
													</p>
												</div>
											</div>
											<button
												type="button"
												onClick={() => handleRemoveMember(member.id)}
												className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
											>
												<X size={14} />
											</button>
										</div>
									))
								)}
							</div>
						</div>
					</div>

					{/* Footer */}
					<div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={loading}
							className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition text-sm disabled:opacity-50"
						>
							{loading
								? 'Saving...'
								: initialData
									? 'Update Team'
									: 'Create Team'}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}
