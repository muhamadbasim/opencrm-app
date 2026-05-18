import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { LogOut, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { OpenCrmAvatar } from '@/components/opencrm/shared'
import { API_BASE } from '@/lib/api'
import {
	OPENCRM_GROUP_LABELS,
	OPENCRM_NAV_ITEMS,
	type OpenCrmNavItem,
} from '@/lib/opencrm-navigation'
import {
	extractNormalizedRole,
	getAllowedPrimaryPathsForRole,
} from '@/lib/role-access'

interface Agent {
	id: string
	email: string
	name: string
	role: string
}

interface Props {
	agent?: Agent | null
	onLogout?: () => Promise<void>
	isCollapsed?: boolean
	onClose?: () => void
}

function isItemVisibleForRole(item: OpenCrmNavItem, role: string | null | undefined) {
	const allowed = getAllowedPrimaryPathsForRole(role)
	if (!allowed) return true
	return allowed.includes(item.path)
}

export default function Sidebar({
	agent: agentProp,
	onLogout,
	onClose,
}: Props = {}) {
	const navigate = useNavigate()
	const location = useLocation()
	const [currentAgent, setCurrentAgent] = useState<Agent | null>(
		agentProp || null,
	)

	useEffect(() => {
		if (!agentProp) {
			const stored = localStorage.getItem('scalechat_user')
			if (!stored) return
			try {
				const parsed = JSON.parse(stored) as any
				const candidate =
					parsed && typeof parsed.user === 'object' && parsed.user
						? parsed.user
						: parsed
				if (!candidate || typeof candidate !== 'object') return

				setCurrentAgent({
					id: String(candidate.id || ''),
					email: String(candidate.email || ''),
					name: String(candidate.name || candidate.email || 'User'),
					role: extractNormalizedRole(candidate),
				})
			} catch {
				// ignore invalid local storage
			}
			return
		}

		setCurrentAgent({
			...agentProp,
			role: extractNormalizedRole(agentProp),
		})
	}, [agentProp])

	const menuGroups = useMemo(() => {
		const visibleItems = OPENCRM_NAV_ITEMS.filter((item) =>
			isItemVisibleForRole(item, currentAgent?.role),
		)

		return (Object.keys(OPENCRM_GROUP_LABELS) as Array<
			keyof typeof OPENCRM_GROUP_LABELS
		>).map((group) => ({
			group,
			label: OPENCRM_GROUP_LABELS[group],
			items: visibleItems.filter((item) => item.group === group),
		}))
	}, [currentAgent?.role])

	const handleLogout = async () => {
		if (onLogout) {
			await onLogout()
			return
		}

		const token = localStorage.getItem('scalechat_token')
		if (token) {
			try {
				await fetch(`${API_BASE}/auth/logout`, {
					method: 'POST',
					credentials: 'include',
					headers: { Authorization: `Bearer ${token}` },
				})
			} catch {
				// noop
			}
		}

		localStorage.clear()
		document.cookie.split(';').forEach((cookiePart) => {
			document.cookie = cookiePart
				.replace(/^ +/, '')
				.replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/')
		})
		navigate({ to: '/login', replace: true })
	}

	const displayName =
		String(currentAgent?.name || '').trim() ||
		String(currentAgent?.email || '')
			.split('@')[0]
			.trim() ||
		'User'

	return (
		<aside className="flex h-full w-72 flex-col border-r border-border bg-card text-card-foreground">
			<div className="flex items-center justify-between border-b border-border px-4 py-4">
				<div className="flex min-w-0 items-center gap-3">
					<div className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
						O
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold">OpenCRM</p>
						<p className="truncate text-[11px] text-muted-foreground">
							WhatsApp Workspace
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
					aria-label="Close sidebar"
				>
					<X size={18} />
				</button>
			</div>

			<nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
				{menuGroups.map((group) => {
					if (group.items.length === 0) return null
					return (
						<div key={group.group}>
							<p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
								{group.label}
							</p>
							<div className="space-y-1">
								{group.items.map((item) => {
									const isActive =
										location.pathname === item.path ||
										location.pathname.startsWith(`${item.path}/`)
									const Icon = item.icon
									return (
										<Link
											key={item.path}
											to={item.path}
											className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
												isActive
													? 'bg-primary/15 text-primary'
													: 'text-muted-foreground hover:bg-muted hover:text-foreground'
											}`}
										>
											<Icon size={16} />
											<span>{item.label}</span>
											{item.badge ? (
												<span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
													{item.badge}
												</span>
											) : null}
										</Link>
									)
								})}
							</div>
						</div>
					)
				})}
			</nav>

			<div className="border-t border-border p-3">
				<div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
					<OpenCrmAvatar name={displayName} online size={30} />
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-semibold">{displayName}</p>
						<p className="truncate text-xs text-muted-foreground">
							{currentAgent?.role || 'Admin'}
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={handleLogout}
					className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/15"
				>
					<LogOut size={15} />
					Logout
				</button>
			</div>
		</aside>
	)
}
