import { createFileRoute } from '@tanstack/react-router'
import {
	Loader2,
	RefreshCw,
	Search,
	Send,
	ShoppingCart,
	X,
	XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useIsMobile } from '@/hooks/use-mobile'
import { commerce } from '@/lib/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/orders')({
	component: OrdersManagementPage,
})

type OrderListItem = {
	id: string
	order_number: number | null
	order_status: string
	journey_phase: string
	grand_total: number
	item_count: number
	created_at: string | null
	updated_at: string | null
	invoice_status?: string | null
	customer?: {
		id: string
		name: string | null
		email: string | null
		phone_number: string | null
		avatar_url?: string | null
	} | null
	conversation?: {
		id: string
		inbox_id: string | null
		inbox_name: string | null
	} | null
	latest_invoice_summary?: {
		id: string
		status: string
		provider: string | null
		payment_method: string | null
		payment_number: string | null
		payment_link: string | null
		checkout_url: string | null
		amount: number
		paid_at: string | null
		expiry_date: string | null
		created_at: string | null
	} | null
}

type OrderDetail = {
	id: string
	order_number: number | null
	order_status: string
	journey_phase: string
	currency: string
	subtotal: number
	discount: number
	shipping_fee: number
	grand_total: number
	created_at: string | null
	updated_at: string | null
	checkout_at: string | null
	paid_at: string | null
	items: Array<{
		id: string
		product_name: string
		variant_name: string | null
		quantity: number
		unit_price: number
		line_total: number
	}>
	invoices: Array<{
		id: string
		status: string
		payment_method: string | null
		payment_number: string | null
		payment_link: string | null
		checkout_url: string | null
		amount: number
		created_at: string | null
		paid_at: string | null
	}>
	customer?: {
		id: string
		name: string | null
		email: string | null
		phone_number: string | null
	} | null
	payment_methods?: Array<{
		id: string
		label: string
		provider: string
	}>
}

type Pagination = {
	page: number
	limit: number
	total_items: number
	total_pages: number
}

const JOURNEY_OPTIONS = [
	{ value: 'all', label: 'Semua Journey' },
	{ value: 'cart', label: 'Cart' },
	{ value: 'checkout', label: 'Checkout' },
	{ value: 'payment_pending', label: 'Payment Pending' },
	{ value: 'paid', label: 'Paid' },
	{ value: 'cancelled', label: 'Cancelled' },
	{ value: 'expired', label: 'Expired' },
]

const PAYMENT_OPTIONS = [
	{ value: 'all', label: 'Semua Invoice' },
	{ value: 'NOT_PAID', label: 'Not Paid' },
	{ value: 'PAID', label: 'Paid' },
	{ value: 'CANCELLED', label: 'Cancelled' },
	{ value: 'EXPIRED', label: 'Expired' },
]

function formatMoney(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0)
}

function formatDate(value: string | null | undefined): string {
	if (!value) return '-'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '-'
	return date.toLocaleString('id-ID', {
		dateStyle: 'medium',
		timeStyle: 'short',
	})
}

function statusVariant(status: string | null | undefined): string {
	const normalized = String(status || '').trim().toLowerCase()
	if (['paid', 'completed', 'active'].includes(normalized)) {
		return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
	}
	if (['payment_pending', 'checkout', 'pending', 'not_paid'].includes(normalized)) {
		return 'bg-amber-500/15 text-amber-700 border-amber-500/30'
	}
	if (['cancelled', 'expired', 'failed'].includes(normalized)) {
		return 'bg-rose-500/15 text-rose-700 border-rose-500/30'
	}
	return 'bg-slate-500/15 text-slate-700 border-slate-500/30'
}

