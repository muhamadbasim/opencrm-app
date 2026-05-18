import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import prisma from '../src/lib/prisma'

const DEFAULT_TARGET_EMAIL = 'tech@alkindikids.com'
const TARGET_EMAIL = String(
	process.env.KB_TARGET_EMAIL || DEFAULT_TARGET_EMAIL,
).trim()
const OUTPUT_PATH = process.env.KB_OUTPUT_PATH
	? path.resolve(process.env.KB_OUTPUT_PATH)
	: path.resolve(process.cwd(), 'knowledge/products-knowledge-base.md')

function toNumber(value: unknown): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0
	if (typeof value === 'bigint') return Number(value)
	if (typeof value === 'string') {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : 0
	}
	if (value && typeof value === 'object' && 'toString' in value) {
		const parsed = Number(String(value))
		return Number.isFinite(parsed) ? parsed : 0
	}
	return 0
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0,
	}).format(toNumber(value))
}

function formatDate(value: Date | null | undefined): string {
	if (!value) return '-'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '-'
	return date.toISOString()
}

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	return value as Record<string, unknown>
}

function formatAttributes(value: unknown): string {
	const attrs = toRecord(value)
	if (!attrs) return '-'
	const entries = Object.entries(attrs)
	if (entries.length === 0) return '-'
	return entries
		.map(([key, raw]) => {
			if (
				raw === null ||
				typeof raw === 'string' ||
				typeof raw === 'number' ||
				typeof raw === 'boolean'
			) {
				return `${key}: ${String(raw)}`
			}
			return `${key}: ${JSON.stringify(raw)}`
		})
		.join('; ')
}

async function resolveTargetContext(email: string) {
	const user = await prisma.users.findFirst({
		where: {
			email: {
				equals: email,
				mode: 'insensitive',
			},
		},
		select: {
			id: true,
			email: true,
			name: true,
			app_id: true,
		},
	})

	if (!user) {
		throw new Error(`User not found for email: ${email}`)
	}

	let appId = user.app_id || null
	let organizationId: string | null = null

	const membership = await prisma.member.findFirst({
		where: { userId: user.id },
		select: {
			organizationId: true,
			organization: {
				select: {
					id: true,
					name: true,
					appId: true,
				},
			},
		},
		orderBy: { createdAt: 'asc' },
	})

	if (!appId && membership?.organization?.appId) {
		appId = membership.organization.appId
	}
	if (membership?.organization?.id) {
		organizationId = membership.organization.id
	}

	if (!appId) {
		throw new Error(
			`App context not found for user ${email}. Set users.app_id or organization.appId first.`,
		)
	}

	const app = await prisma.apps.findUnique({
		where: { id: appId },
		select: {
			id: true,
			app_name: true,
			business_name: true,
		},
	})
	if (!app) {
		throw new Error(`App not found: ${appId}`)
	}

	if (!organizationId) {
		const org = await prisma.organization.findFirst({
			where: { appId: appId },
			select: { id: true },
		})
		organizationId = org?.id || null
	}

	return {
		user,
		app,
		appId,
		organizationId,
	}
}

