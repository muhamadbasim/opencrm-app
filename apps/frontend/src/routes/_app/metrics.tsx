import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { metrics } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import {
	Activity,
	Brain,
	Route as RouteIcon,
	Clock,
	RefreshCw,
} from 'lucide-react'

export const Route = createFileRoute('/_app/metrics')({
	component: MetricsPage,
})

interface MetricsSummary {
	ai: {
		totalAnalyses: number
		averageConfidence: number
		sentimentDistribution: {
			positive: number
			neutral: number
			negative: number
		}
		intentDistribution: Record<string, number>
		escalationRate: number
		averageResponseTime: number
	}
	routing: {
		totalRouted: number
		successRate: number
		ruleDistribution: Record<string, number>
		averageRoutingTime: number
	}
	conversations: {
		totalMessages: number
		totalResolved: number
		averageMessagesPerConversation: number
	}
	period: string
}

function MetricsPage() {
	const [summary, setSummary] = useState<MetricsSummary | null>(null)
	const [period, setPeriod] = useState('24h')
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		loadMetrics()
	}, [period])

	const loadMetrics = async () => {
		setLoading(true)
		try {
			const data: any = await metrics.getSummary(period)
			setSummary(data)
		} catch (error) {
			console.error('Failed to load metrics:', error)
		} finally {
			setLoading(false)
		}
	}

	const actions = (
		<div className="flex items-center gap-2 lg:gap-3 w-full lg:w-auto">
			<div className="flex bg-gray-100 p-1 rounded-lg">
				{[
					{ id: '24h', label: '24h' },
					{ id: '7d', label: '7 Days' },
					{ id: '30d', label: '30 Days' },
				].map((range) => (
					<button
						key={range.id}
						onClick={() => setPeriod(range.id)}
						className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
							period === range.id
								? 'bg-white text-gray-950 shadow-sm'
								: 'text-gray-500 hover:text-gray-700'
						}`}
					>
						{range.label}
					</button>
				))}
			</div>
			<button
				onClick={loadMetrics}
				className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 bg-white shadow-sm"
				title="Refresh Metrics"
			>
				<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
			</button>
		</div>
	)

	return (
		<div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
			<PageHeader
				title="System Metrics"
				description="Deep dive into AI response confidence, routing efficiency, and system performance"
				icon={<Activity size={24} />}
				actions={actions}
			/>

			<div className="flex-1 overflow-y-auto px-4 lg:px-8 pb-8">
				{loading && !summary ? (
					<div className="h-full flex items-center justify-center">
						<div className="flex flex-col items-center gap-4">
							<RefreshCw className="animate-spin text-emerald-500" size={32} />
							<p className="text-gray-500 font-bold tracking-tight">
								Crunching metrics...
							</p>
						</div>
					</div>
				) : summary ? (
					<div className="space-y-8 max-w-7xl">
						{/* Overview Stats */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
								<div className="flex items-center gap-4 mb-4">
									<div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
										<Brain size={24} />
									</div>
									<div>
										<h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
											AI Analyses
										</h4>
										<p className="text-2xl font-black text-gray-900">
											{summary.ai.totalAnalyses.toLocaleString()}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
										<div
											className='bg-blue-500 h-full'
											style={{ width: `${summary.ai.averageConfidence}%` }}
										/>
									</div>
									<span className="text-xs font-bold text-blue-600">
										{summary.ai.averageConfidence}% confidence
									</span>
								</div>
							</div>

							<div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
								<div className="flex items-center gap-4 mb-4">
									<div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
										<RouteIcon size={24} />
									</div>
									<div>
										<h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
											Successful Routing
										</h4>
										<p className="text-2xl font-black text-gray-900">
											{summary.routing.successRate}%
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
										<div
											className='bg-emerald-500 h-full'
											style={{ width: `${summary.routing.successRate}%` }}
										/>
									</div>
									<span className="text-xs font-bold text-emerald-600">
										{summary.routing.totalRouted.toLocaleString()} events
									</span>
								</div>
							</div>

							<div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
								<div className="flex items-center gap-4 mb-4">
									<div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
										<Clock size={24} />
									</div>
									<div>
										<h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
											Avg Response
										</h4>
										<p className="text-2xl font-black text-gray-900">
											{summary.ai.averageResponseTime}ms
										</p>
									</div>
								</div>
								<div className="text-xs font-bold text-gray-400">
									System latency average
								</div>
							</div>
						</div>

						<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
							<div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
								<h3 className="text-lg font-bold text-gray-900 mb-6">
									AI Sentiment Distribution
								</h3>
								<div className="space-y-4">
									{Object.entries(summary.ai.sentimentDistribution).map(
										([key, value]) => (
											<div key={key} className="space-y-1">
												<div className="flex justify-between text-xs font-bold uppercase tracking-wider">
													<span className="text-gray-500">{key}</span>
													<span className="text-gray-900">{value}%</span>
												</div>
												<div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
													<div
														className={`h-full rounded-full ${
															key === 'positive'
																? 'bg-emerald-500'
																: key === 'negative'
																	? 'bg-red-500'
																	: 'bg-gray-400'
														}`}
														style={{ width: '${value}%' }}
													/>
												</div>
											</div>
										),
									)}
								</div>
							</div>

							<div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
								<h3 className="text-lg font-bold text-gray-900 mb-6">
									Routing Intent Distribution
								</h3>
								<div className="space-y-4">
									{Object.entries(summary.ai.intentDistribution).map(
										([key, value]) => (
											<div key={key} className="space-y-1">
												<div className="flex justify-between text-xs font-bold uppercase tracking-wider">
													<span className="text-gray-500">{key}</span>
													<span className="text-gray-900">{value}</span>
												</div>
												<div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
													<div
														className="bg-blue-600 h-full rounded-full"
														style={{
															width: `${(value / summary.ai.totalAnalyses) * 100}%`,
														}}
													/>
												</div>
											</div>
										),
									)}
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="flex-1 flex flex-col items-center justify-center py-20 opacity-50 space-y-4">
						<Activity size={48} className="text-gray-300" />
						<p className="text-gray-500 font-bold text-lg">
							No metrics available for this period
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
