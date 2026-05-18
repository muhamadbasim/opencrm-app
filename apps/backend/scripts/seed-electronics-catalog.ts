import prisma from '../src/lib/prisma'

type ElectronicsVariantSeed = {
	name: string
	sku: string
	image_url: string
	price: number
	stock_on_hand: number
	attributes?: Record<string, unknown>
}

type ElectronicsProductSeed = {
	name: string
	sku: string
	image_url: string
	description: string
	base_price: number
	metadata?: Record<string, unknown>
	variants: ElectronicsVariantSeed[]
}

const DEFAULT_TARGET_EMAIL = 'tech@alkindikids.com'
const TARGET_EMAIL = String(
	process.env.SEED_USER_EMAIL || DEFAULT_TARGET_EMAIL,
).trim()

const ELECTRONICS_CATALOG: ElectronicsProductSeed[] = [
	{
		name: 'Aster X5 Smartphone',
		sku: 'EL-PHN-ASTER-X5',
		image_url:
			'https://images.pexels.com/photos/699122/pexels-photo-699122.jpeg?auto=compress&cs=tinysrgb&w=1200',
		description:
			'Smartphone harian performa tinggi dengan kamera jernih, baterai awet, dan desain premium.',
		base_price: 3499000,
		metadata: { niche: 'electronics', brand: 'Aster', category: 'smartphone' },
		variants: [
			{
				name: '8GB / 128GB - Midnight Black',
				sku: 'EL-PHN-ASTER-X5-8128-BLK',
				image_url:
					'https://images.pexels.com/photos/1092644/pexels-photo-1092644.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 3499000,
				stock_on_hand: 16,
				attributes: {
					ram: '8GB',
					storage: '128GB',
					color: 'Midnight Black',
					warranty: '12 bulan',
				},
			},
			{
				name: '8GB / 256GB - Ocean Blue',
				sku: 'EL-PHN-ASTER-X5-8256-BLU',
				image_url:
					'https://images.pexels.com/photos/1275229/pexels-photo-1275229.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 3999000,
				stock_on_hand: 12,
				attributes: {
					ram: '8GB',
					storage: '256GB',
					color: 'Ocean Blue',
					warranty: '12 bulan',
				},
			},
			{
				name: '12GB / 512GB - Titanium Gray',
				sku: 'EL-PHN-ASTER-X5-12512-GRY',
				image_url:
					'https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 4899000,
				stock_on_hand: 8,
				attributes: {
					ram: '12GB',
					storage: '512GB',
					color: 'Titanium Gray',
					warranty: '12 bulan',
				},
			},
		],
	},
	{
		name: 'OrionBook Pro 14',
		sku: 'EL-LTP-ORION-14',
		image_url:
			'https://images.pexels.com/photos/18105/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=1200',
		description:
			'Laptop tipis untuk kerja kreatif dengan layar tajam, performa stabil, dan baterai panjang.',
		base_price: 10999000,
		metadata: { niche: 'electronics', brand: 'Orion', category: 'laptop' },
		variants: [
			{
				name: 'Intel i5 / 16GB / 512GB',
				sku: 'EL-LTP-ORION-14-I5-16-512',
				image_url:
					'https://images.pexels.com/photos/205421/pexels-photo-205421.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 10999000,
				stock_on_hand: 10,
				attributes: {
					cpu: 'Intel Core i5',
					ram: '16GB',
					storage: '512GB SSD',
					screen: '14 inch FHD',
				},
			},
			{
				name: 'Intel i7 / 16GB / 1TB',
				sku: 'EL-LTP-ORION-14-I7-16-1TB',
				image_url:
					'https://images.pexels.com/photos/374074/pexels-photo-374074.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 13999000,
				stock_on_hand: 7,
				attributes: {
					cpu: 'Intel Core i7',
					ram: '16GB',
					storage: '1TB SSD',
					screen: '14 inch FHD',
				},
			},
			{
				name: 'Ryzen 7 / 32GB / 1TB',
				sku: 'EL-LTP-ORION-14-R7-32-1TB',
				image_url:
					'https://images.pexels.com/photos/7974/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=1200',
				price: 15999000,
				stock_on_hand: 5,
				attributes: {
					cpu: 'AMD Ryzen 7',
					ram: '32GB',
					storage: '1TB SSD',
					screen: '14 inch QHD',
				},
			},
		],
	},
	{
		name: 'SonicBuds Air TWS',
		sku: 'EL-AUD-SONICBUDS-AIR',
		image_url:
			'https://images.pexels.com/photos/3780681/pexels-photo-3780681.jpeg?auto=compress&cs=tinysrgb&w=1200',
		description:
			'TWS ringan dengan ANC, latency rendah, dan kualitas mikrofon jernih untuk meeting.',
		base_price: 899000,
		metadata: { niche: 'electronics', brand: 'Sonic', category: 'audio' },
		variants: [
			{
				name: 'Classic White',
				sku: 'EL-AUD-SONICBUDS-AIR-WHT',
				image_url:
					'https://images.pexels.com/photos/577769/pexels-photo-577769.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 899000,
				stock_on_hand: 22,
				attributes: { color: 'White', anc: 'Yes', battery: '28 jam total' },
			},
			{
				name: 'Matte Black',
				sku: 'EL-AUD-SONICBUDS-AIR-BLK',
				image_url:
					'https://images.pexels.com/photos/8534088/pexels-photo-8534088.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 929000,
				stock_on_hand: 20,
				attributes: { color: 'Black', anc: 'Yes', battery: '28 jam total' },
			},
			{
				name: 'Navy Blue',
				sku: 'EL-AUD-SONICBUDS-AIR-NVY',
				image_url:
					'https://images.pexels.com/photos/5899458/pexels-photo-5899458.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 949000,
				stock_on_hand: 14,
				attributes: { color: 'Navy', anc: 'Yes', battery: '28 jam total' },
			},
		],
	},
	{
		name: 'NovaVision 43" Smart TV',
		sku: 'EL-TV-NOVAVISION-43',
		image_url:
			'https://images.pexels.com/photos/6782368/pexels-photo-6782368.jpeg?auto=compress&cs=tinysrgb&w=1200',
		description:
			'Smart TV 4K untuk hiburan keluarga dengan dukungan streaming apps populer.',
		base_price: 4799000,
		metadata: { niche: 'electronics', brand: 'NovaVision', category: 'tv' },
		variants: [
			{
				name: '43" 4K UHD',
				sku: 'EL-TV-NOVAVISION-43-UHD',
				image_url:
					'https://images.pexels.com/photos/1201996/pexels-photo-1201996.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 4799000,
				stock_on_hand: 9,
				attributes: { size: '43 inch', panel: 'UHD', smart_os: 'Android TV' },
			},
			{
				name: '50" 4K UHD',
				sku: 'EL-TV-NOVAVISION-50-UHD',
				image_url:
					'https://images.pexels.com/photos/6782423/pexels-photo-6782423.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 5999000,
				stock_on_hand: 7,
				attributes: { size: '50 inch', panel: 'UHD', smart_os: 'Android TV' },
			},
			{
				name: '55" 4K QLED',
				sku: 'EL-TV-NOVAVISION-55-QLED',
				image_url:
					'https://images.pexels.com/photos/333984/pexels-photo-333984.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 7599000,
				stock_on_hand: 5,
				attributes: { size: '55 inch', panel: 'QLED', smart_os: 'Android TV' },
			},
		],
	},
	{
		name: 'VoltKeys K87 Mechanical Keyboard',
		sku: 'EL-ACC-VOLTKEYS-K87',
		image_url:
			'https://images.pexels.com/photos/2115257/pexels-photo-2115257.jpeg?auto=compress&cs=tinysrgb&w=1200',
		description:
			'Keyboard mekanikal compact untuk gaming dan produktivitas dengan hot-swap switch.',
		base_price: 699000,
		metadata: { niche: 'electronics', brand: 'VoltKeys', category: 'keyboard' },
		variants: [
			{
				name: 'Red Switch - Black Frame',
				sku: 'EL-ACC-VOLTKEYS-K87-RED-BLK',
				image_url:
					'https://images.pexels.com/photos/841228/pexels-photo-841228.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 699000,
				stock_on_hand: 18,
				attributes: { switch: 'Red', layout: 'TKL 87', color: 'Black' },
			},
			{
				name: 'Brown Switch - White Frame',
				sku: 'EL-ACC-VOLTKEYS-K87-BRN-WHT',
				image_url:
					'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 729000,
				stock_on_hand: 13,
				attributes: { switch: 'Brown', layout: 'TKL 87', color: 'White' },
			},
			{
				name: 'Blue Switch - Navy Frame',
				sku: 'EL-ACC-VOLTKEYS-K87-BLU-NVY',
				image_url:
					'https://images.pexels.com/photos/1772123/pexels-photo-1772123.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 719000,
				stock_on_hand: 11,
				attributes: { switch: 'Blue', layout: 'TKL 87', color: 'Navy' },
			},
		],
	},
	{
		name: 'PulseCharge Power Bank 20.000mAh',
		sku: 'EL-PWR-PULSE-20K',
		image_url:
			'https://images.pexels.com/photos/4526407/pexels-photo-4526407.jpeg?auto=compress&cs=tinysrgb&w=1200',
		description:
			'Power bank fast charging untuk smartphone dan tablet, cocok untuk travel harian.',
		base_price: 429000,
		metadata: { niche: 'electronics', brand: 'PulseCharge', category: 'power' },
		variants: [
			{
				name: '20W Fast Charge - Black',
				sku: 'EL-PWR-PULSE-20K-20W-BLK',
				image_url:
					'https://images.pexels.com/photos/4526410/pexels-photo-4526410.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 429000,
				stock_on_hand: 25,
				attributes: {
					capacity: '20.000mAh',
					output: '20W',
					color: 'Black',
				},
			},
			{
				name: '22.5W Fast Charge - White',
				sku: 'EL-PWR-PULSE-20K-225W-WHT',
				image_url:
					'https://images.pexels.com/photos/404280/pexels-photo-404280.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 459000,
				stock_on_hand: 19,
				attributes: {
					capacity: '20.000mAh',
					output: '22.5W',
					color: 'White',
				},
			},
			{
				name: '30W PD - Titanium Gray',
				sku: 'EL-PWR-PULSE-20K-30W-GRY',
				image_url:
					'https://images.pexels.com/photos/5208820/pexels-photo-5208820.jpeg?auto=compress&cs=tinysrgb&w=1200',
				price: 519000,
				stock_on_hand: 14,
				attributes: {
					capacity: '20.000mAh',
					output: '30W PD',
					color: 'Titanium Gray',
				},
			},
		],
	},
]

