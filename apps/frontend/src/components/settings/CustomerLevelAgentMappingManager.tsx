import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Bot, Crown, Gem, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { chatbots, customers } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'

type CustomerLevelKey = 'vip' | 'premium' | 'basic'

type LevelDefinition = {
	id: CustomerLevelKey
	label: string
	minimum_total_order: number
}

type LevelSettings = {
	levels: LevelDefinition[]
	mappings: Record<CustomerLevelKey, string | null>
}

type MappingForm = Record<CustomerLevelKey, string>

type AIAgentOption = {
	id: string
	name: string
}

const DEFAULT_LEVELS: LevelDefinition[] = [
	{
		id: 'vip',
		label: 'VIP',
		minimum_total_order: 20_000_000,
	},
	{
		id: 'premium',
		label: 'Premium',
		minimum_total_order: 10_000_000,
	},
	{
		id: 'basic',
		label: 'Basic',
		minimum_total_order: 0,
	},
]

const EMPTY_FORM: MappingForm = {
	vip: '',
	premium: '',
	basic: '',
}

const LEVEL_ORDER: CustomerLevelKey[] = ['vip', 'premium', 'basic']

const LEVEL_ICON_MAP: Record<CustomerLevelKey, typeof Crown> = {
	vip: Crown,
	premium: Gem,
	basic: Sparkles,
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('id-ID', {
	style: 'currency',
	currency: 'IDR',
	maximumFractionDigits: 0,
})

function extractPayload<T>(value: unknown): T {
	const wrapped = value as { payload?: T; data?: T }
	if (wrapped?.payload !== undefined) return wrapped.payload
	if (wrapped?.data !== undefined) return wrapped.data
	return value as T
}

function extractPayloadArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value
	if (!value || typeof value !== 'object' || Array.isArray(value)) return []

	const wrapped = value as {
		payload?: unknown
		data?: unknown
	}

	if (Array.isArray(wrapped.payload)) return wrapped.payload

	if (Array.isArray(wrapped.data)) return wrapped.data

	const nestedData = wrapped.data
	if (
		nestedData &&
		typeof nestedData === 'object' &&
		!Array.isArray(nestedData)
	) {
		const nested = nestedData as { data?: unknown }
		if (Array.isArray(nested.data)) return nested.data
	}

	return []
}

function normalizeMappings(value: unknown): Record<CustomerLevelKey, string | null> {
	const source =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {}

	const toMappedId = (key: CustomerLevelKey) => {
		const raw = source[key]
		if (typeof raw !== 'string') return null
		const normalized = raw.trim()
		return normalized.length > 0 ? normalized : null
	}

	return {
		vip: toMappedId('vip'),
		premium: toMappedId('premium'),
		basic: toMappedId('basic'),
	}
}

function toFormMappings(value: Record<CustomerLevelKey, string | null>): MappingForm {
	return {
		vip: value.vip || '',
		premium: value.premium || '',
		basic: value.basic || '',
	}
}

