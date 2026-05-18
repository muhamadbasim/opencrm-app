import type { LucideIcon } from 'lucide-react'
import {
	BookOpen,
	Bot,
	LayoutDashboard,
	Megaphone,
	MessagesSquare,
	Network,
	Package,
	Settings,
	ShoppingCart,
	Shuffle,
	Users,
	WandSparkles,
} from 'lucide-react'

export type OpenCrmNavGroup = 'operasional' | 'data' | 'outreach' | 'otomasi'

export type OpenCrmNavItem = {
	id: string
	label: string
	path: string
	group: OpenCrmNavGroup
	icon: LucideIcon
	badge?: string
}

export const OPENCRM_NAV_ITEMS: OpenCrmNavItem[] = [
	{
		id: 'dashboard',
		label: 'Dashboard',
		path: '/dashboard',
		group: 'operasional',
		icon: LayoutDashboard,
	},
	{
		id: 'inbox',
		label: 'Inbox',
		path: '/chat',
		group: 'operasional',
		icon: MessagesSquare,
	},
	{
		id: 'handover',
		label: 'Handover',
		path: '/handover',
		group: 'operasional',
		icon: Shuffle,
	},
	{
		id: 'customers',
		label: 'Pelanggan',
		path: '/customers',
		group: 'data',
		icon: Users,
	},
	{
		id: 'orders',
		label: 'Orders',
		path: '/orders',
		group: 'operasional',
		icon: ShoppingCart,
	},
	{
		id: 'products',
		label: 'Products',
		path: '/products',
		group: 'data',
		icon: Package,
	},
	{
		id: 'broadcast',
		label: 'Broadcast',
		path: '/broadcast',
		group: 'outreach',
		icon: Megaphone,
	},
	{
		id: 'workflow',
		label: 'Workflow',
		path: '/flows',
		group: 'otomasi',
		icon: Network,
	},
	{
		id: 'ai-agents',
		label: 'AI Agents',
		path: '/ai-agents',
		group: 'otomasi',
		icon: Bot,
	},
	{
		id: 'ai-playground',
		label: 'AI Playground',
		path: '/ai',
		group: 'otomasi',
		icon: WandSparkles,
	},
	{
		id: 'knowledge',
		label: 'Knowledge Base',
		path: '/knowledge',
		group: 'otomasi',
		icon: BookOpen,
	},
	{
		id: 'settings',
		label: 'Settings',
		path: '/settings',
		group: 'otomasi',
		icon: Settings,
	},
]

const OPENCRM_EXTRA_ALLOWED_PATHS = ['/channels/whatsapp']

export const OPENCRM_ALLOWED_PATHS = [
	...OPENCRM_NAV_ITEMS.map((item) => item.path),
	...OPENCRM_EXTRA_ALLOWED_PATHS,
]

export function normalizeOpenCrmPath(pathname: string): string {
	if (!pathname) return '/'
	if (pathname === '/') return '/'
	return pathname.replace(/\/+$/, '') || '/'
}

export function isOpenCrmAllowedPath(pathname: string): boolean {
	const normalized = normalizeOpenCrmPath(pathname)
	return OPENCRM_ALLOWED_PATHS.some(
		(path) => normalized === path || normalized.startsWith(`${path}/`),
	)
}

export const OPENCRM_GROUP_LABELS: Record<OpenCrmNavGroup, string> = {
	operasional: 'Operasional',
	data: 'Data',
	outreach: 'Outreach',
	otomasi: 'Otomasi',
}
