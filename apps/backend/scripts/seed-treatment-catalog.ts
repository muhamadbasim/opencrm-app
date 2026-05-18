import { readFile } from 'node:fs/promises'
import path from 'node:path'
import prisma from '../src/lib/prisma'

type TreatmentProductSeed = {
	name: string
	sku: string
	image_url: string | null
	base_price: number | null
	harga_normal_non_member: number | null
	harga_normal_member: number | null
	harga_promo_flash_sale_new_customer: number | null
	harga_special_non_member: number | null
	harga_special_member: number | null
	promo_label: string | null
	special_label: string | null
	unit: string | null
	treatment_sessions: number | null
	description: string | null
	metadata?: Record<string, unknown>
}

type TreatmentCatalogPayload = {
	schema: string
	generated_at: string
	product_count: number
	products: TreatmentProductSeed[]
}

const DEFAULT_TARGET_EMAIL = 'tech@alkindikids.com'
const TARGET_EMAIL = String(
	process.env.SEED_USER_EMAIL || DEFAULT_TARGET_EMAIL,
).trim()

const CATALOG_PATH = process.env.TREATMENT_CATALOG_PATH
	? path.resolve(process.env.TREATMENT_CATALOG_PATH)
	: path.resolve(process.cwd(), 'knowledge/treatment-products.json')

const SEED_TAG = 'treatment_catalog_apr2026_v1'
const UPSERT_VARIANTS = parseBooleanEnv(
	process.env.TREATMENT_SEED_VARIANTS,
	true,
)
const DISABLE_EXISTING_VARIANTS_WHEN_SKIPPED = parseBooleanEnv(
	process.env.TREATMENT_DISABLE_EXISTING_VARIANTS,
	false,
)
const DEFAULT_VARIANT_STOCK = Number(
	process.env.TREATMENT_VARIANT_STOCK || '9999',
)

function parseBooleanEnv(value: unknown, fallback: boolean): boolean {
	if (value === undefined || value === null || String(value).trim() === '') {
		return fallback
	}
	const normalized = String(value).trim().toLowerCase()
	if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
	if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
	return fallback
}

function toNumber(value: unknown): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0
	if (typeof value === 'bigint') return Number(value)
	if (typeof value === 'string') {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : 0
	}
	return 0
}

function parseJsonObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	return value as Record<string, unknown>
}

