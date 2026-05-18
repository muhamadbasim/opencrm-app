// App Detail Page
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
	Package,
	ArrowLeft,
	Settings,
	Power,
	Trash2,
	User,
	Info,
	ExternalLink,
	Check,
	Loader2,
	Clock,
	Grid3X3,
	MessageSquare,
	Ticket,
	Radio,
	Users,
	FileText,
	BarChart3,
	Phone,
	Megaphone,
	Workflow,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { API_BASE } from '@/lib/api'

export const Route = createFileRoute('/_app/apps/$appSlug')({
	component: AppDetailPage,
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
	permissions?: string[]
}

// Icon mapping for categories
const categoryIcons: Record<string, React.ReactNode> = {
	Grid3X3: <Grid3X3 className="w-5 h-5" />,
	MessageSquare: <MessageSquare className="w-5 h-5" />,
	Ticket: <Ticket className="w-5 h-5" />,
	Radio: <Radio className="w-5 h-5" />,
	Users: <Users className="w-5 h-5" />,
	FileText: <FileText className="w-5 h-5" />,
	BarChart3: <BarChart3 className="w-5 h-5" />,
	Phone: <Phone className="w-5 h-5" />,
	Megaphone: <Megaphone className="w-5 h-5" />,
	Workflow: <Workflow className="w-5 h-5" />,
}

function getCategoryIcon(iconName: string | null): React.ReactNode {
	if (!iconName) return <Grid3X3 className="w-5 h-5" />
	return categoryIcons[iconName] || <Grid3X3 className="w-5 h-5" />
}

function AppDetailPage() {
	const routeParams = Route.useParams({ strict: false }) as {
		appId?: string
		appSlug: string
	}
	const { appSlug } = routeParams
	const appId =
		routeParams.appId ||
		(typeof localStorage !== 'undefined'
			? localStorage.getItem('scalechat_org_slug') || ''
			: '')
	const navigate = useNavigate()

	const [app, setApp] = useState<App | null>(null)
	const [installation, setInstallation] = useState<any>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isEnabled, setIsEnabled] = useState(true)
	const [imageError, setImageError] = useState(false)
	const [actionLoading, setActionLoading] = useState(false)

	// Fetch app details
	useEffect(() => {
		const fetchApp = async () => {
			setLoading(true)
			try {
				// Fetch app details
				const appRes = await fetch(`${API_BASE}/app-center/apps/${appSlug}`)
				const appData = await appRes.json()

				if (!appData.success) {
					setError('App not found')
					return
				}

				setApp(appData.app)

				// Check if installed
				const token = localStorage.getItem('scalechat_token')
				const installedRes = await fetch(
					`${API_BASE}/app-center/installed`,
					{
						headers: { Authorization: `Bearer ${token}` },
					},
				)
				const installedData = await installedRes.json()

				if (installedData.success) {
					const installed = installedData.apps.find(
						(a: any) => a.slug === appSlug,
					)
					if (installed) {
						setInstallation(installed)
						setIsEnabled(installed.is_enabled !== false)
					}
				}
			} catch (err: any) {
				setError(err.message)
			} finally {
				setLoading(false)
			}
		}

		fetchApp()
	}, [appSlug, appId])

	// Install app
	const handleInstall = async () => {
		if (!app) return
		setActionLoading(true)

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
				// Refresh page to get installation data
				window.location.reload()
			} else {
				alert(data.error || 'Failed to install app')
			}
		} catch (err: any) {
			alert('Error installing app: ' + err.message)
		} finally {
			setActionLoading(false)
		}
	}

	// Uninstall app
	const handleUninstall = async () => {
		if (!installation) return
		if (!confirm('Are you sure you want to uninstall this app?')) return

		setActionLoading(true)
		try {
			const token = localStorage.getItem('scalechat_token')
			const response = await fetch(
				`${API_BASE}/app-center/uninstall/${installation.installation_id}`,
				{
					method: 'DELETE',
					headers: { Authorization: `Bearer ${token}` },
				},
			)
			const data = await response.json()
			if (data.success) {
				navigate({ to: '/apps' })
			} else {
				alert(data.error || 'Failed to uninstall app')
			}
		} catch (err: any) {
			alert('Error uninstalling app: ' + err.message)
		} finally {
			setActionLoading(false)
		}
	}

	// Toggle app
	const handleToggle = async () => {
		if (!installation) return

		const newValue = !isEnabled
		setIsEnabled(newValue)

		try {
			const token = localStorage.getItem('scalechat_token')
			await fetch(
				`${API_BASE}/app-center/toggle/${installation.installation_id}`,
				{
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ is_enabled: newValue }),
				},
			)
		} catch (err: any) {
			setIsEnabled(!newValue) // Revert
			alert('Error toggling app: ' + err.message)
		}
	}

	// Open external settings
	const handleOpenSettings = () => {
		if (app?.setting_url && app.setting_url !== '#') {
			window.open(app.setting_url, app.settings_new_tab ? '_blank' : '_self')
		}
	}

	if (loading) {
		return (
			<main className="flex-1 overflow-y-auto h-full bg-gray-50/30 flex items-center justify-center">
				<div className="text-center">
					<Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
					<p className="text-gray-500">Loading App Details...</p>
				</div>
			</main>
		)
	}

	if (error || !app) {
		return (
			<main className="flex-1 overflow-y-auto h-full bg-gray-50/30 flex items-center justify-center">
				<div className="text-center">
					<Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
					<h3 className="text-lg font-semibold text-gray-600 mb-2">
						App Not Found
					</h3>
					<p className="text-sm text-gray-400 mb-4">
						{error || 'The requested app could not be found'}
					</p>
					<button
						onClick={() => navigate({ to: '/apps' })}
						className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
					>
						Back to Apps
					</button>
				</div>
			</main>
		)
	}

	return (
		<main className="flex-1 overflow-y-auto h-full bg-gray-50/30">
			{/* Page Header */}
			<PageHeader
				title={app.name}
				description={app.caption}
				icon={
					!imageError && app.icon_url ? (
						<img
							src={app.icon_url}
							alt={`${app.name} icon`}
							className="w-8 h-8 rounded-lg object-cover"
							onError={() => setImageError(true)}
						/>
					) : (
						<Package size={24} />
					)
				}
				actions={
					<button
						onClick={() => navigate({ to: '/apps' })}
						className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
					>
						<ArrowLeft className="w-4 h-4" />
						Back to Apps
					</button>
				}
			/>

			<div className="max-w-4xl mx-auto px-4 lg:px-8 pb-8">
				{/* Status Card */}
				<div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
					<div className="flex items-start gap-6">
						{/* App Icon */}
						<div className="flex-shrink-0">
							{!imageError && app.icon_url ? (
								<img
									src={app.icon_url}
									alt={'${app.name} icon'}
									className="w-20 h-20 rounded-2xl object-cover shadow-lg"
									onError={() => setImageError(true)}
								/>
							) : (
								<div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
									<Package className="w-10 h-10 text-white" />
								</div>
							)}
						</div>

						{/* App Info */}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-3 mb-2">
								<h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
								{app.is_featured && (
									<span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
										Featured
									</span>
								)}
								{app.is_coming_soon && (
									<span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
										Coming Soon
									</span>
								)}
							</div>

							<div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
								<div className="flex items-center gap-1.5">
									{getCategoryIcon(app.category?.icon)}
									<span>{app.category?.name || 'Uncategorized'}</span>
								</div>
								<div className="flex items-center gap-1.5">
									<User className="w-4 h-4" />
									<span>by {app.author}</span>
								</div>
								{app.version && (
									<div className="flex items-center gap-1.5">
										<Info className='w-4 h-4' />
										<span>v{app.version}</span>
									</div>
								)}
							</div>

							{/* Status Badge */}
							<div className="mb-4">
								{installation ? (
									isEnabled ? (
										<span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-full border border-emerald-200">
											<Check className='w-4 h-4' />
											Installed & Active
										</span>
									) : (
										<span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-full border border-gray-200">
											Installed (Disabled)
										</span>
									)
								) : app.is_coming_soon ? (
									<span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-semibold rounded-full border border-amber-200">
										<Clock className='w-4 h-4' />
										Coming Soon
									</span>
								) : (
									<span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-semibold rounded-full border border-blue-200">
										Available
									</span>
								)}
							</div>

							{/* Action Buttons */}
							<div className="flex items-center gap-3">
								{!installation ? (
									app.is_coming_soon ? (
										<button
											disabled
											className="px-6 py-2.5 bg-gray-100 text-gray-400 rounded-xl font-medium cursor-not-allowed"
										>
											Coming Soon
										</button>
									) : (
										<button
											onClick={handleInstall}
											disabled={actionLoading}
											className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
										>
											{actionLoading ? 'Installing...' : 'Install App'}
										</button>
									)
								) : (
									<>
										{app.setting_url && app.setting_url !== '#' && (
											<button
												onClick={handleOpenSettings}
												className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
											>
												<ExternalLink className='w-4 h-4' />
												Open Settings
											</button>
										)}
										<button
											onClick={handleUninstall}
											disabled={actionLoading}
											className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
										>
											<Trash2 className='w-4 h-4' />
											Uninstall
										</button>
									</>
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Description Section */}
				<div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
					<h2 className="text-lg font-bold text-gray-900 mb-4">
						About this App
					</h2>
					<p className="text-gray-600 leading-relaxed">
						{app.description || app.caption}
					</p>
				</div>

				{/* App Status Toggle (for installed apps) */}
				{installation && (
					<div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
						<h2 className="text-lg font-bold text-gray-900 mb-4">
							App Settings
						</h2>

						<div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
							<div className="flex items-center gap-3">
								<Power
									className={`w-5 h-5 ${isEnabled ? 'text-emerald-500' : 'text-gray-400'}`}
								/>
								<div>
									<p className="font-medium text-gray-900">App Status</p>
									<p className="text-sm text-gray-500">
										{isEnabled
											? 'App is currently active and running'
											: 'App is disabled and not running'}
									</p>
								</div>
							</div>
							<button
								onClick={handleToggle}
								className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${isEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
							>
								<span
									className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`}
								/>
							</button>
						</div>

						{installation.installed_at && (
							<div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
								<Clock className="w-4 h-4" />
								<span>
									Installed on{' '}
									{new Date(installation.installed_at).toLocaleDateString()}
								</span>
							</div>
						)}
					</div>
				)}

				{/* Technical Info */}
				<div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
					<h2 className="text-lg font-bold text-gray-900 mb-4">
						Technical Information
					</h2>

					<div className="space-y-4">
						<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
							<Info className="w-5 h-5 text-gray-400" />
							<div>
								<p className="text-sm text-gray-500">App Slug</p>
								<code className="text-sm font-mono bg-gray-200 px-2 py-0.5 rounded">
									{app.slug}
								</code>
							</div>
						</div>

						<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
							<Package className="w-5 h-5 text-gray-400" />
							<div>
								<p className="text-sm text-gray-500">Pricing</p>
								<p className="font-medium text-gray-900">
									{app.pricing_type === 'free'
										? 'Free'
										: app.pricing_type === 'paid'
											? '$${app.price}'
											: 'Freemium'}
								</p>
							</div>
						</div>

						<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
							<User className="w-5 h-5 text-gray-400" />
							<div>
								<p className="text-sm text-gray-500">Developer</p>
								<p className="font-medium text-gray-900">{app.author}</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</main>
	)
}