async function resolveTargetContext(email: string) {
	const user = await prisma.users.findUnique({
		where: { email },
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

async function upsertCatalogForApp(
	appId: string,
	organizationId: string | null,
	catalog: ElectronicsProductSeed[],
) {
	let createdProducts = 0
	let updatedProducts = 0
	let createdVariants = 0
	let updatedVariants = 0
	let movementRows = 0

	for (const productSeed of catalog) {
		const existingProduct = await prisma.products.findFirst({
			where: {
				app_id: appId,
				sku: productSeed.sku,
			},
			select: {
				id: true,
			},
		})

		const product = existingProduct
			? await prisma.products.update({
					where: { id: existingProduct.id },
					data: {
						name: productSeed.name,
						sku: productSeed.sku,
						image_url: productSeed.image_url,
						description: productSeed.description,
						base_price: productSeed.base_price,
						is_active: true,
						organization_id: organizationId || undefined,
						metadata: {
							...(productSeed.metadata || {}),
							seed_tag: 'electronics_catalog_v1',
						},
						updated_at: new Date(),
					},
				})
			: await prisma.products.create({
					data: {
						app_id: appId,
						organization_id: organizationId || undefined,
						name: productSeed.name,
						sku: productSeed.sku,
						image_url: productSeed.image_url,
						description: productSeed.description,
						base_price: productSeed.base_price,
						is_active: true,
						metadata: {
							...(productSeed.metadata || {}),
							seed_tag: 'electronics_catalog_v1',
						},
					},
				})

		if (existingProduct) {
			updatedProducts += 1
		} else {
			createdProducts += 1
		}

		const existingVariants = await prisma.product_variants.findMany({
			where: {
				app_id: appId,
				product_id: product.id,
			},
		})
		const existingVariantBySku = new Map(
			existingVariants.map((variant) => [
				String(variant.sku || '').toLowerCase(),
				variant,
			]),
		)

		for (const variantSeed of productSeed.variants) {
			const existingVariant = existingVariantBySku.get(
				variantSeed.sku.toLowerCase(),
			)

			if (!existingVariant) {
				const createdVariant = await prisma.product_variants.create({
					data: {
						product_id: product.id,
						app_id: appId,
						organization_id: organizationId || undefined,
						name: variantSeed.name,
						sku: variantSeed.sku,
						image_url: variantSeed.image_url,
						price: variantSeed.price,
						stock_on_hand: Math.max(0, Math.floor(variantSeed.stock_on_hand)),
						stock_reserved: 0,
						is_active: true,
						attributes: variantSeed.attributes || {},
					},
				})

				createdVariants += 1

				if (variantSeed.stock_on_hand > 0) {
					await prisma.stock_movements.create({
						data: {
							app_id: appId,
							organization_id: organizationId || null,
							variant_id: createdVariant.id,
							movement_type: 'initial',
							quantity: Math.max(0, Math.floor(variantSeed.stock_on_hand)),
							stock_before: 0,
							stock_after: Math.max(0, Math.floor(variantSeed.stock_on_hand)),
							note: 'Electronics catalog seed initial stock',
							metadata: {
								source: 'seed-electronics-catalog',
								seed_tag: 'electronics_catalog_v1',
							},
						},
					})
					movementRows += 1
				}

				continue
			}

			const stockBefore = Math.max(
				0,
				Number(existingVariant.stock_on_hand || 0),
			)
			const reserved = Math.max(0, Number(existingVariant.stock_reserved || 0))
			const requestedStock = Math.max(
				0,
				Math.floor(Number(variantSeed.stock_on_hand || 0)),
			)
			const targetStock = Math.max(requestedStock, reserved)
			const delta = targetStock - stockBefore

			await prisma.product_variants.update({
				where: { id: existingVariant.id },
				data: {
					name: variantSeed.name,
					sku: variantSeed.sku,
					image_url: variantSeed.image_url,
					price: variantSeed.price,
					is_active: true,
					attributes: variantSeed.attributes || {},
					stock_on_hand: targetStock,
					updated_at: new Date(),
				},
			})
			updatedVariants += 1

			if (delta !== 0) {
				await prisma.stock_movements.create({
					data: {
						app_id: appId,
						organization_id: organizationId || null,
						variant_id: existingVariant.id,
						movement_type: delta > 0 ? 'adjust_in' : 'adjust_out',
						quantity: Math.abs(delta),
						stock_before: stockBefore,
						stock_after: targetStock,
						note: 'Electronics catalog seed stock sync',
						metadata: {
							source: 'seed-electronics-catalog',
							seed_tag: 'electronics_catalog_v1',
							requested_stock: requestedStock,
							reserved_stock: reserved,
						},
					},
				})
				movementRows += 1
			}
		}
	}

	return {
		createdProducts,
		updatedProducts,
		createdVariants,
		updatedVariants,
		movementRows,
	}
}

async function main() {
	console.log('🌱 Seed electronics catalog started...')
	console.log(`🎯 Target user: ${TARGET_EMAIL}`)

	const context = await resolveTargetContext(TARGET_EMAIL)
	console.log(
		`✅ Resolved app: ${context.app.id} (${context.app.app_name || context.app.business_name || 'N/A'})`,
	)
	console.log(`🏢 Organization: ${context.organizationId || '-'}`)

	const result = await upsertCatalogForApp(
		context.appId,
		context.organizationId,
		ELECTRONICS_CATALOG,
	)

	console.log('✅ Electronics catalog seed completed')
	console.log(`   Products created : ${result.createdProducts}`)
	console.log(`   Products updated : ${result.updatedProducts}`)
	console.log(`   Variants created : ${result.createdVariants}`)
	console.log(`   Variants updated : ${result.updatedVariants}`)
	console.log(`   Stock movements  : ${result.movementRows}`)
}

main()
	.catch((error) => {
		console.error('❌ Seed electronics catalog failed:', error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
