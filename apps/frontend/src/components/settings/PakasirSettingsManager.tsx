import { Copy, Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { commerce } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type PakasirSettingsPayload = {
	mode: 'live' | 'sandbox'
	base_url: string
	project_slug: string | null
	redirect_url: string | null
	payment_methods: Array<{ id: string; label: string; provider: string }>
	api_key_configured: boolean
	api_key_masked: string | null
	webhook_url: string
}

function extractData<T>(response: unknown): T {
	const payload = response as { data?: T }
	if (payload && payload.data !== undefined) return payload.data
	return response as T
}

export default function PakasirSettingsManager() {
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [mode, setMode] = useState<'live' | 'sandbox'>('sandbox')
	const [baseUrl, setBaseUrl] = useState('')
	const [projectSlug, setProjectSlug] = useState('')
	const [redirectUrl, setRedirectUrl] = useState('')
	const [paymentMethodsText, setPaymentMethodsText] = useState('')
	const [apiKeyInput, setApiKeyInput] = useState('')
	const [clearApiKey, setClearApiKey] = useState(false)
	const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null)
	const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
	const [webhookUrl, setWebhookUrl] = useState('')

	const paymentMethodPreview = useMemo(() => {
		return paymentMethodsText
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean)
	}, [paymentMethodsText])

	const loadSettings = async () => {
		setLoading(true)
		try {
			const response = await commerce.getPakasirSettings()
			const payload = extractData<PakasirSettingsPayload>(response)
			setMode(payload.mode || 'sandbox')
			setBaseUrl(payload.base_url || '')
			setProjectSlug(payload.project_slug || '')
			setRedirectUrl(payload.redirect_url || '')
			setPaymentMethodsText((payload.payment_methods || []).map((method) => method.id).join(', '))
			setApiKeyConfigured(Boolean(payload.api_key_configured))
			setApiKeyMasked(payload.api_key_masked || null)
			setWebhookUrl(payload.webhook_url || '')
			setApiKeyInput('')
			setClearApiKey(false)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal memuat settings Pakasir')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void loadSettings()
	}, [])

	const saveSettings = async () => {
		setSaving(true)
		try {
			const payload: Record<string, unknown> = {
				mode,
				base_url: baseUrl.trim(),
				project_slug: projectSlug.trim(),
				redirect_url: redirectUrl.trim(),
				payment_methods: paymentMethodsText,
			}

			if (clearApiKey) {
				payload.api_key = ''
			} else if (apiKeyInput.trim()) {
				payload.api_key = apiKeyInput.trim()
			}

			await commerce.updatePakasirSettings(payload)
			toast.success('Settings Pakasir berhasil disimpan')
			await loadSettings()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal menyimpan settings Pakasir')
		} finally {
			setSaving(false)
		}
	}

	const copyWebhookUrl = async () => {
		if (!webhookUrl) return
		try {
			await navigator.clipboard.writeText(webhookUrl)
			toast.success('Webhook URL disalin')
		} catch {
			toast.error('Gagal menyalin webhook URL')
		}
	}

	if (loading) {
		return (
			<Card>
				<CardContent className="flex h-52 items-center justify-center text-sm text-muted-foreground">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					Memuat settings Pakasir...
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className="border-gray-100 shadow-sm overflow-hidden">
			<CardHeader className="bg-gray-50/50 border-b border-gray-100 px-6 py-4">
				<div className="flex items-center justify-between gap-2">
					<div>
						<CardTitle className="text-lg font-bold">Pakasir Settings</CardTitle>
						<CardDescription>
							Konfigurasi payment gateway Pakasir per app.
						</CardDescription>
					</div>
					<Badge
						variant="outline"
						className={
							apiKeyConfigured
								? 'text-emerald-700 border-emerald-500/30 bg-emerald-500/10'
								: 'text-amber-700 border-amber-500/30 bg-amber-500/10'
						}
					>
						{apiKeyConfigured ? 'API Key Configured' : 'API Key Missing'}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="p-6 space-y-4">
				<div className="grid gap-2">
					<label className="text-xs font-black uppercase tracking-widest text-gray-400">Mode</label>
					<Select value={mode} onValueChange={(value) => setMode(value as 'live' | 'sandbox')}>
						<SelectTrigger>
							<SelectValue placeholder="Mode" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="sandbox">Sandbox</SelectItem>
							<SelectItem value="live">Live</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="grid gap-2">
					<label className="text-xs font-black uppercase tracking-widest text-gray-400">Base URL</label>
					<Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://app.pakasir.com/api" />
				</div>

				<div className="grid gap-2 md:grid-cols-2 md:gap-4">
					<div className="grid gap-2">
						<label className="text-xs font-black uppercase tracking-widest text-gray-400">Project Slug</label>
						<Input value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)} placeholder="project-slug" />
					</div>
					<div className="grid gap-2">
						<label className="text-xs font-black uppercase tracking-widest text-gray-400">Redirect URL</label>
						<Input value={redirectUrl} onChange={(event) => setRedirectUrl(event.target.value)} placeholder="https://local-fe.scalebiz.chat/payment/success" />
					</div>
				</div>

				<div className="grid gap-2">
					<label className="text-xs font-black uppercase tracking-widest text-gray-400">API Key</label>
					<Input
						type="password"
						value={apiKeyInput}
						onChange={(event) => {
							setApiKeyInput(event.target.value)
							setClearApiKey(false)
						}}
						placeholder={apiKeyMasked || 'Masukkan API key baru'}
					/>
					<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
						<span>Current: {apiKeyMasked || 'Not configured'}</span>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setApiKeyInput('')
								setClearApiKey(true)
							}}
						>
							Clear key on save
						</Button>
					</div>
				</div>

				<div className="grid gap-2">
					<label className="text-xs font-black uppercase tracking-widest text-gray-400">Payment Methods (CSV)</label>
					<Textarea
						value={paymentMethodsText}
						onChange={(event) => setPaymentMethodsText(event.target.value)}
						placeholder="qris,bca_va,bni_va,bri_va,gopay,ovo"
					/>
					{paymentMethodPreview.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{paymentMethodPreview.map((method) => (
								<Badge key={method} variant="outline">
									{method}
								</Badge>
							))}
						</div>
					) : null}
				</div>

				<div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
					<label className="text-xs font-black uppercase tracking-widest text-gray-400">Webhook URL</label>
					<div className="flex flex-wrap items-center gap-2">
						<Input value={webhookUrl} readOnly className="font-mono text-xs" />
						<Button variant="outline" onClick={copyWebhookUrl}>
							<Copy className="mr-2 h-4 w-4" />
							Copy
						</Button>
					</div>
				</div>

				<Button onClick={() => void saveSettings()} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 px-6">
					{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
					Save Pakasir Settings
				</Button>
			</CardContent>
		</Card>
	)
}