export default function CustomerLevelAgentMappingManager() {
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [settings, setSettings] = useState<LevelSettings>({
		levels: DEFAULT_LEVELS,
		mappings: { vip: null, premium: null, basic: null },
	})
	const [mappingForm, setMappingForm] = useState<MappingForm>(EMPTY_FORM)
	const [aiAgentOptions, setAiAgentOptions] = useState<AIAgentOption[]>([])

	const orderedLevels = useMemo(() => {
		const source =
			Array.isArray(settings.levels) && settings.levels.length > 0
				? settings.levels
				: DEFAULT_LEVELS
		return [...source].sort(
			(a, b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id),
		)
	}, [settings.levels])

	const hasUnsavedChanges = useMemo(() => {
		return LEVEL_ORDER.some((key) => {
			const currentValue = settings.mappings[key] || ''
			const formValue = mappingForm[key] || ''
			return currentValue !== formValue
		})
	}, [mappingForm, settings.mappings])

	const loadAll = async () => {
		setLoading(true)
		try {
			const [settingsResponse, aiAgentsResponse] = await Promise.all([
				customers.levels.getSettings(),
				chatbots.list(),
			])

			const settingsPayload = extractPayload<Partial<LevelSettings>>(settingsResponse)
			const nextSettings: LevelSettings = {
				levels:
					Array.isArray(settingsPayload?.levels) &&
					settingsPayload.levels.length > 0
						? (settingsPayload.levels as LevelDefinition[])
						: DEFAULT_LEVELS,
				mappings: normalizeMappings(settingsPayload?.mappings),
			}

			const aiAgentRowsRaw = extractPayloadArray(aiAgentsResponse)
			const nextAiAgents = (Array.isArray(aiAgentRowsRaw) ? aiAgentRowsRaw : [])
				.map((item) => {
					if (!item || typeof item !== 'object') return null
					const record = item as Record<string, unknown>
					const id = String(
						record.personaId ||
							record.recordId ||
							record.databaseId ||
							record.uuid ||
							record.id ||
							'',
					).trim()
					if (!id) return null
					return {
						id,
						name:
							String(record.name || record.label || 'Unnamed AI Agent').trim() ||
							'Unnamed AI Agent',
					}
				})
				.filter((item): item is AIAgentOption => Boolean(item))

			setSettings(nextSettings)
			setMappingForm(toFormMappings(nextSettings.mappings))
			setAiAgentOptions(nextAiAgents)
		} catch (error) {
			console.error('Failed to load customer level mapping settings:', error)
			toast.error('Failed to load customer level mapping settings')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void loadAll()
	}, [])

	const saveMappings = async () => {
		setSaving(true)
		try {
			const response = await customers.levels.updateSettings({
				vip: mappingForm.vip || null,
				premium: mappingForm.premium || null,
				basic: mappingForm.basic || null,
			})
			const payload = extractPayload<Partial<LevelSettings>>(response)
			const nextMappings = normalizeMappings(payload?.mappings)
			setSettings((previous) => ({
				levels:
					Array.isArray(payload?.levels) && payload.levels.length > 0
						? (payload.levels as LevelDefinition[])
						: previous.levels,
				mappings: nextMappings,
			}))
			setMappingForm(toFormMappings(nextMappings))
			toast.success('Customer level mapping berhasil disimpan')
		} catch (error) {
			console.error('Failed to save customer level mapping:', error)
			toast.error('Failed to save customer level mapping')
		} finally {
			setSaving(false)
		}
	}

	return (
		<Card className="border-gray-100 shadow-sm overflow-hidden">
			<CardHeader className="bg-gray-50/50 border-b border-gray-100 px-6 py-4">
				<div className="flex items-center gap-2">
					<Bot size={20} className="text-emerald-600" />
					<CardTitle className="text-lg font-bold">
						Customer Level to AI Agent Mapping
					</CardTitle>
				</div>
				<CardDescription>
					Default level dihitung dari total order paid customer, lalu diarahkan ke
					AI agent sesuai mapping.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6 p-6">
				{loading ? (
					<div className="flex items-center justify-center py-10">
						<div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
					</div>
				) : (
					<>
						<div className="grid gap-3 md:grid-cols-3">
							{orderedLevels.map((level) => {
								const Icon = LEVEL_ICON_MAP[level.id]
								return (
									<div
										key={level.id}
										className="rounded-xl border border-gray-100 bg-white p-3"
									>
										<div className="mb-1 flex items-center gap-2">
											<Icon size={16} className="text-emerald-600" />
											<p className="text-sm font-semibold text-gray-900">
												{level.label}
											</p>
										</div>
										<p className="text-xs text-gray-500">
											Total order &gt;{' '}
											<span className="font-semibold text-gray-700">
												{CURRENCY_FORMATTER.format(level.minimum_total_order)}
											</span>
										</p>
									</div>
								)
							})}
						</div>

						<div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="text-sm font-semibold text-gray-900">
									Assign AI Agent Per Level
								</p>
								<a
									href="/ai-agents"
									className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
								>
									Create AI Agent
									<ArrowUpRight size={13} />
								</a>
							</div>
							{aiAgentOptions.length === 0 ? (
								<div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">
									Belum ada AI Agent.
								</div>
							) : null}
							{orderedLevels.map((level) => (
								<div
									key={level.id}
									className="grid gap-2 rounded-lg border border-gray-100 p-3 md:grid-cols-[120px_1fr]"
								>
									<div className="flex items-center text-sm font-semibold text-gray-800">
										{level.label}
									</div>
									<select
										value={mappingForm[level.id]}
										onChange={(event) =>
											setMappingForm((previous) => ({
												...previous,
												[level.id]: event.target.value,
											}))
										}
										className="h-10 rounded-md border border-input bg-background px-3 text-sm"
									>
										<option value="">Pilih AI Agent</option>
										{aiAgentOptions.map((agent) => (
											<option key={agent.id} value={agent.id}>
												{agent.name}
											</option>
										))}
									</select>
								</div>
							))}
							<Button
								onClick={() => void saveMappings()}
								disabled={saving || !hasUnsavedChanges}
								className="bg-emerald-500 hover:bg-emerald-600 text-white"
							>
								<Save size={14} className="mr-2" />
								Save Mapping
							</Button>
						</div>

					</>
				)}
			</CardContent>
		</Card>
	)
}
