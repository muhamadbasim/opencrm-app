import { createFileRoute } from '@tanstack/react-router'
import {
	Boxes,
	Edit,
	Loader2,
	Package,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	Upload,
	Wrench,
} from 'lucide-react'
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
	commerce,
	media,
	type BulkVariantUpsertPayload,
	type StockMovementRow,
	type VariantDraft,
} from '@/lib/api'

export const Route = createFileRoute('/_app/products')({
	component: ProductsPage,
})

type VariantRow = {
	id: string
	product_id: string
	name: string
	sku: string | null
	image_url: string | null
	price: number
	stock_on_hand: number
	stock_reserved: number
	available_stock: number
	is_active: boolean
	attributes?: Record<string, unknown>
}

type ProductRow = {
	id: string
	name: string
	sku: string | null
	image_url: string | null
	description: string | null
	base_price: number
	is_active: boolean
	variants: VariantRow[]
}

type ProductForm = {
	name: string
	sku: string
	image_url: string
	description: string
	base_price: string
	is_active: string
}

type ComposerVariantRow = {
	client_id: string
	id?: string
	name: string
	sku: string
	image_url: string
	price: string
	stock_on_hand: string
	stock_reserved: number
	available_stock: number
	is_active: string
}

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

const DEFAULT_PRODUCT_FORM: ProductForm = {
	name: '',
	sku: '',
	image_url: '',
	description: '',
	base_price: '0',
	is_active: 'true',
}

const DEFAULT_PAGINATION: Pagination = {
	page: 1,
	limit: 25,
	total_items: 0,
	total_pages: 0,
}

const CATALOG_PAGE_SIZE = 8
const CATALOG_VARIANT_PAGE_SIZE = 5

const MOVEMENT_FILTER_OPTIONS = [
	{ value: 'all', label: 'Semua tipe' },
	{ value: 'initial', label: 'Initial' },
	{ value: 'adjust_in', label: 'Adjust In' },
	{ value: 'adjust_out', label: 'Adjust Out' },
	{ value: 'reserve', label: 'Reserve' },
	{ value: 'release_reservation', label: 'Release Reservation' },
	{ value: 'deduct', label: 'Deduct' },
]

const ADJUSTMENT_MOVEMENT_OPTIONS = [
	{ value: 'adjust_in', label: 'Tambah stok (+)' },
	{ value: 'adjust_out', label: 'Kurangi stok (-)' },
]

const generateSKU = () =>
	Math.random().toString(36).substring(2, 7).toUpperCase()

function createEmptyVariantRow(): ComposerVariantRow {
	return {
		client_id: `new-${crypto.randomUUID()}`,
		name: '',
		sku: '',
		image_url: '',
		price: '',
		stock_on_hand: '',
		stock_reserved: 0,
		available_stock: 0,
		is_active: 'true',
	}
}

function formatMoney(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0)
}

function formatDateTime(value: string | null | undefined): string {
	if (!value) return '-'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '-'
	return date.toLocaleString('id-ID', {
		dateStyle: 'medium',
		timeStyle: 'short',
	})
}

function extractData<T>(response: unknown): T {
	const payload = response as { data?: T }
	if (payload && payload.data !== undefined) return payload.data
	return response as T
}

function statusBadgeClass(active: boolean): string {
	return active
		? 'text-emerald-700 border-emerald-500/30 bg-emerald-500/10'
		: 'text-rose-700 border-rose-500/30 bg-rose-500/10'
}

function movementBadgeClass(type: string): string {
	const normalized = type.trim().toLowerCase()
	if (normalized.includes('in') || normalized === 'initial') {
		return 'text-emerald-700 border-emerald-500/30 bg-emerald-500/10'
	}
	if (normalized.includes('out') || normalized === 'deduct') {
		return 'text-rose-700 border-rose-500/30 bg-rose-500/10'
	}
	if (normalized.includes('reserve')) {
		return 'text-amber-700 border-amber-500/30 bg-amber-500/10'
	}
	return 'text-slate-700 border-slate-500/30 bg-slate-500/10'
}

