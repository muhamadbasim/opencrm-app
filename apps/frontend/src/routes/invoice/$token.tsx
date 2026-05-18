import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { commerce } from '@/lib/api'

export const Route = createFileRoute('/invoice/$token')({
	component: PublicInvoicePage,
})

type PublicInvoicePayload = {
	invoice: {
		id: string
		status: string
		provider: string
		payment_method: string | null
		payment_number: string | null
		payment_link: string | null
		amount: number
		paid_at: string | null
		expiry_date: string | null
	}
	order: {
		id: string
		order_number: number | null
		currency: string
		subtotal: number
		discount: number
		shipping_fee: number
		grand_total: number
		created_at: string | null
		items: Array<{
			id: string
			product_name: string
			variant_name: string | null
			quantity: number
			unit_price: number
			line_total: number
		}>
	}
	customer: {
		id: string
		name: string | null
		email: string | null
		phone_number: string | null
	} | null
}

function formatMoney(value: number) {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0)
}

function formatDate(value: string | null) {
	if (!value) return '-'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '-'
	return date.toLocaleString('id-ID', {
		dateStyle: 'medium',
		timeStyle: 'short',
	})
}

function PublicInvoicePage() {
	const { token } = Route.useParams()
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [payload, setPayload] = useState<PublicInvoicePayload | null>(null)

	useEffect(() => {
		let mounted = true
		setLoading(true)
		setError(null)
		setPayload(null)

		commerce
			.getPublicInvoice(token)
			.then((response) => {
				if (!mounted) return
				setPayload((response as any)?.data || null)
			})
			.catch((requestError) => {
				if (!mounted) return
				setError(
					requestError instanceof Error
						? requestError.message
						: 'Invoice token tidak valid atau sudah expired.',
				)
			})
			.finally(() => {
				if (!mounted) return
				setLoading(false)
			})

		return () => {
			mounted = false
		}
	}, [token])

	const invoicePaid = useMemo(() => payload?.invoice?.status === 'PAID', [payload])

	if (loading) {
		return (
			<main className="min-h-screen bg-background px-4 py-10 text-foreground">
				<div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
					<Loader2 size={16} className="mr-2 inline animate-spin" />
					Memuat invoice...
				</div>
			</main>
		)
	}

	if (error || !payload) {
		return (
			<main className="min-h-screen bg-background px-4 py-10 text-foreground">
				<div className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-700">
					<AlertCircle size={16} className="mr-2 inline" />
					{error || 'Invoice tidak ditemukan.'}
				</div>
			</main>
		)
	}

	return (
		<main className="min-h-screen bg-background px-4 py-10 text-foreground">
			<div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h1 className="text-xl font-semibold">Invoice #{payload.order.order_number || '-'}</h1>
						<p className="text-sm text-muted-foreground">Dibuat {formatDate(payload.order.created_at)}</p>
					</div>
					<span
						className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
							invoicePaid
								? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
								: 'border-amber-500/30 bg-amber-500/10 text-amber-700'
						}`}
					>
						{invoicePaid ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
						{payload.invoice.status}
					</span>
				</div>

				<div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
					<p>
						Pelanggan:{' '}
						<b>
							{payload.customer?.name || payload.customer?.phone_number || payload.customer?.email || 'Guest'}
						</b>
					</p>
					<p className="text-muted-foreground">Metode: {payload.invoice.payment_method || '-'}</p>
					<p className="text-muted-foreground">Nomor pembayaran: {payload.invoice.payment_number || '-'}</p>
					<p className="text-muted-foreground">Jatuh tempo: {formatDate(payload.invoice.expiry_date)}</p>
					{payload.invoice.paid_at ? (
						<p className="text-emerald-700">Dibayar: {formatDate(payload.invoice.paid_at)}</p>
					) : null}
				</div>

				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead className="bg-muted/30 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
							<tr>
								<th className="px-3 py-2">Item</th>
								<th className="px-3 py-2 text-right">Qty</th>
								<th className="px-3 py-2 text-right">Harga</th>
							</tr>
						</thead>
						<tbody>
							{payload.order.items.map((item) => (
								<tr key={item.id} className="border-t border-border">
									<td className="px-3 py-2">
										<div className="font-medium">{item.product_name}</div>
										{item.variant_name ? (
											<div className="text-xs text-muted-foreground">{item.variant_name}</div>
										) : null}
									</td>
									<td className="px-3 py-2 text-right">{item.quantity}</td>
									<td className="px-3 py-2 text-right">{formatMoney(item.line_total || item.unit_price)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="space-y-1 rounded-lg border border-border bg-muted/20 p-3 text-sm">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Subtotal</span>
						<span>{formatMoney(payload.order.subtotal)}</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Discount</span>
						<span>-{formatMoney(payload.order.discount)}</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Shipping</span>
						<span>{formatMoney(payload.order.shipping_fee)}</span>
					</div>
					<div className="flex items-center justify-between border-t border-dashed border-border pt-2 font-semibold">
						<span>Total</span>
						<span>{formatMoney(payload.order.grand_total)}</span>
					</div>
				</div>

				{!invoicePaid && payload.invoice.payment_link ? (
					<a
						href={payload.invoice.payment_link}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
					>
						<Link2 size={14} />
						Bayar Sekarang
					</a>
				) : null}
			</div>
		</main>
	)
}
