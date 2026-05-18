import { Link, useLocation } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { useMemo } from 'react'
import { useAppContext } from '@/routes/_app'
import { OPENCRM_NAV_ITEMS } from '@/lib/opencrm-navigation'
import { getAllowedPrimaryPathsForRole } from '@/lib/role-access'

export default function BottomNav({
	onMenuClick,
}: {
	onMenuClick?: () => void
}) {
	const location = useLocation()
	const { agent } = useAppContext()
	const allowedPaths = getAllowedPrimaryPathsForRole(agent?.role)

	const mobileItems = useMemo(() => {
		const preferred = ['/dashboard', '/chat', '/customers', '/flows']
		const scoped = OPENCRM_NAV_ITEMS.filter((item) => preferred.includes(item.path))
		if (!allowedPaths) return scoped
		return scoped.filter((item) => allowedPaths.includes(item.path))
	}, [allowedPaths])

	return (
		<div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-card/95 px-2 backdrop-blur lg:hidden">
			{mobileItems.map((item) => {
				const Icon = item.icon
				const isActive = location.pathname === item.path
				return (
					<Link
						key={item.path}
						to={item.path}
						className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 ${
							isActive ? 'text-primary' : 'text-muted-foreground'
						}`}
					>
						<Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
						<span className="truncate text-[10px] font-semibold">{item.label}</span>
					</Link>
				)
			})}
			<button
				type="button"
				onClick={onMenuClick}
				className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-muted-foreground"
			>
				<Menu size={19} />
				<span className="truncate text-[10px] font-semibold">Menu</span>
			</button>
		</div>
	)
}