function getVariantPrice(item: TreatmentProductSeed): number {
	const candidate =
		item.harga_promo_flash_sale_new_customer ||
		item.harga_special_non_member ||
		item.harga_normal_member ||
		item.harga_normal_non_member ||
		item.base_price ||
		0
	return toNumber(candidate)
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
			last_app_used: true,
		},
	})
	if (!user) {
		throw new Error(`User not found for email: ${email}`)
	}

	let appId = user.app_id || user.last_app_used || null
	let organizationId: string | null = null

	const membership = await prisma.member.findFirst({
		where: { userId: user.id },
		include: {
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

async function loadCatalog(filePath: string): Promise<TreatmentProductSeed[]> {
	const raw = await readFile(filePath, 'utf8')
	const parsed = JSON.parse(raw) as TreatmentCatalogPayload
	if (!Array.isArray(parsed.products)) {
		throw new Error(`Invalid catalog format in ${filePath}`)
	}
	return parsed.products
}

async function upsertTreatmentCatalog(
	appId: string,
	organizationId: string | null,
	products: TreatmentProductSeed[],
	options?: {
		upsertVariants?: boolean
		disableExistingVariantsWhenSkipped?: boolean
	},
) {
	const upsertVariants = options?.upsertVariants ?? true
	const disableExistingVariantsWhenSkipped =
		options?.disableExistingVariantsWhenSkipped ?? false

	let createdProducts = 0
	let updatedProducts = 0
	let createdVariants = 0
	let updatedVariants = 0
	let deactivatedVariants = 0

	for (const item of products) {
		const sku = String(item.sku || '').trim()
		const name = String(item.name || '').trim()
		if (!sku || !name) continue

		const existingProduct = await prisma.products.findFirst({
			where: {
				app_id: appId,
				sku,
			},
			select: { id: true },
		})

		const metadata = {
			...parseJsonObject(item.metadata),
			seed_tag: SEED_TAG,
			pricing: {
				normal_non_member: item.harga_normal_non_member,
				normal_member: item.harga_normal_member,
				promo_flash_sale_new_customer: item.harga_promo_flash_sale_new_customer,
				special_non_member: item.harga_special_non_member,
				special_member: item.harga_special_member,
			},
			promo_label: item.promo_label,
			special_label: item.special_label,
			unit: item.unit,
			treatment_sessions: item.treatment_sessions,
		}

		const product = existingProduct
			? await prisma.products.update({
					where: { id: existingProduct.id },
					data: {
						name,
						sku,
						image_url: item.image_url || undefined,
						description: item.description || undefined,
						base_price: toNumber(item.base_price),
						is_active: true,
						organization_id: organizationId || undefined,
						metadata,
						updated_at: new Date(),
					},
				})
			: await prisma.products.create({
					data: {
						app_id: appId,
						organization_id: organizationId || undefined,
						name,
						sku,
						image_url: item.image_url || undefined,
						description: item.description || undefined,
						base_price: toNumber(item.base_price),
						is_active: true,
						metadata,
					},
				})

		if (existingProduct) updatedProducts += 1
		else createdProducts += 1

		if (!upsertVariants) {
			if (disableExistingVariantsWhenSkipped) {
				const deactivated = await prisma.product_variants.updateMany({
					where: {
						app_id: appId,
						product_id: product.id,
						is_active: true,
					},
					data: {
						is_active: false,
						updated_at: new Date(),
					},
				})
				deactivatedVariants += Number(deactivated.count || 0)
			}
			continue
		}

		const variantSku = `${sku}-STD`
		const variantName =
			item.treatment_sessions && item.treatment_sessions > 1
				? `Standard ${item.treatment_sessions}x`
				: 'Standard'

		const existingVariant = await prisma.product_variants.findFirst({
			where: {
				app_id: appId,
				product_id: product.id,
				sku: variantSku,
			},
			select: { id: true },
		})

		if (existingVariant) {
			await prisma.product_variants.update({
				where: { id: existingVariant.id },
				data: {
					name: variantName,
					sku: variantSku,
					image_url: item.image_url || undefined,
					price: getVariantPrice(item),
					stock_on_hand: Math.max(0, Math.floor(DEFAULT_VARIANT_STOCK)),
					stock_reserved: 0,
					is_active: true,
					attributes: {
						kind: 'treatment',
						unit: item.unit || null,
						treatment_sessions: item.treatment_sessions || 1,
					},
					updated_at: new Date(),
				},
			})
			updatedVariants += 1
		} else {
			await prisma.product_variants.create({
				data: {
					product_id: product.id,
					app_id: appId,
					organization_id: organizationId || undefined,
					name: variantName,
					sku: variantSku,
					image_url: item.image_url || undefined,
					price: getVariantPrice(item),
					stock_on_hand: Math.max(0, Math.floor(DEFAULT_VARIANT_STOCK)),
					stock_reserved: 0,
					is_active: true,
					attributes: {
						kind: 'treatment',
						unit: item.unit || null,
						treatment_sessions: item.treatment_sessions || 1,
					},
				},
			})
			createdVariants += 1
		}
	}

	return {
		createdProducts,
		updatedProducts,
		createdVariants,
		updatedVariants,
		deactivatedVariants,
	}
}

async function main() {
	console.log('🌱 Seed treatment catalog started...')
	console.log(`🎯 Target user: ${TARGET_EMAIL}`)
	console.log(`📄 Catalog file: ${CATALOG_PATH}`)
	console.log(
		`🧩 Variant mode: ${UPSERT_VARIANTS ? 'upsert variants' : 'products only (no variant upsert)'}`,
	)
	if (!UPSERT_VARIANTS) {
		console.log(
			`🧹 Disable existing variants: ${DISABLE_EXISTING_VARIANTS_WHEN_SKIPPED ? 'yes' : 'no'}`,
		)
	}

	const [context, catalog] = await Promise.all([
		resolveTargetContext(TARGET_EMAIL),
		loadCatalog(CATALOG_PATH),
	])

	console.log(
		`✅ Resolved app: ${context.app.id} (${context.app.app_name || context.app.business_name || 'N/A'})`,
	)
	console.log(`🏢 Organization: ${context.organizationId || '-'}`)
	console.log(`📦 Catalog products: ${catalog.length}`)

	const result = await upsertTreatmentCatalog(
		context.appId,
		context.organizationId,
		catalog,
		{
			upsertVariants: UPSERT_VARIANTS,
			disableExistingVariantsWhenSkipped:
				DISABLE_EXISTING_VARIANTS_WHEN_SKIPPED,
		},
	)

	const seededProductsCount = await prisma.products.count({
		where: {
			app_id: context.appId,
			metadata: {
				path: ['seed_tag'],
				equals: SEED_TAG,
			},
		},
	})

	console.log('✅ Treatment catalog seed completed')
	console.log(`   Products created : ${result.createdProducts}`)
	console.log(`   Products updated : ${result.updatedProducts}`)
	console.log(`   Variants created : ${result.createdVariants}`)
	console.log(`   Variants updated : ${result.updatedVariants}`)
	console.log(`   Variants deactivated : ${result.deactivatedVariants}`)
	console.log(`   Seed-tagged total: ${seededProductsCount}`)
}

main()
	.catch((error) => {
		console.error('❌ Seed treatment catalog failed:', error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
