// Apps Center - Marketplace / Add-ons
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
	Package,
	Search,
	Grid3X3,
	MessageSquare,
	Ticket,
	Radio,
	Users,
	FileText,
	BarChart3,
	Phone,
	Megaphone,
	Settings,
	Check,
	Workflow,
	Plus,
	Loader2,
	RefreshCw,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { API_BASE } from '@/lib/api'

export const Route = createFileRoute('/_app/apps/')({
	component: AppsPage,
})

interface AppCategory {
	id: string
	name: string
	slug: string
	icon: string
}

interface App {
	id: string
	installation_id?: string
	name: string
	slug: string
	author: string
	caption: string
	description?: string
	category: AppCategory
	status?: 'pending' | 'approved' | 'cancelled' | 'suspended'
	is_enabled?: boolean
	icon_url: string | null
	banner_url?: string | null
	version?: string
	is_featured?: boolean
	is_coming_soon?: boolean
	pricing_type?: string
	price?: number
	setting_url: string | null
	settings_new_tab: boolean
	installed_at?: string
}

// Icon mapping for categories
const categoryIcons: Record<string, React.ReactNode> = {
	Grid3X3: <Grid3X3 className="w-4 h-4" />,
	MessageSquare: <MessageSquare className="w-4 h-4" />,
	Ticket: <Ticket className="w-4 h-4" />,
	Radio: <Radio className="w-4 h-4" />,
	Users: <Users className="w-4 h-4" />,
	FileText: <FileText className="w-4 h-4" />,
	BarChart3: <BarChart3 className="w-4 h-4" />,
	Phone: <Phone className="w-4 h-4" />,
	Megaphone: <Megaphone className="w-4 h-4" />,
	Workflow: <Workflow className="w-4 h-4" />,
}

function getCategoryIcon(iconName: string | null): React.ReactNode {
	if (!iconName) return <Grid3X3 className="w-4 h-4" />
	return categoryIcons[iconName] || <Grid3X3 className="w-4 h-4" />
}

