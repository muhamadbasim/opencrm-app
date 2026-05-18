import { createFileRoute, redirect } from '@tanstack/react-router'
import {
	Boxes,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { commerce } from '@/lib/api'

export const Route = createFileRoute('/_app/product-stock')({
	component: ProductStockPage,
	beforeLoad: () => {
		throw redirect({ to: '/products' })
	},
})

type StockVariant = {
	id: string
	product_id: string
	product_name: string
	product_sku: string | null
	name: string
	sku: string | null
	stock_on_hand: number
	stock_reserved: number
	available_stock: number
	low_stock: boolean
	is_active: boolean
}

type Pagination = {
	page: number
	limit: number
	total_items: number
	total_pages: number
}

function extractData<T>(response: unknown): T {
	const payload = response as { data?: T }
	if (payload && payload.data !== undefined) return payload.data
	return response as T
}

function ProductStockPage() {
	const [items, setItems] = useState<StockVariant[]>([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [search, setSearch] = useState('')
	const [lowStockOnly, setLowStockOnly] = useState(false)
	const [threshold, setThreshold] = useState(10)
	const [pagination, setPagination] = useState<Pagination>({
		page: 1,
		limit: 25,
		total_items: 0,
		total_pages: 0,
	})

	const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
	const [adjustingVariant, setAdjustingVariant] = useState<StockVariant | null>(null)
	const [adjustSubmitting, setAdjustSubmitting] = useState(false)
	const [adjustQuantity, setAdjustQuantity] = useState('1')
	const [adjustType, setAdjustType] = useState('adjust_in')
	const [adjustNote, setAdjustNote] = useState('')

	const loadStock = useCallback(
		async (page: number, silent = false) => {
			if (silent) {
				setRefreshing(true)
			} else {
				setLoading(true)
			}
			try {
				const response = await commerce.listStockVariants({
					page,
					limit: pagination.limit,
					search: search.trim() || undefined,
					low_stock: lowStockOnly,
					threshold,
				})
				const payload = extractData<{
					items: StockVariant[]
					pagination: Pagination
				}>(response)
				setItems(payload.items || [])
				setPagination((prev) => ({
					...prev,
					...(payload.pagination || prev),
					page,
				}))
			} catch (error) {
				toast.error(error instanceof Error ? error.message : 'Gagal memuat stok')
			} finally {
				setLoading(false)
				setRefreshing(false)
			}
		},
		[lowStockOnly, pagination.limit, search, threshold],
	)

	useEffect(() => {
		const handle = window.setTimeout(() => {
			void loadStock(1)
		}, 250)
		return () => window.clearTimeout(handle)
	}, [loadStock])

	const openAdjustDialog = (variant: StockVariant) => {
		setAdjustingVariant(variant)
		setAdjustDialogOpen(true)
		setAdjustQuantity('1')
		setAdjustType('adjust_in')
		setAdjustNote('')
	}

	const submitAdjust = async () => {
		if (!adjustingVariant) return
		const numeric = Number(adjustQuantity)
		if (!Number.isFinite(numeric) || numeric <= 0) {
			toast.error('Quantity harus lebih dari 0')
			return
		}

		setAdjustSubmitting(true)
		try {
			const direction = adjustType === 'adjust_out' ? -1 : 1
			await commerce.adjustStock(adjustingVariant.id, {
				quantity: direction * Math.floor(Math.abs(numeric)),
				movement_type: adjustType,
				note: adjustNote.trim() || undefined,
			})
			toast.success('Stock berhasil di-adjust')
			setAdjustDialogOpen(false)
			await loadStock(pagination.page, true)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal adjust stock')
		} finally {
			setAdjustSubmitting(false)
		}
	}

	return (
		<div className="flex flex-1 flex-col overflow-hidden bg-background">
			<PageHeader
				title="Product Stock"
				description="Pantau stok varian, filter stok rendah, dan lakukan stock adjustment."
				icon={<Boxes size={22} />}
				actions={
					<Button variant="outline" onClick={() => void loadStock(pagination.page, true)} disabled={refreshing}>
						{refreshing ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="mr-2 h-4 w-4" />
						)}
						Refresh
					</Button>
				}
			/>

			<div className="flex flex-1 flex-col gap-4 overflow-auto px-4 pb-6 lg:px-8">
				<Card>
					<CardContent className="pt-6">
						<div className="grid gap-3 md:grid-cols-[1fr_180px_150px]">
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Cari SKU / nama produk"
									className="pl-9"
								/>
							</div>
							<Select
								value={lowStockOnly ? 'yes' : 'no'}
								onValueChange={(value) => setLowStockOnly(value === 'yes')}
							>
								<SelectTrigger>
									<SelectValue placeholder="Low stock" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="no">Semua stok</SelectItem>
									<SelectItem value="yes">Hanya low stock</SelectItem>
								</SelectContent>
							</Select>
							<Input
								type="number"
								value={threshold}
								onChange={(event) => setThreshold(Math.max(0, Number(event.target.value || 0)))}
								placeholder="Threshold"
							/>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="pt-6">
						{loading ? (
							<div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Memuat data stok...
							</div>
						) : (
							<>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Variant</TableHead>
											<TableHead>SKU</TableHead>
											<TableHead>On Hand</TableHead>
											<TableHead>Reserved</TableHead>
											<TableHead>Available</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Aksi</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{items.map((item) => (
											<TableRow key={item.id}>
												<TableCell>
													<div className="font-medium">{item.name}</div>
													<div className="text-xs text-muted-foreground">{item.product_name}</div>
												</TableCell>
												<TableCell>{item.sku || '-'}</TableCell>
												<TableCell>{item.stock_on_hand}</TableCell>
												<TableCell>{item.stock_reserved}</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<span>{item.available_stock}</span>
														{item.low_stock ? (
															<Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">Low</Badge>
														) : null}
													</div>
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={
															item.is_active
																? 'text-emerald-700 border-emerald-500/30 bg-emerald-500/10'
																: 'text-rose-700 border-rose-500/30 bg-rose-500/10'
														}
													>
														{item.is_active ? 'Active' : 'Inactive'}
													</Badge>
												</TableCell>
												<TableCell>
													<Button variant="outline" size="sm" onClick={() => openAdjustDialog(item)}>
														<Wrench className="mr-2 h-4 w-4" />
														Adjust
													</Button>
												</TableCell>
											</TableRow>
										))}
										{items.length === 0 ? (
											<TableRow>
												<TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
													Tidak ada data stock.
												</TableCell>
											</TableRow>
										) : null}
									</TableBody>
								</Table>

								<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
									<div>
										Total {pagination.total_items} varian • Halaman {pagination.page}/
										{Math.max(1, pagination.total_pages || 1)}
									</div>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											disabled={pagination.page <= 1}
											onClick={() => void loadStock(pagination.page - 1)}
										>
											Prev
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={pagination.page >= (pagination.total_pages || 1)}
											onClick={() => void loadStock(pagination.page + 1)}
										>
											Next
										</Button>
									</div>
								</div>
							</>
						)}
					</CardContent>
				</Card>
			</div>

			<Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Stock Adjustment</DialogTitle>
						<DialogDescription>
							{adjustingVariant?.name} ({adjustingVariant?.sku || '-'})
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<Select value={adjustType} onValueChange={(value) => { if (value !== null) setAdjustType(value) }}>
							<SelectTrigger>
								<SelectValue placeholder="Movement type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="adjust_in">Tambah stok (+)</SelectItem>
								<SelectItem value="adjust_out">Kurangi stok (-)</SelectItem>
							</SelectContent>
						</Select>
						<Input
							type="number"
							value={adjustQuantity}
							onChange={(event) => setAdjustQuantity(event.target.value)}
							placeholder="Qty"
						/>
						<Textarea
							value={adjustNote}
							onChange={(event) => setAdjustNote(event.target.value)}
							placeholder="Catatan"
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
							Batal
						</Button>
						<Button onClick={() => void submitAdjust()} disabled={adjustSubmitting}>
							{adjustSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
							Simpan
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
