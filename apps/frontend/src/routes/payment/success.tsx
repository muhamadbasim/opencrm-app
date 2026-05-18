import { createFileRoute } from '@tanstack/react-router'
import {
	AlertCircle,
	CalendarClock,
	Check,
	Loader2,
	PackageCheck,
	ReceiptText,
	WalletCards,
	X,
} from 'lucide-react'
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from 'react'
import { commerce } from '@/lib/api'

type PaymentSuccessSearch = {
	token?: string
	order_id?: string
	invoice_id?: string
	provider_invoice_id?: string
}

type PaymentSuccessPayload = {
	invoice: {
		id: string
		status: string
		provider: string
		provider_invoice_id: string | null
		public_token?: string | null
		payment_method: string | null
		payment_number: string | null
		payment_link: string | null
		amount: number
		paid_at: string | null
		expiry_date: string | null
		created_at: string | null
	}
	order: {
		id: string
		order_number: number | null
		status: string | null
		journey_phase: string | null
		currency: string
		subtotal: number
		discount: number
		shipping_fee: number
		grand_total: number
		created_at: string | null
		paid_at: string | null
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

export const Route = createFileRoute('/payment/success')({
	validateSearch: (search: Record<string, unknown>): PaymentSuccessSearch => ({
		token: asSearchString(search.token || search.public_token),
		order_id: asSearchString(search.order_id || search.orderId),
		invoice_id: asSearchString(search.invoice_id || search.invoiceId),
		provider_invoice_id: asSearchString(
			search.provider_invoice_id ||
				search.providerInvoiceId ||
				search.transaction_id ||
				search.reference_id,
		),
	}),
	component: PaymentSuccessPage,
})

function asSearchString(value: unknown): string | undefined {
	if (Array.isArray(value)) return asSearchString(value[0])
	const text = String(value || '').trim()
	return text || undefined
}

function formatMoney(value: number, currency = 'IDR') {
	try {
		return new Intl.NumberFormat('id-ID', {
			style: 'currency',
			currency,
			maximumFractionDigits: 0,
		}).format(Number.isFinite(value) ? value : 0)
	} catch {
		return `${currency} ${Math.round(Number(value) || 0).toLocaleString('id-ID')}`
	}
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

function formatPaymentMethod(value: string | null) {
	const normalized = String(value || '').trim()
	if (!normalized) return '-'
	if (normalized.toLowerCase() === 'qris') return 'QRIS'
	return normalized
		.split(/[_\s-]+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ')
}

function DetailRow({
	label,
	value,
	icon,
}: {
	label: string
	value: string
	icon: ReactNode
}) {
	return (
		<div className="flex items-center gap-3 border-b border-slate-200 py-3 last:border-b-0">
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
				{icon}
			</div>
			<div className="min-w-0">
				<p className="text-xs font-medium uppercase text-slate-500">{label}</p>
				<p className="truncate text-sm font-semibold text-slate-950">{value}</p>
			</div>
		</div>
	)
}

function SuccessAnimation({ paid }: { paid: boolean }) {
	const pieces = useMemo(
		() =>
			Array.from({ length: 10 }, (_, index) => ({
				id: index,
				style: {
					'--angle': `${index * 36}deg`,
					'--distance': `${44 + (index % 3) * 8}px`,
					'--delay': `${index * 45}ms`,
				} as CSSProperties,
			})),
		[],
	)

	return (
		<div className="relative flex h-28 w-28 items-center justify-center">
			{paid ? (
				<div className="payment-success-confetti" aria-hidden="true">
					{pieces.map((piece) => (
						<span key={piece.id} style={piece.style} />
					))}
				</div>
			) : null}
			<div
				className={`payment-success-ring absolute inset-0 rounded-full ${
					paid ? 'bg-emerald-400/20' : 'bg-amber-400/20'
				}`}
			/>
			<div
				className={`payment-success-badge relative flex h-20 w-20 items-center justify-center rounded-full shadow-lg ${
					paid
						? 'bg-emerald-500 text-white shadow-emerald-200'
						: 'bg-amber-500 text-white shadow-amber-200'
				}`}
			>
				{paid ? (
					<Check className="payment-success-check h-11 w-11" strokeWidth={3} />
				) : (
					<AlertCircle className="h-10 w-10" strokeWidth={2.5} />
				)}
			</div>
		</div>
	)
}

function PaymentSuccessPage() {
	const search = Route.useSearch()
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [payload, setPayload] = useState<PaymentSuccessPayload | null>(null)

	useEffect(() => {
		let mounted = true
		const hasReference = Boolean(
			search.token ||
				search.order_id ||
				search.invoice_id ||
				search.provider_invoice_id,
		)

		setLoading(true)
		setError(null)
		setPayload(null)

		if (!hasReference) {
			setError('Referensi pembayaran tidak ditemukan.')
			setLoading(false)
			return () => {
				mounted = false
			}
		}

		commerce
			.getPublicPaymentSuccess(search)
			.then((response) => {
				if (!mounted) return
				setPayload((response as any)?.data || null)
			})
			.catch((requestError) => {
				if (!mounted) return
				setError(
					requestError instanceof Error
						? requestError.message
						: 'Detail pembayaran tidak ditemukan.',
				)
			})
			.finally(() => {
				if (!mounted) return
				setLoading(false)
			})

		return () => {
			mounted = false
		}
	}, [search])

	const paid = payload?.invoice.status === 'PAID'
	const customerName =
		payload?.customer?.name ||
		payload?.customer?.phone_number ||
		payload?.customer?.email ||
		'Pelanggan'
	const orderLabel = payload?.order.order_number
		? `#${payload.order.order_number}`
		: payload?.order.id || '-'

	if (loading) {
		return (
			<main className="flex min-h-[100svh] items-center justify-center bg-slate-50 px-4 text-slate-950">
				<div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
					<Loader2 className="h-4 w-4 animate-spin" />
					Memuat detail pembayaran...
				</div>
			</main>
		)
	}

	if (error || !payload) {
		return (
			<main className="flex min-h-[100svh] items-center justify-center bg-slate-50 px-4 text-slate-950">
				<div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-5 shadow-sm">
					<div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-red-600">
						<AlertCircle className="h-6 w-6" />
					</div>
					<h1 className="text-lg font-semibold text-slate-950">
						Detail pembayaran belum tersedia
					</h1>
					<p className="mt-1 text-sm text-slate-600">
						{error || 'Silakan kembali ke chat untuk konfirmasi pesanan.'}
					</p>
				</div>
			</main>
		)
	}

	const total = formatMoney(payload.order.grand_total, payload.order.currency)
	const invoiceAmount = formatMoney(payload.invoice.amount, payload.order.currency)

	return (
		<main className="min-h-[100svh] overflow-hidden bg-slate-50 text-slate-950">
			<div className="mx-auto flex min-h-[100svh] max-w-6xl items-center px-4 py-4">
				<section className="grid max-h-[calc(100svh-2rem)] w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/70 md:grid-cols-[0.95fr_1.05fr]">
					<div className="flex min-h-0 flex-col justify-between gap-8 bg-slate-950 p-6 text-white md:p-8">
						<div>
							<div className="mb-8 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold uppercase text-emerald-100">
								<WalletCards className="h-4 w-4" />
								Pakasir Payment
							</div>
							<SuccessAnimation paid={paid} />
							<div className="mt-7 max-w-md">
								<p
									className={`mb-3 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
										paid
											? 'bg-emerald-400/15 text-emerald-200'
											: 'bg-amber-400/15 text-amber-200'
									}`}
								>
									{paid ? 'PAID' : payload.invoice.status || 'PENDING'}
								</p>
								<h1 className="text-3xl font-semibold leading-tight md:text-4xl">
									{paid
										? 'Pembayaran Berhasil'
										: 'Menunggu Konfirmasi Pembayaran'}
								</h1>
								<p className="mt-3 text-sm leading-6 text-slate-300">
									{paid
										? `Terima kasih, ${customerName}. Pesanan ${orderLabel} sudah terkonfirmasi dan akan kami proses.`
										: `Kami sedang mengecek pembayaran untuk pesanan ${orderLabel}. Halaman ini bisa dibuka lagi setelah status terkonfirmasi.`}
								</p>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-sm">
							<div>
								<p className="text-xs uppercase text-slate-400">Nominal</p>
								<p className="mt-1 text-xl font-semibold text-white">{total}</p>
							</div>
							<div>
								<p className="text-xs uppercase text-slate-400">Metode</p>
								<p className="mt-1 text-xl font-semibold text-white">
									{formatPaymentMethod(payload.invoice.payment_method)}
								</p>
							</div>
						</div>
					</div>

					<div className="min-h-0 overflow-y-auto p-5 md:p-7">
						<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
							<div>
								<p className="text-xs font-semibold uppercase text-slate-500">
									Detail Order
								</p>
								<h2 className="mt-1 text-2xl font-semibold text-slate-950">
									Pesanan {orderLabel}
								</h2>
							</div>
							<div className="rounded-md border border-slate-200 px-3 py-2 text-right">
								<p className="text-xs text-slate-500">Total Bayar</p>
								<p className="font-semibold text-slate-950">{invoiceAmount}</p>
							</div>
						</div>

						<div className="grid gap-x-5 md:grid-cols-2">
							<DetailRow
								label="Pelanggan"
								value={customerName}
								icon={<ReceiptText className="h-4 w-4" />}
							/>
							<DetailRow
								label="Waktu Bayar"
								value={formatDate(payload.invoice.paid_at || payload.order.paid_at)}
								icon={<CalendarClock className="h-4 w-4" />}
							/>
							<DetailRow
								label="Invoice"
								value={payload.invoice.provider_invoice_id || payload.invoice.id}
								icon={<WalletCards className="h-4 w-4" />}
							/>
							<DetailRow
								label="Status Order"
								value={payload.order.status || payload.order.journey_phase || '-'}
								icon={<PackageCheck className="h-4 w-4" />}
							/>
						</div>

						<div className="mt-6">
							<div className="mb-3 flex items-center justify-between">
								<h3 className="text-sm font-semibold text-slate-950">
									Item Pesanan
								</h3>
								<span className="text-xs text-slate-500">
									{payload.order.items.length} item
								</span>
							</div>

							<div className="max-h-[30svh] overflow-y-auto border-y border-slate-200">
								{payload.order.items.length > 0 ? (
									payload.order.items.map((item) => (
										<div
											key={item.id}
											className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 py-3 last:border-b-0"
										>
											<div className="min-w-0">
												<p className="truncate text-sm font-semibold text-slate-950">
													{item.product_name}
												</p>
												<p className="mt-1 text-xs text-slate-500">
													{item.variant_name || 'Produk'} x{item.quantity}
												</p>
											</div>
											<p className="text-sm font-semibold text-slate-950">
												{formatMoney(
													item.line_total || item.unit_price,
													payload.order.currency,
												)}
											</p>
										</div>
									))
								) : (
									<p className="py-5 text-sm text-slate-500">
										Detail item tidak tersedia.
									</p>
								)}
							</div>
						</div>

						<div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
							<div className="flex justify-between gap-4">
								<span className="text-slate-500">Subtotal</span>
								<span className="font-medium">
									{formatMoney(payload.order.subtotal, payload.order.currency)}
								</span>
							</div>
							<div className="flex justify-between gap-4">
								<span className="text-slate-500">Diskon</span>
								<span className="font-medium">
									-{formatMoney(payload.order.discount, payload.order.currency)}
								</span>
							</div>
							<div className="flex justify-between gap-4">
								<span className="text-slate-500">Pengiriman</span>
								<span className="font-medium">
									{formatMoney(payload.order.shipping_fee, payload.order.currency)}
								</span>
							</div>
							<div className="flex justify-between gap-4 border-t border-dashed border-slate-200 pt-3 text-base">
								<span className="font-semibold">Total</span>
								<span className="font-semibold">{total}</span>
							</div>
						</div>

						<div className="mt-6 flex flex-wrap gap-3">
							<button
								type="button"
								onClick={() => window.close()}
								className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
							>
								<X className="h-4 w-4" />
								Tutup Halaman
							</button>
							{payload.invoice.public_token ? (
								<a
									href={`/invoice/${encodeURIComponent(payload.invoice.public_token)}`}
									className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
								>
									<ReceiptText className="h-4 w-4" />
									Lihat Invoice
								</a>
							) : null}
						</div>
					</div>
				</section>
			</div>
		</main>
	)
}