function normalizeMovementType(type: string): string {
	return type
		.trim()
		.split('_')
		.filter(Boolean)
		.map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
		.join(' ')
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

function toComposerRow(variant: VariantRow): ComposerVariantRow {
	return {
		client_id: variant.id,
		id: variant.id,
		name: variant.name,
		sku: variant.sku || '',
		image_url: variant.image_url || '',
		price: String(variant.price || 0),
		stock_on_hand: String(variant.stock_on_hand || 0),
		stock_reserved: variant.stock_reserved || 0,
		available_stock: variant.available_stock || 0,
		is_active: variant.is_active ? 'true' : 'false',
	}
}

function hasVariantContent(row: ComposerVariantRow): boolean {
	if (row.id) return true
	return Boolean(
		row.name.trim() ||
			row.sku.trim() ||
			row.image_url.trim() ||
			String(row.price || '').trim() ||
			String(row.stock_on_hand || '').trim(),
	)
}

function ProductsPage() {
	const [activeTab, setActiveTab] = useState<'catalog' | 'stock'>('catalog')

	const [products, setProducts] = useState<ProductRow[]>([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [search, setSearch] = useState('')
	const [statusFilter, setStatusFilter] = useState<
		'all' | 'active' | 'inactive'
	>('all')
	const [catalogPage, setCatalogPage] = useState(1)
	const [catalogVariantPageByProductId, setCatalogVariantPageByProductId] =
		useState<Record<string, number>>({})

	const [composerOpen, setComposerOpen] = useState(false)
	const [composerSubmitting, setComposerSubmitting] = useState(false)
	const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
	const [productForm, setProductForm] =
		useState<ProductForm>(DEFAULT_PRODUCT_FORM)
	const [productImageUploading, setProductImageUploading] = useState(false)
	const productImageInputRef = useRef<HTMLInputElement>(null)
	const [variantRows, setVariantRows] = useState<ComposerVariantRow[]>([
		createEmptyVariantRow(),
	])
	const [deactivateVariantIds, setDeactivateVariantIds] = useState<string[]>([])

	const [stockItems, setStockItems] = useState<StockVariant[]>([])
	const [stockLoading, setStockLoading] = useState(false)
	const [stockRefreshing, setStockRefreshing] = useState(false)
	const [stockSearch, setStockSearch] = useState('')
	const [stockLowOnly, setStockLowOnly] = useState(false)
	const [stockThreshold, setStockThreshold] = useState(10)
	const [stockPagination, setStockPagination] =
		useState<Pagination>(DEFAULT_PAGINATION)

	const [movementItems, setMovementItems] = useState<StockMovementRow[]>([])
	const [movementLoading, setMovementLoading] = useState(false)
	const [movementRefreshing, setMovementRefreshing] = useState(false)
	const [movementSearch, setMovementSearch] = useState('')
	const [movementTypeFilter, setMovementTypeFilter] = useState('all')
	const [movementPagination, setMovementPagination] =
		useState<Pagination>(DEFAULT_PAGINATION)

	const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
	const [adjustingVariant, setAdjustingVariant] =
		useState<ComposerVariantRow | null>(null)
	const [adjustSubmitting, setAdjustSubmitting] = useState(false)
	const [adjustQuantity, setAdjustQuantity] = useState('1')
	const [adjustType, setAdjustType] = useState('adjust_in')
	const [adjustNote, setAdjustNote] = useState('')
	const [variantHistoryLoading, setVariantHistoryLoading] = useState(false)
	const [variantHistory, setVariantHistory] = useState<StockMovementRow[]>([])

	const loadProducts = useCallback(async (silent = false) => {
		if (silent) {
			setRefreshing(true)
		} else {
			setLoading(true)
		}
		try {
			const response = await commerce.listProducts()
			const payload = extractData<{ products: ProductRow[] }>(response)
			setProducts(payload.products || [])
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Gagal memuat produk',
			)
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}, [])

	const loadStock = useCallback(
		async (page: number, silent = false) => {
			if (silent) {
				setStockRefreshing(true)
			} else {
				setStockLoading(true)
			}
			try {
				const response = await commerce.listStockVariants({
					page,
					limit: 25,
					search: stockSearch.trim() || undefined,
					low_stock: stockLowOnly,
					threshold: stockThreshold,
				})
				const payload = extractData<{
					items: StockVariant[]
					pagination: Pagination
				}>(response)
				setStockItems(payload.items || [])
				setStockPagination((prev) => ({
					...prev,
					...(payload.pagination || prev),
					page,
				}))
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : 'Gagal memuat stok',
				)
			} finally {
				setStockLoading(false)
				setStockRefreshing(false)
			}
		},
		[stockLowOnly, stockSearch, stockThreshold],
	)

	const loadMovements = useCallback(
		async (page: number, silent = false) => {
			if (silent) {
				setMovementRefreshing(true)
			} else {
				setMovementLoading(true)
			}
			try {
				const response = await commerce.listStockMovements({
					page,
					limit: 25,
					search: movementSearch.trim() || undefined,
					movement_type:
						movementTypeFilter === 'all' ? undefined : movementTypeFilter,
				})
				const payload = extractData<{
					items: StockMovementRow[]
					pagination: Pagination
				}>(response)
				setMovementItems(payload.items || [])
				setMovementPagination((prev) => ({
					...prev,
					...(payload.pagination || prev),
					page,
				}))
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : 'Gagal memuat histori stok',
				)
			} finally {
				setMovementLoading(false)
				setMovementRefreshing(false)
			}
		},
		[movementSearch, movementTypeFilter],
	)

	const loadVariantHistory = useCallback(async (variantId: string) => {
		setVariantHistoryLoading(true)
		try {
			const response = await commerce.listStockMovements({
				page: 1,
				limit: 8,
				variant_id: variantId,
			})
			const payload = extractData<{
				items: StockMovementRow[]
				pagination: Pagination
			}>(response)
			setVariantHistory(payload.items || [])
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Gagal memuat histori varian',
			)
		} finally {
			setVariantHistoryLoading(false)
		}
	}, [])

	useEffect(() => {
		void loadProducts()
	}, [loadProducts])

	useEffect(() => {
		if (activeTab !== 'stock') return
		const handle = window.setTimeout(() => {
			void loadStock(1)
		}, 250)
		return () => window.clearTimeout(handle)
	}, [activeTab, loadStock])

	useEffect(() => {
		if (activeTab !== 'stock') return
		const handle = window.setTimeout(() => {
			void loadMovements(1)
		}, 250)
		return () => window.clearTimeout(handle)
	}, [activeTab, loadMovements])

	const filteredProducts = useMemo(() => {
		const query = search.trim().toLowerCase()
		return products.filter((product) => {
			if (statusFilter === 'active' && !product.is_active) return false
			if (statusFilter === 'inactive' && product.is_active) return false
			if (!query) return true
			const productMatch = [product.name, product.sku, product.description]
				.map((value) => String(value || '').toLowerCase())
				.some((value) => value.includes(query))
			if (productMatch) return true
			return product.variants.some((variant) =>
				[String(variant.name || ''), String(variant.sku || '')]
					.map((value) => value.toLowerCase())
					.some((value) => value.includes(query)),
			)
		})
	}, [products, search, statusFilter])

	const catalogTotalPages = useMemo(
		() => Math.max(1, Math.ceil(filteredProducts.length / CATALOG_PAGE_SIZE)),
		[filteredProducts.length],
	)

	const activeCatalogPage = useMemo(
		() => clamp(catalogPage, 1, catalogTotalPages),
		[catalogPage, catalogTotalPages],
	)

	const paginatedCatalogProducts = useMemo(() => {
		const start = (activeCatalogPage - 1) * CATALOG_PAGE_SIZE
		return filteredProducts.slice(start, start + CATALOG_PAGE_SIZE)
	}, [activeCatalogPage, filteredProducts])

	const catalogRangeLabel = useMemo(() => {
		if (filteredProducts.length === 0) {
			return 'Menampilkan 0 dari 0 produk'
		}
		const start = (activeCatalogPage - 1) * CATALOG_PAGE_SIZE + 1
		const end = Math.min(
			activeCatalogPage * CATALOG_PAGE_SIZE,
			filteredProducts.length,
		)
		return `Menampilkan ${start}-${end} dari ${filteredProducts.length} produk`
	}, [activeCatalogPage, filteredProducts.length])

	const setProductVariantPage = (
		productId: string,
		totalVariants: number,
		nextPage: number,
	) => {
		const totalPages = Math.max(
			1,
			Math.ceil(totalVariants / CATALOG_VARIANT_PAGE_SIZE),
		)
		const safePage = clamp(nextPage, 1, totalPages)
		setCatalogVariantPageByProductId((prev) => {
			if (
				safePage === 1 &&
				!Object.prototype.hasOwnProperty.call(prev, productId)
			) {
				return prev
			}
			if (prev[productId] === safePage) return prev
			if (safePage === 1) {
				const next = { ...prev }
				delete next[productId]
				return next
			}
			return { ...prev, [productId]: safePage }
		})
	}

	useEffect(() => {
		setCatalogPage(1)
		setCatalogVariantPageByProductId({})
	}, [search, statusFilter])

	useEffect(() => {
		setCatalogPage((prev) => clamp(prev, 1, catalogTotalPages))
	}, [catalogTotalPages])

	const productMapById = useMemo(() => {
		return new Map(products.map((product) => [product.id, product]))
	}, [products])

	const openCreateProductComposer = () => {
		setEditingProduct(null)
		setProductForm(DEFAULT_PRODUCT_FORM)
		setProductImageUploading(false)
		setVariantRows([createEmptyVariantRow()])
		setDeactivateVariantIds([])
		setComposerOpen(true)
	}

	const openEditProductComposer = (product: ProductRow) => {
		setEditingProduct(product)
		setProductForm({
			name: product.name,
			sku: product.sku || '',
			image_url: product.image_url || '',
			description: product.description || '',
			base_price: String(product.base_price || 0),
			is_active: product.is_active ? 'true' : 'false',
		})
		setVariantRows(
			product.variants.length > 0
				? product.variants.map((variant) => toComposerRow(variant))
				: [createEmptyVariantRow()],
		)
		setProductImageUploading(false)
		setDeactivateVariantIds([])
		setComposerOpen(true)
	}

	const handleProductImageUpload = async (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		if (!file.type.startsWith('image/')) {
			toast.error('File harus berupa gambar.')
			return
		}

		const maxSizeBytes = 5 * 1024 * 1024
		if (file.size > maxSizeBytes) {
			toast.error('Ukuran file maksimal 5MB.')
			return
		}

		setProductImageUploading(true)
		try {
			const result = await media.upload(file, 'whatsapp')
			if (!result.success || !result.payload?.url) {
				throw new Error(result.error || 'Upload gambar gagal')
			}

			setProductForm((prev) => ({
				...prev,
				image_url: result.payload?.url || '',
			}))
			toast.success('Gambar produk berhasil diupload.')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Gagal upload gambar produk',
			)
		} finally {
			setProductImageUploading(false)
		}
	}

	const openProductFromStock = (productId: string) => {
		const product = productMapById.get(productId)
		if (!product) {
			toast.error('Produk belum tersedia di cache. Silakan refresh products.')
			return
		}
		openEditProductComposer(product)
	}

	const addVariantRow = () => {
		setVariantRows((current) => [...current, createEmptyVariantRow()])
	}

	const removeVariantRow = (clientId: string) => {
		setVariantRows((current) => {
			const target = current.find((row) => row.client_id === clientId)
			if (!target) return current
			if (target.id) {
				setDeactivateVariantIds((prev) =>
					prev.includes(target.id as string)
						? prev
						: [...prev, target.id as string],
				)
			}
			const next = current.filter((row) => row.client_id !== clientId)
			return next.length > 0 ? next : [createEmptyVariantRow()]
		})
	}

	const updateVariantRow = (
		clientId: string,
		patch: Partial<ComposerVariantRow>,
	) => {
		setVariantRows((current) =>
			current.map((row) =>
				row.client_id === clientId ? { ...row, ...patch } : row,
			),
		)
	}

	const openAdjustDialog = (row: ComposerVariantRow) => {
		if (!row.id) {
			toast.error('Varian harus disimpan dulu sebelum stock adjustment')
			return
		}
		setAdjustingVariant(row)
		setAdjustQuantity('1')
		setAdjustType('adjust_in')
		setAdjustNote('')
		setAdjustDialogOpen(true)
		void loadVariantHistory(row.id)
	}

	const validateAndBuildVariantPayload =
		(): BulkVariantUpsertPayload | null => {
			const candidateRows = variantRows.filter((row) => hasVariantContent(row))
			const skuSet = new Set<string>()
			const upserts: VariantDraft[] = []

			for (const row of candidateRows) {
				const name = row.name.trim()
				if (!name) {
					toast.error('Nama varian wajib diisi')
					return null
				}

				const price = Number(row.price)
				if (!Number.isFinite(price) || price < 0) {
					toast.error(`Harga varian "${name}" tidak valid`)
					return null
				}

				if (!row.id) {
					const stockInitial = Number(row.stock_on_hand)
					if (!Number.isFinite(stockInitial) || stockInitial < 0) {
						toast.error(`Stok awal varian "${name}" tidak valid`)
						return null
					}
				}

				const normalizedSku = row.sku.trim().toLowerCase()
				if (normalizedSku) {
					if (skuSet.has(normalizedSku)) {
						toast.error(`SKU duplikat ditemukan di modal: ${row.sku.trim()}`)
						return null
					}
					skuSet.add(normalizedSku)
				}

				upserts.push({
					...(row.id ? { id: row.id } : {}),
					name,
					sku: row.sku.trim() || generateSKU(),
					image_url: row.image_url.trim() || undefined,
					price: Math.max(0, price),
					stock_on_hand: row.id
						? undefined
						: Math.max(0, Math.floor(Number(row.stock_on_hand || 0))),
					is_active: row.is_active === 'true',
				})
			}

			return {
				upserts,
				deactivate_variant_ids: deactivateVariantIds,
			}
		}

	const submitComposer = async () => {
		if (!productForm.name.trim()) {
			toast.error('Nama produk wajib diisi')
			return
		}

		const variantPayload = validateAndBuildVariantPayload()
		if (!variantPayload) return

		setComposerSubmitting(true)
		try {
			const productPayload = {
				name: productForm.name.trim(),
				sku: productForm.sku.trim() || generateSKU(),
				image_url: productForm.image_url.trim() || null,
				description: productForm.description.trim() || null,
				base_price: Number(productForm.base_price || 0),
				is_active: productForm.is_active === 'true',
			}

			let productId = editingProduct?.id || null
			if (editingProduct) {
				await commerce.updateProduct(editingProduct.id, productPayload)
			} else {
				const response = await commerce.createProduct(productPayload)
				const created = extractData<{ id: string }>(response)
				productId = created.id
			}

			if (!productId) {
				throw new Error('Product ID tidak ditemukan setelah simpan')
			}

			if (
				variantPayload.upserts.length > 0 ||
				(variantPayload.deactivate_variant_ids || []).length > 0
			) {
				await commerce.bulkUpsertVariants(productId, variantPayload)
			}

			toast.success(
				editingProduct
					? 'Produk berhasil diperbarui'
					: 'Produk berhasil dibuat',
			)
			setComposerOpen(false)
			await Promise.all([
				loadProducts(true),
				activeTab === 'stock'
					? loadStock(stockPagination.page, true)
					: Promise.resolve(),
				activeTab === 'stock'
					? loadMovements(movementPagination.page, true)
					: Promise.resolve(),
			])
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Gagal menyimpan produk',
			)
		} finally {
			setComposerSubmitting(false)
		}
	}

	const submitAdjustStock = async () => {
		if (!adjustingVariant?.id) return
		const numeric = Number(adjustQuantity)
		if (!Number.isFinite(numeric) || numeric <= 0) {
			toast.error('Quantity harus lebih dari 0')
			return
		}

		setAdjustSubmitting(true)
		try {
			const direction = adjustType === 'adjust_out' ? -1 : 1
			const response = await commerce.adjustStock(adjustingVariant.id, {
				quantity: direction * Math.floor(Math.abs(numeric)),
				movement_type: adjustType,
				note: adjustNote.trim() || undefined,
			})
			const payload = extractData<{
				stock_on_hand: number
				stock_reserved: number
				available_stock: number
			}>(response)

			setVariantRows((current) =>
				current.map((row) =>
					row.id === adjustingVariant.id
						? {
								...row,
								stock_on_hand: String(payload.stock_on_hand),
								stock_reserved: payload.stock_reserved,
								available_stock: payload.available_stock,
							}
						: row,
				),
			)
			setAdjustingVariant((current) =>
				current && current.id === adjustingVariant.id
					? {
							...current,
							stock_on_hand: String(payload.stock_on_hand),
							stock_reserved: payload.stock_reserved,
							available_stock: payload.available_stock,
						}
					: current,
			)

			await Promise.all([
				loadVariantHistory(adjustingVariant.id),
				loadProducts(true),
				activeTab === 'stock'
					? loadStock(stockPagination.page, true)
					: Promise.resolve(),
				activeTab === 'stock'
					? loadMovements(movementPagination.page, true)
					: Promise.resolve(),
			])
			toast.success('Stock berhasil di-adjust')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal adjust stock')
		} finally {
			setAdjustSubmitting(false)
		}
	}

	const deactivateProduct = async (product: ProductRow) => {
		if (!window.confirm(`Nonaktifkan produk ${product.name}?`)) return
		try {
			await commerce.deleteProduct(product.id)
			toast.success('Produk berhasil dinonaktifkan')
			await loadProducts(true)
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Gagal menonaktifkan produk',
			)
		}
	}

	const handleRefresh = () => {
		if (activeTab === 'catalog') {
			void loadProducts(true)
			return
		}
		void Promise.all([
			loadStock(stockPagination.page, true),
			loadMovements(movementPagination.page, true),
		])
	}

	const isRefreshing =
		activeTab === 'catalog' ? refreshing : stockRefreshing || movementRefreshing

	return (
		<div className="flex flex-1 flex-col overflow-hidden bg-background">
			<PageHeader
				title="Products"
				description="Kelola katalog produk, varian, dan histori stock movement commerce."
				icon={<Package size={22} />}
				actions={
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={handleRefresh}
							disabled={isRefreshing}
						>
							{isRefreshing ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="mr-2 h-4 w-4" />
							)}
							Refresh
						</Button>
						<Button onClick={openCreateProductComposer}>
							<Plus className="mr-2 h-4 w-4" />
							Tambah Product
						</Button>
					</div>
				}
			/>

			<div className="flex flex-1 flex-col gap-4 overflow-auto px-4 pb-6 lg:px-8">
				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as 'catalog' | 'stock')}
					className="flex flex-1 flex-col gap-4"
				>
					<Card className="overflow-visible py-3">
						<CardContent className="px-4">
							<TabsList
								variant="line"
								className="w-full justify-start gap-2 overflow-x-auto"
							>
								<TabsTrigger value="catalog" className="h-9 flex-none px-3">
									<Package className="mr-2 h-4 w-4" />
									Katalog
								</TabsTrigger>
								<TabsTrigger value="stock" className="h-9 flex-none px-3">
									<Boxes className="mr-2 h-4 w-4" />
									Stok & Histori
								</TabsTrigger>
							</TabsList>
						</CardContent>
					</Card>

					<TabsContent value="catalog" className="mt-0 space-y-4">
						<Card>
							<CardContent className="pt-4 md:pt-5">
								<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
									<div className="relative">
										<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={search}
											onChange={(event) => setSearch(event.target.value)}
											placeholder="Cari produk/varian/SKU"
											className="pl-9"
										/>
									</div>
									<Select
										value={statusFilter}
										onValueChange={(value) =>
											setStatusFilter(value as 'all' | 'active' | 'inactive')
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">Semua status</SelectItem>
											<SelectItem value="active">Aktif</SelectItem>
											<SelectItem value="inactive">Nonaktif</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</CardContent>
						</Card>

						{loading ? (
							<Card>
								<CardContent className="flex h-52 items-center justify-center text-sm text-muted-foreground">
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Memuat produk...
								</CardContent>
							</Card>
						) : (
							<div className="space-y-3">
								{paginatedCatalogProducts.map((product) => {
									const variantTotalPages = Math.max(
										1,
										Math.ceil(
											product.variants.length / CATALOG_VARIANT_PAGE_SIZE,
										),
									)
									const activeVariantPage = clamp(
										catalogVariantPageByProductId[product.id] || 1,
										1,
										variantTotalPages,
									)
									const variantStartIndex =
										(activeVariantPage - 1) * CATALOG_VARIANT_PAGE_SIZE
									const paginatedVariants = product.variants.slice(
										variantStartIndex,
										variantStartIndex + CATALOG_VARIANT_PAGE_SIZE,
									)
									const visibleVariantStart =
										product.variants.length === 0 ? 0 : variantStartIndex + 1
									const visibleVariantEnd = Math.min(
										variantStartIndex + paginatedVariants.length,
										product.variants.length,
									)

									return (
										<Card key={product.id}>
											<CardHeader className="pb-3">
												<div className="flex flex-wrap items-start justify-between gap-3">
													<div className="flex items-start gap-3">
														{product.image_url ? (
															<img
																src={product.image_url}
																alt={product.name}
																className="h-16 w-16 rounded-md border border-border object-cover"
															/>
														) : null}
														<div>
															<CardTitle className="text-base">
																{product.name}
															</CardTitle>
															<div className="mt-1 text-sm text-muted-foreground">
																SKU: {product.sku || '-'} • Base price{' '}
																{formatMoney(product.base_price)}
															</div>
															{product.description ? (
																<div className="mt-1 text-xs text-muted-foreground">
																	{product.description}
																</div>
															) : null}
															<div className="mt-2 text-xs text-muted-foreground">
																{product.variants.length} varian terdaftar
															</div>
														</div>
													</div>
													<div className="flex items-center gap-2">
														<Badge
															variant="outline"
															className={statusBadgeClass(product.is_active)}
														>
															{product.is_active ? 'Active' : 'Inactive'}
														</Badge>
														<Button
															variant="outline"
															size="sm"
															onClick={() => openEditProductComposer(product)}
														>
															<Edit className="mr-2 h-4 w-4" />
															Kelola
														</Button>
														<Button
															variant="outline"
															size="icon"
															onClick={() => void deactivateProduct(product)}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												</div>
											</CardHeader>
											{product.variants.length > 0 ? (
												<CardContent className="space-y-2">
													{paginatedVariants.map((variant) => (
														<div
															key={variant.id}
															className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3 text-sm"
														>
															<div className="flex items-start gap-3">
																{variant.image_url ? (
																	<img
																		src={variant.image_url}
																		alt={variant.name}
																		className="h-12 w-12 rounded-md border border-border object-cover"
																	/>
																) : null}
																<div>
																	<div className="font-medium">
																		{variant.name}
																	</div>
																	<div className="text-xs text-muted-foreground">
																		SKU: {variant.sku || '-'} • Harga{' '}
																		{formatMoney(variant.price)}
																	</div>
																	<div className="text-xs text-muted-foreground">
																		Stock: {variant.stock_on_hand} • Reserved:{' '}
																		{variant.stock_reserved} • Available:{' '}
																		{variant.available_stock}
																	</div>
																</div>
															</div>
															<Badge
																variant="outline"
																className={statusBadgeClass(variant.is_active)}
															>
																{variant.is_active ? 'Active' : 'Inactive'}
															</Badge>
														</div>
													))}
													<div className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
														<span>
															Menampilkan {visibleVariantStart}-
															{visibleVariantEnd} dari {product.variants.length}{' '}
															varian
														</span>
														{variantTotalPages > 1 ? (
															<div className="flex items-center gap-2">
																<span>
																	Halaman {activeVariantPage}/
																	{variantTotalPages}
																</span>
																<Button
																	variant="outline"
																	size="sm"
																	className="h-7 px-2"
																	disabled={activeVariantPage <= 1}
																	onClick={() =>
																		setProductVariantPage(
																			product.id,
																			product.variants.length,
																			activeVariantPage - 1,
																		)
																	}
																>
																	Prev
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	className="h-7 px-2"
																	disabled={
																		activeVariantPage >= variantTotalPages
																	}
																	onClick={() =>
																		setProductVariantPage(
																			product.id,
																			product.variants.length,
																			activeVariantPage + 1,
																		)
																	}
																>
																	Next
																</Button>
															</div>
														) : null}
													</div>
												</CardContent>
											) : null}
										</Card>
									)
								})}
								{filteredProducts.length > 0 ? (
									<Card>
										<CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
											<span className="text-muted-foreground">
												{catalogRangeLabel}
											</span>
											<div className="flex items-center gap-2">
												<span className="text-muted-foreground">
													Halaman {activeCatalogPage}/{catalogTotalPages}
												</span>
												<Button
													variant="outline"
													size="sm"
													disabled={activeCatalogPage <= 1}
													onClick={() =>
														setCatalogPage((prev) =>
															clamp(prev - 1, 1, catalogTotalPages),
														)
													}
												>
													Prev
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={activeCatalogPage >= catalogTotalPages}
													onClick={() =>
														setCatalogPage((prev) =>
															clamp(prev + 1, 1, catalogTotalPages),
														)
													}
												>
													Next
												</Button>
											</div>
										</CardContent>
									</Card>
								) : null}
								{filteredProducts.length === 0 ? (
									<Card>
										<CardContent className="text-sm text-muted-foreground">
											Tidak ada produk yang sesuai filter.
										</CardContent>
									</Card>
								) : null}
							</div>
						)}
					</TabsContent>

					<TabsContent value="stock" className="mt-0 space-y-4">
						<Card>
							<CardContent className="pt-4 md:pt-5">
								<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_150px] md:items-center">
									<div className="relative">
										<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={stockSearch}
											onChange={(event) => setStockSearch(event.target.value)}
											placeholder="Cari SKU / nama produk"
											className="pl-9"
										/>
									</div>
									<Select
										value={stockLowOnly ? 'yes' : 'no'}
										onValueChange={(value) => setStockLowOnly(value === 'yes')}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Low stock" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="no">Semua stok</SelectItem>
											<SelectItem value="yes">Hanya low stock</SelectItem>
										</SelectContent>
									</Select>
									<Input
										type="number"
										value={stockThreshold}
										onChange={(event) =>
											setStockThreshold(
												Math.max(0, Number(event.target.value || 0)),
											)
										}
										placeholder="Threshold"
									/>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									Ringkasan Stok Varian
								</CardTitle>
							</CardHeader>
							<CardContent>
								{stockLoading ? (
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
												{stockItems.map((item) => (
													<TableRow key={item.id}>
														<TableCell>
															<div className="font-medium">{item.name}</div>
															<div className="text-xs text-muted-foreground">
																{item.product_name}
															</div>
														</TableCell>
														<TableCell>{item.sku || '-'}</TableCell>
														<TableCell>{item.stock_on_hand}</TableCell>
														<TableCell>{item.stock_reserved}</TableCell>
														<TableCell>
															<div className="flex items-center gap-2">
																<span>{item.available_stock}</span>
																{item.low_stock ? (
																	<Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">
																		Low
																	</Badge>
																) : null}
															</div>
														</TableCell>
														<TableCell>
															<Badge
																variant="outline"
																className={statusBadgeClass(item.is_active)}
															>
																{item.is_active ? 'Active' : 'Inactive'}
															</Badge>
														</TableCell>
														<TableCell>
															<Button
																variant="outline"
																size="sm"
																onClick={() =>
																	openProductFromStock(item.product_id)
																}
															>
																<Edit className="mr-2 h-4 w-4" />
																Kelola Produk
															</Button>
														</TableCell>
													</TableRow>
												))}
												{stockItems.length === 0 ? (
													<TableRow>
														<TableCell
															colSpan={7}
															className="text-center text-sm text-muted-foreground"
														>
															Tidak ada data stock.
														</TableCell>
													</TableRow>
												) : null}
											</TableBody>
										</Table>

										<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
											<div>
												Total {stockPagination.total_items} varian • Halaman{' '}
												{stockPagination.page}/
												{Math.max(1, stockPagination.total_pages || 1)}
											</div>
											<div className="flex gap-2">
												<Button
													variant="outline"
													size="sm"
													disabled={stockPagination.page <= 1}
													onClick={() =>
														void loadStock(stockPagination.page - 1)
													}
												>
													Prev
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={
														stockPagination.page >=
														(stockPagination.total_pages || 1)
													}
													onClick={() =>
														void loadStock(stockPagination.page + 1)
													}
												>
													Next
												</Button>
											</div>
										</div>
									</>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="space-y-4">
								<CardTitle className="text-base">
									Riwayat Pergerakan Stok
								</CardTitle>
								<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
									<div className="relative">
										<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={movementSearch}
											onChange={(event) =>
												setMovementSearch(event.target.value)
											}
											placeholder="Cari product / variant / note"
											className="pl-9"
										/>
									</div>
									<Select
										value={movementTypeFilter}
										onValueChange={(value) => {
											if (!value) return
											setMovementTypeFilter(value)
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Movement type" />
										</SelectTrigger>
										<SelectContent>
											{MOVEMENT_FILTER_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</CardHeader>
							<CardContent>
								{movementLoading ? (
									<div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Memuat histori stok...
									</div>
								) : (
									<>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Waktu</TableHead>
													<TableHead>Product / Variant</TableHead>
													<TableHead>Tipe</TableHead>
													<TableHead>Qty</TableHead>
													<TableHead>Sebelum → Sesudah</TableHead>
													<TableHead>Catatan</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{movementItems.map((item) => (
													<TableRow key={item.id}>
														<TableCell>
															{formatDateTime(item.created_at)}
														</TableCell>
														<TableCell>
															<div className="font-medium">
																{item.product_name}
															</div>
															<div className="text-xs text-muted-foreground">
																{item.variant_name} • SKU {item.sku || '-'}
															</div>
														</TableCell>
														<TableCell>
															<Badge
																variant="outline"
																className={movementBadgeClass(
																	item.movement_type,
																)}
															>
																{normalizeMovementType(item.movement_type)}
															</Badge>
														</TableCell>
														<TableCell>{item.quantity}</TableCell>
														<TableCell>
															{item.stock_before} → {item.stock_after}
														</TableCell>
														<TableCell>{item.note || '-'}</TableCell>
													</TableRow>
												))}
												{movementItems.length === 0 ? (
													<TableRow>
														<TableCell
															colSpan={6}
															className="text-center text-sm text-muted-foreground"
														>
															Belum ada histori pergerakan stok.
														</TableCell>
													</TableRow>
												) : null}
											</TableBody>
										</Table>

										<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
											<div>
												Total {movementPagination.total_items} movement •
												Halaman {movementPagination.page}/
												{Math.max(1, movementPagination.total_pages || 1)}
											</div>
											<div className="flex gap-2">
												<Button
													variant="outline"
													size="sm"
													disabled={movementPagination.page <= 1}
													onClick={() =>
														void loadMovements(movementPagination.page - 1)
													}
												>
													Prev
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={
														movementPagination.page >=
														(movementPagination.total_pages || 1)
													}
													onClick={() =>
														void loadMovements(movementPagination.page + 1)
													}
												>
													Next
												</Button>
											</div>
										</div>
									</>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>

			<Dialog open={composerOpen} onOpenChange={setComposerOpen}>
				<DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
					<DialogHeader>
						<DialogTitle>
							{editingProduct
								? 'Edit Product & Variants'
								: 'Tambah Product & Variants'}
						</DialogTitle>
						<DialogDescription>
							Simpan product dan beberapa varian dalam satu modal. Untuk varian
							existing, stok diubah lewat tombol stock adjustment pada row.
						</DialogDescription>
					</DialogHeader>

					<div className="flex-1 overflow-auto space-y-4 pr-1">
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Product Info</CardTitle>
							</CardHeader>
							<CardContent>
								<FieldGroup className="grid gap-4 md:grid-cols-2">
									<Field>
										<FieldLabel htmlFor="composer-product-name">
											Nama Produk
										</FieldLabel>
										<Input
											id="composer-product-name"
											placeholder="Masukkan nama produk"
											value={productForm.name}
											onChange={(event) =>
												setProductForm((prev) => ({
													...prev,
													name: event.target.value,
												}))
											}
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="composer-product-sku">SKU</FieldLabel>
										<Input
											id="composer-product-sku"
											placeholder="Kosongkan untuk auto generate"
											value={productForm.sku}
											onChange={(event) =>
												setProductForm((prev) => ({
													...prev,
													sku: event.target.value,
												}))
											}
										/>
									</Field>
									<Field className="md:col-span-2">
										<FieldLabel htmlFor="composer-product-image">
											Gambar Produk
										</FieldLabel>
										<div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
											<div className="h-[120px] w-[120px] overflow-hidden rounded-md border border-border bg-muted/30">
												{productForm.image_url ? (
													<img
														src={productForm.image_url}
														alt={productForm.name || 'Preview produk'}
														className="h-full w-full object-cover"
													/>
												) : (
													<div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
														Belum ada gambar
													</div>
												)}
											</div>
											<div className="space-y-2">
												<input
													ref={productImageInputRef}
													type="file"
													accept="image/*"
													className="hidden"
													onChange={handleProductImageUpload}
													disabled={productImageUploading || composerSubmitting}
												/>
												<div className="flex flex-wrap gap-2">
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() =>
															productImageInputRef.current?.click()
														}
														disabled={
															productImageUploading || composerSubmitting
														}
													>
														{productImageUploading ? (
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
														) : (
															<Upload className="mr-2 h-4 w-4" />
														)}
														Upload Image
													</Button>
													{productForm.image_url ? (
														<Button
															type="button"
															variant="outline"
															size="sm"
															onClick={() =>
																setProductForm((prev) => ({
																	...prev,
																	image_url: '',
																}))
															}
															disabled={
																productImageUploading || composerSubmitting
															}
														>
															Remove
														</Button>
													) : null}
												</div>
												<Input
													id="composer-product-image"
													placeholder="Atau tempel URL gambar (https://...)"
													value={productForm.image_url}
													onChange={(event) =>
														setProductForm((prev) => ({
															...prev,
															image_url: event.target.value,
														}))
													}
												/>
												<div className="text-xs text-muted-foreground">
													Format gambar umum didukung. Ukuran maksimal 5MB.
												</div>
											</div>
										</div>
									</Field>
									<Field>
										<FieldLabel htmlFor="composer-product-price">
											Base Price
										</FieldLabel>
										<Input
											id="composer-product-price"
											type="number"
											min={0}
											value={productForm.base_price}
											onChange={(event) =>
												setProductForm((prev) => ({
													...prev,
													base_price: event.target.value,
												}))
											}
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="composer-product-status">
											Status
										</FieldLabel>
										<Select
											value={productForm.is_active}
											onValueChange={(value) => {
												if (!value) return
												setProductForm((prev) => ({
													...prev,
													is_active: value,
												}))
											}}
										>
											<SelectTrigger id="composer-product-status">
												<SelectValue placeholder="Pilih status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="true">Aktif</SelectItem>
												<SelectItem value="false">Tidak Aktif</SelectItem>
											</SelectContent>
										</Select>
									</Field>
									<Field className="md:col-span-2">
										<FieldLabel htmlFor="composer-product-desc">
											Deskripsi
										</FieldLabel>
										<Textarea
											id="composer-product-desc"
											placeholder="Masukkan deskripsi produk"
											value={productForm.description}
											onChange={(event) =>
												setProductForm((prev) => ({
													...prev,
													description: event.target.value,
												}))
											}
										/>
									</Field>
								</FieldGroup>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0">
								<CardTitle className="text-base">Bulk Variant Rows</CardTitle>
								<Button variant="outline" size="sm" onClick={addVariantRow}>
									<Plus className="mr-2 h-4 w-4" />
									Tambah Row
								</Button>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nama Varian</TableHead>
											<TableHead>SKU</TableHead>
											<TableHead>Gambar</TableHead>
											<TableHead>Harga</TableHead>
											<TableHead>Stok</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Aksi</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{variantRows.map((row) => (
											<TableRow key={row.client_id}>
												<TableCell>
													<Input
														placeholder="Nama varian"
														value={row.name}
														onChange={(event) =>
															updateVariantRow(row.client_id, {
																name: event.target.value,
															})
														}
													/>
												</TableCell>
												<TableCell>
													<Input
														placeholder="SKU varian"
														value={row.sku}
														onChange={(event) =>
															updateVariantRow(row.client_id, {
																sku: event.target.value,
															})
														}
													/>
												</TableCell>
												<TableCell>
													<Input
														placeholder="https://..."
														value={row.image_url}
														onChange={(event) =>
															updateVariantRow(row.client_id, {
																image_url: event.target.value,
															})
														}
													/>
												</TableCell>
												<TableCell>
													<Input
														type="number"
														min={0}
														value={row.price}
														onChange={(event) =>
															updateVariantRow(row.client_id, {
																price: event.target.value,
															})
														}
													/>
												</TableCell>
												<TableCell>
													{row.id ? (
														<div className="space-y-2 text-xs">
															<div className="text-muted-foreground">
																On hand {row.stock_on_hand} • Reserved{' '}
																{row.stock_reserved} • Available{' '}
																{row.available_stock}
															</div>
															<Button
																variant="outline"
																size="sm"
																onClick={() => openAdjustDialog(row)}
															>
																<Wrench className="mr-2 h-4 w-4" />
																Adjust In / Out
															</Button>
														</div>
													) : (
														<Input
															type="number"
															min={0}
															placeholder="Stok awal"
															value={row.stock_on_hand}
															onChange={(event) =>
																updateVariantRow(row.client_id, {
																	stock_on_hand: event.target.value,
																})
															}
														/>
													)}
												</TableCell>
												<TableCell>
													<Select
														value={row.is_active}
														onValueChange={(value) => {
															if (!value) return
															updateVariantRow(row.client_id, {
																is_active: value,
															})
														}}
													>
														<SelectTrigger>
															<SelectValue placeholder="Status" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="true">Aktif</SelectItem>
															<SelectItem value="false">Tidak Aktif</SelectItem>
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell>
													<Button
														variant="outline"
														size="icon"
														onClick={() => removeVariantRow(row.client_id)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								{deactivateVariantIds.length > 0 ? (
									<div className="mt-3 text-xs text-muted-foreground">
										{deactivateVariantIds.length} varian existing akan
										dinonaktifkan (soft delete) saat simpan.
									</div>
								) : null}
							</CardContent>
						</Card>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setComposerOpen(false)}>
							Batal
						</Button>
						<Button
							onClick={() => void submitComposer()}
							disabled={composerSubmitting}
						>
							{composerSubmitting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Simpan Product + Variants
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
				<DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
					<DialogHeader>
						<DialogTitle>Stock Adjustment</DialogTitle>
						<DialogDescription>
							{adjustingVariant?.name || '-'} ({adjustingVariant?.sku || '-'})
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 overflow-auto pr-1">
						<div className="grid gap-3 md:grid-cols-[200px_160px_1fr]">
							<Select
								value={adjustType}
								onValueChange={(value) => {
									if (!value) return
									setAdjustType(value)
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Movement type" />
								</SelectTrigger>
								<SelectContent>
									{ADJUSTMENT_MOVEMENT_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input
								type="number"
								min={1}
								value={adjustQuantity}
								onChange={(event) => setAdjustQuantity(event.target.value)}
								placeholder="Qty"
							/>
							<Input value={adjustingVariant?.stock_on_hand || '0'} disabled />
						</div>
						<Textarea
							value={adjustNote}
							onChange={(event) => setAdjustNote(event.target.value)}
							placeholder="Catatan adjustment"
						/>

						<div className="rounded border border-border">
							<div className="border-b border-border px-3 py-2 text-sm font-medium">
								Histori Terbaru Varian
							</div>
							<div className="max-h-64 overflow-auto p-3">
								{variantHistoryLoading ? (
									<div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Memuat histori...
									</div>
								) : variantHistory.length === 0 ? (
									<div className="text-sm text-muted-foreground">
										Belum ada histori untuk varian ini.
									</div>
								) : (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Waktu</TableHead>
												<TableHead>Tipe</TableHead>
												<TableHead>Qty</TableHead>
												<TableHead>Before → After</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{variantHistory.map((item) => (
												<TableRow key={item.id}>
													<TableCell>
														{formatDateTime(item.created_at)}
													</TableCell>
													<TableCell>
														<Badge
															variant="outline"
															className={movementBadgeClass(item.movement_type)}
														>
															{normalizeMovementType(item.movement_type)}
														</Badge>
													</TableCell>
													<TableCell>{item.quantity}</TableCell>
													<TableCell>
														{item.stock_before} → {item.stock_after}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setAdjustDialogOpen(false)}
						>
							Tutup
						</Button>
						<Button
							onClick={() => void submitAdjustStock()}
							disabled={adjustSubmitting}
						>
							{adjustSubmitting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Simpan Adjustment
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