async function main() {
	console.log('Generating product knowledge base markdown...')
	console.log(`Target user: ${TARGET_EMAIL}`)

	const context = await resolveTargetContext(TARGET_EMAIL)

	const products = await prisma.products.findMany({
		where: {
			app_id: context.appId,
			is_active: true,
		},
		orderBy: [{ name: 'asc' }, { created_at: 'asc' }],
		select: {
			id: true,
			name: true,
			sku: true,
			image_url: true,
			description: true,
			base_price: true,
			created_at: true,
			updated_at: true,
		},
	})

	const productIds = products.map((item) => item.id)
	const variants =
		productIds.length > 0
			? await prisma.product_variants.findMany({
					where: {
						app_id: context.appId,
						product_id: { in: productIds },
						is_active: true,
					},
					orderBy: [{ product_id: 'asc' }, { name: 'asc' }],
					select: {
						id: true,
						product_id: true,
						name: true,
						sku: true,
						image_url: true,
						price: true,
						stock_on_hand: true,
						stock_reserved: true,
						attributes: true,
						updated_at: true,
					},
			  })
			: []

	const variantsByProduct = new Map<
		string,
		(typeof variants)[number][]
	>()
	for (const variant of variants) {
		const list = variantsByProduct.get(variant.product_id) || []
		list.push(variant)
		variantsByProduct.set(variant.product_id, list)
	}

	const generatedAt = new Date().toISOString()
	const appLabel =
		context.app.app_name ||
		context.app.business_name ||
		context.user.name ||
		context.user.email ||
		'Unknown App'

	let md = ''
	md += `# Knowledge Base Produk - ${appLabel}\n\n`
	md += `Dokumen ini dibuat otomatis dari data produk aktif di database.\n\n`
	md += `- Generated at: ${generatedAt}\n`
	md += `- Target user: ${context.user.email}\n`
	md += `- App ID: ${context.appId}\n`
	md += `- Organization ID: ${context.organizationId || '-'}\n`
	md += `- Total produk aktif: ${products.length}\n`
	md += `- Total varian aktif: ${variants.length}\n\n`

	md += `## Ringkasan Produk\n\n`
	md += `| Produk | SKU | Base Price | Jumlah Varian | Gambar |\n`
	md += `| --- | --- | ---: | ---: | --- |\n`

	for (const product of products) {
		const variantCount = variantsByProduct.get(product.id)?.length || 0
		const imageLink = product.image_url ? `[Lihat](${product.image_url})` : '-'
		md += `| ${product.name} | ${product.sku || '-'} | ${formatCurrency(toNumber(product.base_price))} | ${variantCount} | ${imageLink} |\n`
	}

	md += `\n## Detail Produk dan Varian\n\n`

	if (products.length === 0) {
		md += `Belum ada produk aktif pada app ini.\n`
	} else {
		for (let index = 0; index < products.length; index += 1) {
			const product = products[index]
			const productVariants = variantsByProduct.get(product.id) || []
			const totalStockOnHand = productVariants.reduce(
				(sum, item) => sum + toNumber(item.stock_on_hand),
				0,
			)
			const totalReserved = productVariants.reduce(
				(sum, item) => sum + toNumber(item.stock_reserved),
				0,
			)
			const totalAvailable = productVariants.reduce(
				(sum, item) =>
					sum +
					Math.max(0, toNumber(item.stock_on_hand) - toNumber(item.stock_reserved)),
				0,
			)

			md += `### ${index + 1}. ${product.name}\n\n`
			md += `- Product ID: ${product.id}\n`
			md += `- SKU: ${product.sku || '-'}\n`
			md += `- Base price: ${formatCurrency(toNumber(product.base_price))}\n`
			md += `- Deskripsi: ${product.description || '-'}\n`
			md += `- Gambar: ${product.image_url ? `[${product.image_url}](${product.image_url})` : '-'}\n`
			md += `- Created at: ${formatDate(product.created_at)}\n`
			md += `- Updated at: ${formatDate(product.updated_at)}\n`
			md += `- Jumlah varian aktif: ${productVariants.length}\n`
			md += `- Total stock on hand: ${totalStockOnHand}\n`
			md += `- Total stock reserved: ${totalReserved}\n`
			md += `- Total stock available: ${totalAvailable}\n\n`

			md += `#### Varian\n\n`
			md += `| Varian | SKU | Harga | On Hand | Reserved | Available | Attributes | Gambar |\n`
			md += `| --- | --- | ---: | ---: | ---: | ---: | --- | --- |\n`

			if (productVariants.length === 0) {
				md += `| - | - | - | - | - | - | - | - |\n`
			} else {
				for (const variant of productVariants) {
					const onHand = toNumber(variant.stock_on_hand)
					const reserved = toNumber(variant.stock_reserved)
					const available = Math.max(0, onHand - reserved)
					const imageLink = variant.image_url
						? `[Lihat](${variant.image_url})`
						: '-'
					md += `| ${variant.name} | ${variant.sku || '-'} | ${formatCurrency(toNumber(variant.price))} | ${onHand} | ${reserved} | ${available} | ${formatAttributes(variant.attributes)} | ${imageLink} |\n`
				}
			}

			md += '\n'
		}
	}

	const outputDir = path.dirname(OUTPUT_PATH)
	await mkdir(outputDir, { recursive: true })
	await writeFile(OUTPUT_PATH, md, 'utf8')

	console.log(`Knowledge base markdown generated at: ${OUTPUT_PATH}`)
}

main()
	.catch((error) => {
		console.error('Failed generating product knowledge base markdown:', error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})