function AppsPage() {
	const routeParams = Route.useParams({ strict: false }) as { appId?: string }
	const appId =
		routeParams.appId ||
		(typeof localStorage !== 'undefined'
			? localStorage.getItem('scalechat_org_slug') || ''
			: '')
	const navigate = useNavigate()
	const [searchQuery, setSearchQuery] = useState('')
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<'installed' | 'explore'>(
		'installed',
	)

	// Data states
	const [categories, setCategories] = useState<AppCategory[]>([])
	const [installedApps, setInstalledApps] = useState<App[]>([])
	const [availableApps, setAvailableApps] = useState<App[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Fetch categories
	const fetchCategories = async () => {
		try {
			const response = await fetch(`${API_BASE}/app-center/categories`)
			const data = await response.json()
			if (data.success) {
				setCategories(data.categories)
			}
		} catch (err: any) {
			console.error('Error fetching categories:', err)
		}
	}

	// Fetch installed apps
	const fetchInstalledApps = async () => {
		try {
			const token = localStorage.getItem('scalechat_token')
			const response = await fetch(
				`${API_BASE}/app-center/installed`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			)
			const data = await response.json()
			if (data.success) {
				setInstalledApps(data.apps)
			}
		} catch (err: any) {
			console.error('Error fetching installed apps:', err)
		}
	}

	// Fetch available apps
	const fetchAvailableApps = async (category?: string, search?: string) => {
		try {
			const params = new URLSearchParams()
			if (category && category !== 'all') params.append('category', category)
			if (search) params.append('search', search)

			const response = await fetch(
				`${API_BASE}/app-center/apps?${params.toString()}`,
			)
			const data = await response.json()
			if (data.success) {
				setAvailableApps(data.apps)
			}
		} catch (err: any) {
			console.error('Error fetching available apps:', err)
		}
	}

	// Initial load
	useEffect(() => {
		const loadData = async () => {
			setLoading(true)
			setError(null)
			try {
				await Promise.all([
					fetchCategories(),
					fetchInstalledApps(),
					fetchAvailableApps(),
				])
			} catch (err: any) {
				setError(err.message)
			} finally {
				setLoading(false)
			}
		}
		loadData()
	}, [appId])

	// Refetch available apps when category changes
	useEffect(() => {
		if (activeTab === 'explore') {
			fetchAvailableApps(
				selectedCategory || undefined,
				searchQuery || undefined,
			)
		}
	}, [selectedCategory, activeTab])

	// Handle search
	const handleSearch = (query: string) => {
		setSearchQuery(query)
		if (activeTab === 'explore') {
			fetchAvailableApps(selectedCategory || undefined, query || undefined)
		}
	}

	// Install app
	const handleInstall = async (app: App) => {
		try {
			const token = localStorage.getItem('scalechat_token')
			const response = await fetch(`${API_BASE}/app-center/install`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					app_id: app.id,
					app_id_org: appId,
				}),
			})
			const data = await response.json()
			if (data.success) {
				await fetchInstalledApps()
				alert(`${app.name} has been installed!`)
			} else {
				alert(data.error || 'Failed to install app')
			}
		} catch (err: any) {
			alert('Error installing app: ' + err.message)
		}
	}

	// Filter installed apps based on search
	const filteredInstalledApps = installedApps.filter((app) => {
		const matchesSearch =
			app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			app.caption.toLowerCase().includes(searchQuery.toLowerCase())
		return matchesSearch
	})

	// Apps to display based on active tab
	const displayApps =
		activeTab === 'installed' ? filteredInstalledApps : availableApps

	// Check if app is already installed
	const isAppInstalled = (appId: string) => {
		return installedApps.some((installed) => installed.id === appId)
	}

	if (loading) {
		return (
			<main className="flex-1 overflow-y-auto h-full bg-muted/30 flex items-center justify-center">
				<div className="text-center">
					<Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
					<p className="text-gray-500">Loading Apps...</p>
				</div>
			</main>
		)
	}

	return (
		<main className="flex-1 overflow-y-auto h-full bg-muted/30">
			{/* Standard Page Header */}
			<PageHeader
				title="Apps Center"
				description="Discover and manage your apps"
				icon={<Package size={24} />}
				actions={
					<div className="flex items-center gap-2 lg:gap-3">
						<div className="relative w-full lg:w-80">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
							<input
								type='text'
								placeholder="Search apps..."
								value={searchQuery}
								onChange={(e) => handleSearch(e.target.value)}
								className="w-full pl-10 pr-4 py-2 lg:py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-sm"
							/>
						</div>
						<button
							onClick={() => {
								fetchInstalledApps()
								fetchAvailableApps()
							}}
							className="p-2 lg:p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex-shrink-0"
							title='Refresh'
						>
							<RefreshCw className="w-4 h-4 text-gray-500" />
						</button>
					</div>
				}
			/>

			<div className="max-w-[1600px] mx-auto px-4 lg:px-8 pb-8">
				<div className="flex flex-col lg:flex-row gap-8">
					{/* Sidebar - Horizontal scroll on mobile, vertical on desktop */}
					<div className="w-full lg:w-64 flex-shrink-0">
						<div className="bg-white rounded-2xl border border-gray-200 p-3 lg:p-4 lg:sticky lg:top-8 shadow-sm">
							{/* Manage Section */}
							<div className="mb-4 lg:mb-6">
								<h3 className="hidden lg:block text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
									Manage
								</h3>
								<button
									onClick={() => {
										setActiveTab('installed')
										setSelectedCategory(null)
									}}
									className={`w-full flex items-center gap-2 lg:gap-3 px-3 py-2 lg:py-2.5 rounded-xl text-sm font-medium transition-all ${
										activeTab === 'installed'
											? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
											: 'text-gray-600 hover:bg-gray-50'
									}`}
								>
									<Package className="w-4 h-4" />
									<span>Installed Apps</span>
									<span className="ml-auto text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-semibold">
										{installedApps.length}
									</span>
								</button>
							</div>

							{/* Explore Apps Section */}
							<div>
								<h3 className="hidden lg:block text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
									Explore Apps
								</h3>
								<div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
									{categories.map((category) => (
										<button
											key={category.id}
											onClick={() => {
												setActiveTab('explore')
												setSelectedCategory(category.slug)
											}}
											className={`flex-shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2 rounded-xl text-sm transition-all whitespace-nowrap ${
												activeTab === 'explore' &&
												selectedCategory === category.slug
													? 'bg-gray-100 text-gray-900 font-medium'
													: 'text-gray-600 hover:bg-gray-50'
											}`}
										>
											<span className='text-gray-400'>
												{getCategoryIcon(category.icon)}
											</span>
											<span>{category.name}</span>
										</button>
									))}
								</div>
							</div>
						</div>
					</div>

					{/* Main Content */}
					<div className="flex-1 min-w-0">
						{/* Title Bar */}
						<div className="flex items-center justify-between mb-4 lg:mb-6">
							<div className="flex items-center gap-2 lg:gap-3">
								<Package className="w-4 h-4 lg:w-5 lg:h-5 text-gray-400" />
								<h2 className="text-base lg:text-lg font-bold text-gray-900">
									{activeTab === 'installed'
										? 'Installed Apps'
										: 'Available Apps'}
								</h2>
							</div>
							<p className="text-xs lg:text-sm text-gray-500">
								{displayApps.length} {displayApps.length === 1 ? 'app' : 'apps'}
							</p>
						</div>

						{error && (
							<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
								{error}
							</div>
						)}

						{/* Apps Grid */}
						<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
							{displayApps.map((app) => (
								<AppCard
									key={app.installation_id || app.id}
									app={app}
									isInstalled={
										activeTab === 'installed' || isAppInstalled(app.id)
									}
									onViewDetail={() => navigateToApp(app)}
									onInstall={() => handleInstall(app)}
								/>
							))}
						</div>

						{displayApps.length === 0 && (
							<div className="text-center py-16">
								<Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
								<h3 className="text-lg font-semibold text-gray-600 mb-2">
									{activeTab === 'installed'
										? 'No apps installed'
										: 'No apps found'}
								</h3>
								<p className="text-sm text-gray-400">
									{activeTab === 'installed'
										? 'Explore available apps to get started'
										: 'Try adjusting your search or filters'}
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</main>
	)

	// Navigate to app detail
	function navigateToApp(app: App) {
		navigate({ to: `/apps/${app.slug}` })
	}
}

function AppCard({
	app,
	isInstalled,
	onViewDetail,
	onInstall,
}: {
	app: App
	isInstalled: boolean
	onViewDetail: () => void
	onInstall: () => void
}) {
	const [imageError, setImageError] = useState(false)

	return (
		<div
			onClick={onViewDetail}
			className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 group cursor-pointer active:scale-[0.98]"
		>
			{/* Category Badge */}
			<div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
				{getCategoryIcon(app.category?.icon)}
				<span>{app.category?.name || 'Uncategorized'}</span>
				{app.is_featured && (
					<span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shadow-sm">
						Featured
					</span>
				)}
			</div>

			{/* App Title */}
			<div className="flex items-center gap-3 mb-3">
				{!imageError && app.icon_url ? (
					<img
						src={app.icon_url}
						alt={`${app.name} icon`}
						className="w-10 h-10 rounded-xl object-cover shadow-sm group-hover:scale-105 transition-transform"
						onError={() => setImageError(true)}
					/>
				) : (
					<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
						<Package className="w-5 h-5 text-white" />
					</div>
				)}
				<h3 className="font-bold text-gray-900 text-base">{app.name}</h3>
			</div>

			{/* Status Badge */}
			<div className="mb-3">
				{isInstalled ? (
					app.is_enabled !== false ? (
						<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
							<Check className="w-3 h-3" />
							Installed
						</span>
					) : (
						<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full border border-gray-200">
							Disabled
						</span>
					)
				) : app.is_coming_soon ? (
					<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
						Coming Soon
					</span>
				) : (
					<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
						Available
					</span>
				)}
			</div>

			{/* Description */}
			<p className="text-sm text-gray-500 line-clamp-2 mb-4 min-h-[40px]">
				{app.caption}
			</p>

			{/* Actions */}
			<div className="flex justify-end gap-2 mt-auto pt-2">
				{isInstalled ? (
					<div className="group/btn flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold border border-gray-200 group-hover:bg-emerald-50 group-hover:text-emerald-700 group-hover:border-emerald-200 transition-all duration-300">
						<Settings className="w-4 h-4 transition-transform group-hover:rotate-90 duration-500" />
						<span>Manage</span>
					</div>
				) : app.is_coming_soon ? (
					<div className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-400 rounded-xl text-sm font-medium border border-gray-100">
						Coming Soon
					</div>
				) : (
					<button
						onClick={(e) => {
							e.stopPropagation()
							onInstall()
						}}
						className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 transition-all shadow-sm hover:shadow-md"
					>
						<Plus className="w-4 h-4" />
						Install
					</button>
				)}
			</div>
		</div>
	)
}