function statusLabel(status: string | null | undefined): string {
	const normalized = String(status || '')
		.trim()
		.replace(/_/g, ' ')
		.toLowerCase()
	if (!normalized) return '-'
	return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function customerLabel(order: OrderListItem): string {
	return (
		order.customer?.name ||
		order.customer?.phone_number ||
		order.customer?.email ||
		'Guest'
	)
}

function extractData<T>(response: unknown): T {
	const payload = response as { data?: T }
	if (payload && payload.data !== undefined) return payload.data
	return response as T
}

function OrdersListSkeleton() {
	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="min-w-[1080px]">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-muted/40">
						<TableRow>
							<TableHead>Order</TableHead>
							<TableHead>Customer</TableHead>
							<TableHead>Items</TableHead>
							<TableHead>Journey</TableHead>
							<TableHead>Invoice</TableHead>
							<TableHead>Total</TableHead>
							<TableHead>Updated</TableHead>
							<TableHead>Aksi</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{Array.from({ length: 7 }).map((_, index) => (
							<TableRow key={`orders-skeleton-${index}`}>
								<TableCell>
									<Skeleton className="h-4 w-28" />
									<Skeleton className="mt-2 h-3 w-36" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-36" />
									<Skeleton className="mt-2 h-3 w-20" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-10" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-6 w-24 rounded-full" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-6 w-24 rounded-full" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-24" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-28" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-8 w-16" />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	)
}

function OrderDetailSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-24 w-full rounded-xl" />
			<Skeleton className="h-40 w-full rounded-xl" />
			<Skeleton className="h-40 w-full rounded-xl" />
		</div>
	)
}

function OrdersManagementPage() {
	const isMobile = useIsMobile()
	const [orders, setOrders] = useState<OrderListItem[]>([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [listError, setListError] = useState<string | null>(null)
	const [detailOpen, setDetailOpen] = useState(false)
	const [detailLoading, setDetailLoading] = useState(false)
	const [detailError, setDetailError] = useState<string | null>(null)
	const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
	const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null)
	const [search, setSearch] = useState('')
	const [journeyFilter, setJourneyFilter] = useState('all')
	const [paymentFilter, setPaymentFilter] = useState('all')
	const [pagination, setPagination] = useState<Pagination>({
		page: 1,
		limit: 25,
		total_items: 0,
		total_pages: 0,
	})
	const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
	const [sendLinkLoading, setSendLinkLoading] = useState(false)
	const [cancelLoading, setCancelLoading] = useState(false)

	const selectedOrderCanSendLink = useMemo(() => {
		if (!selectedOrder) return false
		return (
			['cart', 'checkout', 'payment_pending'].includes(
				selectedOrder.journey_phase,
			) && selectedPaymentMethod.trim().length > 0
		)
	}, [selectedOrder, selectedPaymentMethod])

	const selectedOrderCanCancel = useMemo(() => {
		if (!selectedOrder) return false
		return ['cart', 'checkout', 'payment_pending'].includes(selectedOrder.journey_phase)
	}, [selectedOrder])

	const selectedOrderPaymentMethods = useMemo(() => {
		if (!selectedOrder) return []
		if (selectedOrder.payment_methods && selectedOrder.payment_methods.length > 0) {
			return selectedOrder.payment_methods
		}
		return []
	}, [selectedOrder])

	const loadOrders = useCallback(
		async (page: number, silent = false) => {
			setListError(null)
			if (silent) {
				setRefreshing(true)
			} else {
				setLoading(true)
			}
			try {
				const response = await commerce.listOrders({
					page,
					limit: pagination.limit,
					search: search.trim() || undefined,
					journey_phase: journeyFilter === 'all' ? undefined : journeyFilter,
					payment_status: paymentFilter === 'all' ? undefined : paymentFilter,
				})
				const payload = extractData<{
					items: OrderListItem[]
					pagination: Pagination
				}>(response)
				setOrders(payload.items || [])
				setPagination((prev) => ({
					...prev,
					...(payload.pagination || prev),
					page,
				}))
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Gagal memuat daftar order'
				setListError(message)
				if (!silent) {
					toast.error(message)
				}
			} finally {
				setLoading(false)
				setRefreshing(false)
			}
		},
		[journeyFilter, paymentFilter, pagination.limit, search],
	)

	const loadOrderDetail = useCallback(
		async (orderId: string, silent = false) => {
			if (!silent) {
				setDetailLoading(true)
				setDetailError(null)
				setSelectedOrder(null)
			}
			try {
				const response = await commerce.getOrderDetail(orderId)
				const detail = extractData<OrderDetail>(response)
				setSelectedOrder(detail)
				setDetailError(null)
				setSelectedPaymentMethod((current) => {
					const availableMethods = detail.payment_methods || []
					if (
						current &&
						availableMethods.some((method) => method.id === current)
					) {
						return current
					}
					return (
						availableMethods[0]?.id ||
						detail.invoices?.[0]?.payment_method ||
						''
					)
				})
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Gagal memuat detail order'
				setDetailError(message)
				if (!silent) {
					toast.error(message)
				}
			} finally {
				setDetailLoading(false)
			}
		},
		[],
	)

	useEffect(() => {
		const handle = window.setTimeout(() => {
			void loadOrders(1)
		}, 250)
		return () => window.clearTimeout(handle)
	}, [loadOrders])

	const openDetailDrawer = (orderId: string) => {
		setDetailOpen(true)
		setSelectedOrderId(orderId)
		void loadOrderDetail(orderId)
	}

	const handleDetailOpenChange = (open: boolean) => {
		setDetailOpen(open)
		if (open) return
		setSelectedOrderId(null)
		setSelectedOrder(null)
		setDetailError(null)
		setDetailLoading(false)
		setSelectedPaymentMethod('')
	}

	const refreshOrderViews = async (orderId: string) => {
		await Promise.all([
			loadOrders(pagination.page, true),
			loadOrderDetail(orderId, true),
		])
	}

	const handleSendPaymentLink = async () => {
		if (!selectedOrder) return
		setSendLinkLoading(true)
		try {
			await commerce.sendPaymentLink(selectedOrder.id, {
				payment_method: selectedPaymentMethod,
			})
			toast.success('Link pembayaran berhasil dikirim')
			await refreshOrderViews(selectedOrder.id)
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Gagal mengirim payment link',
			)
		} finally {
			setSendLinkLoading(false)
		}
	}

	const handleCancelOrder = async () => {
		if (!selectedOrder) return
		if (!window.confirm('Batalkan order ini?')) return

		setCancelLoading(true)
		try {
			await commerce.cancelOrder(selectedOrder.id, {
				reason: 'cancelled_from_orders_page',
			})
			toast.success('Order berhasil dibatalkan')
			await refreshOrderViews(selectedOrder.id)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal membatalkan order')
		} finally {
			setCancelLoading(false)
		}
	}

	return (
		<div className="flex flex-1 flex-col overflow-hidden bg-background">
			<PageHeader
				title="Orders"
				description="Kelola order commerce, kirim payment link, dan monitor status invoice."
				icon={<ShoppingCart size={22} />}
				actions={
					<Button
						variant="outline"
						onClick={() => void loadOrders(pagination.page, true)}
						disabled={refreshing}
					>
						{refreshing ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="mr-2 h-4 w-4" />
						)}
						Refresh
					</Button>
				}
			/>

			<div className="flex min-h-0 flex-1 flex-col px-4 pb-6 lg:px-8">
				<Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/70">
					<CardHeader className="sticky top-0 z-20 border-b bg-background/95 py-4 backdrop-blur supports-backdrop-filter:bg-background/80">
						<div className="grid gap-3 md:grid-cols-[minmax(300px,1fr)_180px_180px]">
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Cari nomor order, customer, external ID"
									className="pl-9"
								/>
							</div>
							<Select value={journeyFilter} onValueChange={setJourneyFilter}>
								<SelectTrigger>
									<SelectValue placeholder="Journey" />
								</SelectTrigger>
								<SelectContent>
									{JOURNEY_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select value={paymentFilter} onValueChange={setPaymentFilter}>
								<SelectTrigger>
									<SelectValue placeholder="Invoice" />
								</SelectTrigger>
								<SelectContent>
									{PAYMENT_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</CardHeader>
					<CardContent className="flex min-h-0 flex-1 flex-col p-0">
						{loading ? (
							<OrdersListSkeleton />
						) : listError ? (
							<div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
								<XCircle className="h-8 w-8 text-rose-500" />
								<p className="max-w-xl text-sm text-muted-foreground">{listError}</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => void loadOrders(pagination.page)}
								>
									Try Again
								</Button>
							</div>
						) : (
							<div className="flex min-h-0 flex-1 flex-col">
								<div className="min-h-0 flex-1 overflow-auto">
									<div className="min-w-[1080px]">
										<Table>
											<TableHeader className="sticky top-0 z-10 bg-muted/40">
												<TableRow>
													<TableHead>Order</TableHead>
													<TableHead>Customer</TableHead>
													<TableHead>Items</TableHead>
													<TableHead>Journey</TableHead>
													<TableHead>Invoice</TableHead>
													<TableHead>Total</TableHead>
													<TableHead>Updated</TableHead>
													<TableHead>Aksi</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{orders.map((order) => (
													<TableRow
														key={order.id}
														className={cn(
															selectedOrderId === order.id && detailOpen
																? 'bg-muted/45'
																: '',
														)}
													>
														<TableCell>
															<div className="font-medium">
																#{order.order_number || '-'}
															</div>
															<div className="text-xs text-muted-foreground">
																{formatDate(order.created_at)}
															</div>
														</TableCell>
														<TableCell>
															<div className="font-medium">{customerLabel(order)}</div>
															<div className="text-xs text-muted-foreground">
																{order.conversation?.inbox_name || 'No inbox'}
															</div>
														</TableCell>
														<TableCell>{Math.max(0, Number(order.item_count || 0))}</TableCell>
														<TableCell>
															<Badge className={statusVariant(order.journey_phase)}>
																{statusLabel(order.journey_phase)}
															</Badge>
														</TableCell>
														<TableCell>
															<div className="space-y-1">
																<Badge className={statusVariant(order.invoice_status)}>
																	{statusLabel(order.invoice_status || 'NOT_PAID')}
																</Badge>
																<div className="text-xs text-muted-foreground">
																	{order.latest_invoice_summary?.payment_method
																		? statusLabel(
																				order.latest_invoice_summary.payment_method,
																			)
																		: 'Belum ada invoice'}
																</div>
															</div>
														</TableCell>
														<TableCell>{formatMoney(order.grand_total)}</TableCell>
														<TableCell className="text-xs text-muted-foreground">
															{formatDate(order.updated_at)}
														</TableCell>
														<TableCell>
															<Button
																variant={
																	selectedOrderId === order.id && detailOpen
																		? 'default'
																		: 'outline'
																}
																size="sm"
																onClick={() => openDetailDrawer(order.id)}
															>
																Detail
															</Button>
														</TableCell>
													</TableRow>
												))}
												{orders.length === 0 ? (
													<TableRow>
														<TableCell
															colSpan={8}
															className="h-56 text-center text-sm text-muted-foreground"
														>
															Tidak ada order yang cocok dengan filter saat ini.
														</TableCell>
													</TableRow>
												) : null}
											</TableBody>
										</Table>
									</div>
								</div>
								<div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
									<div>
										Total {pagination.total_items} order • Halaman {pagination.page}/
										{Math.max(1, pagination.total_pages || 1)}
									</div>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											disabled={pagination.page <= 1}
											onClick={() => void loadOrders(pagination.page - 1)}
										>
											Prev
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={pagination.page >= (pagination.total_pages || 1)}
											onClick={() => void loadOrders(pagination.page + 1)}
										>
											Next
										</Button>
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Drawer
				open={detailOpen}
				onOpenChange={handleDetailOpenChange}
				direction={isMobile ? 'bottom' : 'right'}
				modal
			>
				<DrawerContent
					className={cn(
						'flex w-full flex-col',
						isMobile
							? 'h-[100dvh] max-h-[100dvh] rounded-none border-none'
							: 'sm:max-w-[620px]',
					)}
				>
					<DrawerHeader className="border-b px-5 py-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<DrawerTitle>
									{selectedOrder
										? `Order #${selectedOrder.order_number || '-'}`
										: 'Order Detail'}
								</DrawerTitle>
								<DrawerDescription>
									{selectedOrder
										? `Dibuat ${formatDate(selectedOrder.created_at)}`
										: 'Detail order, invoice, dan aksi cepat pembayaran'}
								</DrawerDescription>
							</div>
							<DrawerClose asChild>
								<Button variant="ghost" size="icon" className="h-8 w-8">
									<X className="h-4 w-4" />
									<span className="sr-only">Tutup detail order</span>
								</Button>
							</DrawerClose>
						</div>
					</DrawerHeader>

					<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
						{detailLoading ? (
							<OrderDetailSkeleton />
						) : detailError ? (
							<div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
								<XCircle className="h-8 w-8 text-rose-500" />
								<p className="max-w-sm text-sm text-muted-foreground">{detailError}</p>
								{selectedOrderId ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => void loadOrderDetail(selectedOrderId)}
									>
										Try Again
									</Button>
								) : null}
							</div>
						) : !selectedOrder ? (
							<div className="flex h-full min-h-[240px] items-center justify-center text-sm text-muted-foreground">
								Pilih order untuk melihat detail.
							</div>
						) : (
							<div className="space-y-4">
								<div className="space-y-2 rounded-xl border border-border p-4">
									<div className="text-sm font-semibold">
										{selectedOrder.customer?.name ||
											selectedOrder.customer?.phone_number ||
											selectedOrder.customer?.email ||
											'Guest'}
									</div>
									<div className="flex flex-wrap gap-2">
										<Badge className={statusVariant(selectedOrder.journey_phase)}>
											{statusLabel(selectedOrder.journey_phase)}
										</Badge>
										<Badge className={statusVariant(selectedOrder.order_status)}>
											{statusLabel(selectedOrder.order_status)}
										</Badge>
									</div>
									<div className="grid gap-1 text-xs text-muted-foreground">
										<span>Subtotal {formatMoney(selectedOrder.subtotal)}</span>
										<span>Grand Total {formatMoney(selectedOrder.grand_total)}</span>
									</div>
								</div>

								<div className="space-y-3 rounded-xl border border-border p-4">
									<div className="text-sm font-semibold">Items</div>
									{selectedOrder.items.length === 0 ? (
										<div className="text-xs text-muted-foreground">
											Belum ada item pada order ini.
										</div>
									) : (
										selectedOrder.items.map((item) => (
											<div
												key={item.id}
												className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3"
											>
												<div>
													<div className="text-sm font-medium">{item.product_name}</div>
													<div className="text-xs text-muted-foreground">
														{item.variant_name || '-'}
													</div>
												</div>
												<div className="text-right text-xs text-muted-foreground">
													<div>{item.quantity} x {formatMoney(item.unit_price)}</div>
													<div className="font-medium text-foreground">
														{formatMoney(item.line_total)}
													</div>
												</div>
											</div>
										))
									)}
								</div>

								<div className="space-y-3 rounded-xl border border-border p-4">
									<div className="text-sm font-semibold">Invoices</div>
									{selectedOrder.invoices.length === 0 ? (
										<div className="text-xs text-muted-foreground">
											Invoice belum dibuat.
										</div>
									) : (
										selectedOrder.invoices.map((invoice) => (
											<div
												key={invoice.id}
												className="rounded-lg border border-border/70 p-3"
											>
												<div className="flex items-center justify-between gap-2">
													<Badge className={statusVariant(invoice.status)}>
														{statusLabel(invoice.status)}
													</Badge>
													<span className="text-xs text-muted-foreground">
														{formatDate(invoice.created_at)}
													</span>
												</div>
												<div className="mt-2 space-y-1 text-xs text-muted-foreground">
													<div>Method: {statusLabel(invoice.payment_method)}</div>
													<div>Amount: {formatMoney(invoice.amount)}</div>
												</div>
												{invoice.payment_link ? (
													<a
														href={invoice.payment_link}
														target="_blank"
														rel="noreferrer"
														className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
													>
														Buka payment link
													</a>
												) : null}
											</div>
										))
									)}
								</div>
							</div>
						)}
					</div>

					<DrawerFooter className="border-t bg-background/95 px-5 py-4 backdrop-blur supports-backdrop-filter:bg-background/80">
						{selectedOrder ? (
							<div className="grid w-full gap-3">
								<Select
									value={selectedPaymentMethod}
									onValueChange={setSelectedPaymentMethod}
									disabled={
										detailLoading ||
										sendLinkLoading ||
										cancelLoading ||
										selectedOrderPaymentMethods.length === 0
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Pilih payment method" />
									</SelectTrigger>
									<SelectContent>
										{selectedOrderPaymentMethods.length === 0 ? (
											<SelectItem value="__no_method" disabled>
												Payment method belum tersedia dari API
											</SelectItem>
										) : (
											selectedOrderPaymentMethods.map((method) => (
												<SelectItem key={method.id} value={method.id}>
													{method.label}
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									<Button
										onClick={() => void handleSendPaymentLink()}
										disabled={
											!selectedOrderCanSendLink ||
											sendLinkLoading ||
											cancelLoading ||
											detailLoading
										}
									>
										{sendLinkLoading ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Send className="mr-2 h-4 w-4" />
										)}
										Send Payment Link
									</Button>
									<Button
										variant="outline"
										onClick={() => void handleCancelOrder()}
										disabled={
											!selectedOrderCanCancel ||
											cancelLoading ||
											sendLinkLoading ||
											detailLoading
										}
									>
										{cancelLoading ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<XCircle className="mr-2 h-4 w-4" />
										)}
										Cancel Order
									</Button>
								</div>
							</div>
						) : (
							<DrawerClose asChild>
								<Button variant="outline">Tutup</Button>
							</DrawerClose>
						)}
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</div>
	)
}
