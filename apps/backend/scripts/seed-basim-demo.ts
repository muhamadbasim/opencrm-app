import prisma from '../src/lib/prisma'

const APP_ID = '136e246b-ea2a-4023-8769-01593589f7ea'
const ORG_ID = 'c6635f91-a7b5-4f30-af8d-8223a89f56af'
const ACCOUNT_ID = 'bf5fa9aa-b7c9-4271-bb0d-a36beedcf4c7'
const USER_ID = '34b1cf81-27b8-4ca8-abed-a89104e9ac63'
const SEED_TAG = 'basim_demo_v1'

const PRODUCT_SEED = [
	{
		sku: 'BK-KOPI-001',
		name: 'BumiKopi Signature Beans 250g',
		description:
			'Kopi arabika medium roast dengan rasa cokelat, karamel, dan aftertaste bersih. Cocok untuk espresso, pour over, atau V60.',
		image_url:
			'https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=1200',
		base_price: 89000,
		variants: [
			{
				sku: 'BK-KOPI-001-250G',
				name: '250g - Fresh Roast',
				price: 89000,
				stock_on_hand: 120,
				attributes: { size: '250g', grind: 'beans', roast: 'medium' },
			},
			{
				sku: 'BK-KOPI-001-1KG',
				name: '1kg - Bulk Pack',
				price: 315000,
				stock_on_hand: 42,
				attributes: { size: '1kg', grind: 'beans', roast: 'medium' },
			},
		],
	},
	{
		sku: 'BK-KOPI-002',
		name: 'BumiKopi Drip Bag Variety Pack',
		description:
			'Paket drip bag 10 pcs berisi campuran signature & seasonal blend. Praktis untuk kantor, hadiah, dan perjalanan.',
		image_url:
			'https://images.pexels.com/photos/129207/pexels-photo-129207.jpeg?auto=compress&cs=tinysrgb&w=1200',
		base_price: 65000,
		variants: [
			{
				sku: 'BK-KOPI-002-10',
				name: 'Pack 10 Sachet',
				price: 65000,
				stock_on_hand: 84,
				attributes: { pieces: 10, grind: 'drip', gift_ready: true },
			},
			{
				sku: 'BK-KOPI-002-20',
				name: 'Pack 20 Sachet',
				price: 118000,
				stock_on_hand: 58,
				attributes: { pieces: 20, grind: 'drip', gift_ready: true },
			},
		],
	},
	{
		sku: 'BK-KOPI-003',
		name: 'BumiKopi Cold Brew 1L',
		description:
			'Cold brew premium siap minum dengan profil rasa halus, low acidity, dan manis natural. Cocok untuk pelanggan kantor dan reseller.',
		image_url:
			'https://images.pexels.com/photos/302901/pexels-photo-302901.jpeg?auto=compress&cs=tinysrgb&w=1200',
		base_price: 45000,
		variants: [
			{
				sku: 'BK-KOPI-003-1L',
				name: '1 Liter Bottle',
				price: 45000,
				stock_on_hand: 66,
				attributes: { volume: '1L', serve: 'cold', sugar: 'no sugar' },
			},
			{
				sku: 'BK-KOPI-003-2L',
				name: '2 Liter Jug',
				price: 82000,
				stock_on_hand: 28,
				attributes: { volume: '2L', serve: 'cold', sugar: 'no sugar' },
			},
		],
	},
	{
		sku: 'BK-KOPI-004',
		name: 'BumiKopi Gift Box',
		description:
			'Paket hampers premium dengan beans, drip bag, dan kartu ucapan. Cocok untuk corporate gift, lebaran, dan hampers event.',
		image_url:
			'https://images.pexels.com/photos/230477/pexels-photo-230477.jpeg?auto=compress&cs=tinysrgb&w=1200',
		base_price: 149000,
		variants: [
			{
				sku: 'BK-KOPI-004-STD',
				name: 'Standard Gift Box',
				price: 149000,
				stock_on_hand: 36,
				attributes: { card: 'included', ribbon: 'yes', gift: true },
			},
			{
				sku: 'BK-KOPI-004-PREM',
				name: 'Premium Gift Box',
				price: 229000,
				stock_on_hand: 18,
				attributes: { card: 'premium', ribbon: 'yes', gift: true },
			},
		],
	},
]

const CONTACTS = [
	{
		identifier: 'seed-bumikopi-andi',
		name: 'Andi Pratama',
		phone_number: '628111000001',
		email: 'andi@bumikopi.id',
		city: 'Jakarta',
		company: 'PT Sinar Karya',
		source: 'whatsapp',
		custom_attributes: {
			budget_range: '100000-500000',
			preferred_product: 'BumiKopi Gift Box',
			purchase_timing: 'This week',
			lead_status: 'Hot',
		},
	},
	{
		identifier: 'seed-bumikopi-siti',
		name: 'Siti Rahma',
		phone_number: '628111000002',
		email: 'siti@startup.co.id',
		city: 'Bandung',
		company: 'Startup Maju',
		source: 'instagram',
		custom_attributes: {
			budget_range: '50000-200000',
			preferred_product: 'BumiKopi Signature Beans 250g',
			purchase_timing: 'This month',
			lead_status: 'Warm',
		},
	},
	{
		identifier: 'seed-bumikopi-budi',
		name: 'Budi Santoso',
		phone_number: '628111000003',
		email: 'budi@warung.id',
		city: 'Surabaya',
		company: 'Warung Kopi Budi',
		source: 'whatsapp',
		custom_attributes: {
			budget_range: '250000-1000000',
			preferred_product: 'BumiKopi Cold Brew 1L',
			purchase_timing: 'This week',
			lead_status: 'Hot',
		},
	},
	{
		identifier: 'seed-bumikopi-nia',
		name: 'Nia Lestari',
		phone_number: '628111000004',
		email: 'nia@corp.id',
		city: 'Tangerang',
		company: 'Nusantara Corp',
		source: 'whatsapp',
		custom_attributes: {
			budget_range: '1000000+',
			preferred_product: 'BumiKopi Corporate Gift Box',
			purchase_timing: 'Next week',
			lead_status: 'Hot',
		},
	},
	{
		identifier: 'seed-bumikopi-dewi',
		name: 'Dewi Anggraeni',
		phone_number: '628111000005',
		email: 'dewi@gmail.com',
		city: 'Yogyakarta',
		company: 'Rumah Kreatif',
		source: 'instagram',
		custom_attributes: {
			budget_range: '50000-100000',
			preferred_product: 'BumiKopi Drip Bag Variety Pack',
			purchase_timing: 'This month',
			lead_status: 'New',
		},
	},
	{
		identifier: 'seed-bumikopi-farhan',
		name: 'Farhan Maulana',
		phone_number: '628111000006',
		email: 'farhan@agency.id',
		city: 'Bekasi',
		company: 'Agency One',
		source: 'whatsapp',
		custom_attributes: {
			budget_range: '200000-500000',
			preferred_product: 'BumiKopi Signature Beans 1kg',
			purchase_timing: 'This week',
			lead_status: 'Warm',
		},
	},
	{
		identifier: 'seed-bumikopi-rika',
		name: 'Rika Putri',
		phone_number: '628111000007',
		email: 'rika@hotel.id',
		city: 'Bali',
		company: 'Hotel Santika',
		source: 'whatsapp',
		custom_attributes: {
			budget_range: '1000000+',
			preferred_product: 'BumiKopi Corporate Gift Box',
			purchase_timing: 'This month',
			lead_status: 'Hot',
		},
	},
	{
		identifier: 'seed-bumikopi-yudi',
		name: 'Yudi Hartono',
		phone_number: '628111000008',
		email: 'yudi@retail.id',
		city: 'Semarang',
		company: 'Retail Nusantara',
		source: 'whatsapp',
		custom_attributes: {
			budget_range: '250000-1000000',
			preferred_product: 'BumiKopi Drip Bag Variety Pack',
			purchase_timing: 'Next month',
			lead_status: 'Warm',
		},
	},
]

const QUICK_REPLIES = [
	{
		short_code: 'greet',
		content:
			'Halo kak, terima kasih sudah menghubungi BumiKopi ☕ Saya bantu pilihkan produk yang paling cocok, ya.',
	},
	{
		short_code: 'catalog',
		content:
			'Untuk katalog hari ini: Signature Beans 250g Rp89.000, Drip Bag 10 pcs Rp65.000, Cold Brew 1L Rp45.000, Gift Box Rp149.000.',
	},
	{
		short_code: 'payment',
		content:
			'Pembayaran bisa via Doku / transfer. Setelah checkout, kami kirim link pembayaran dan bukti pesanan otomatis.',
	},
	{
		short_code: 'followup',
		content:
			'Boleh saya bantu rekomendasikan produk sesuai kebutuhan kantor, reseller, atau hampers?',
	},
	{
		short_code: 'closing',
		content:
			'Terima kasih kak, pesanan sudah kami catat. Kalau ada pertanyaan lagi, langsung chat saja ya.',
	},
]

const LABELS = [
	{ title: 'New Lead', color: '#3B82F6' },
	{ title: 'Hot Lead', color: '#EF4444' },
	{ title: 'Warm Lead', color: '#F59E0B' },
	{ title: 'Paid', color: '#10B981' },
	{ title: 'Follow Up', color: '#8B5CF6' },
	{ title: 'VIP', color: '#EC4899' },
]

const CONTACT_TAGS = [
	{ name: 'whatsapp-leads', color: '#22C55E' },
	{ name: 'instagram-leads', color: '#8B5CF6' },
	{ name: 'corporate', color: '#F59E0B' },
	{ name: 'reseller', color: '#3B82F6' },
	{ name: 'hampers', color: '#EC4899' },
]

const CONTACT_FIELDS = [
	{
		field_key: 'budget_range',
		field_label: 'Budget Range',
		field_type: 'dropdown',
		options: ['< 50k', '50k-100k', '100k-500k', '500k-1jt', '1jt+'],
		is_required: false,
	},
	{
		field_key: 'preferred_product',
		field_label: 'Preferred Product',
		field_type: 'text',
		options: [],
		is_required: false,
	},
	{
		field_key: 'purchase_timing',
		field_label: 'Purchase Timing',
		field_type: 'dropdown',
		options: ['Today', 'This week', 'This month', 'Next month'],
		is_required: false,
	},
	{
		field_key: 'lead_status',
		field_label: 'Lead Status',
		field_type: 'dropdown',
		options: ['New', 'Warm', 'Hot', 'Won', 'Lost'],
		is_required: false,
	},
]

const FAQS = [
	{
		question: 'Berapa lama pengiriman BumiKopi?',
		answer:
			'Area Jabodetabek 1-2 hari kerja. Luar kota biasanya 2-4 hari kerja tergantung ekspedisi.',
		keywords: ['pengiriman', 'resi', 'ekspedisi'],
	},
	{
		question: 'Apakah bisa order reseller atau corporate?',
		answer:
			'Bisa. Kami punya harga khusus untuk reseller, corporate gift, dan repeat order bulanan.',
		keywords: ['reseller', 'corporate', 'bulk'],
	},
	{
		question: 'Metode pembayaran apa saja yang tersedia?',
		answer:
			'Pembayaran tersedia via link payment Doku, transfer bank, dan metode digital lain yang aktif di akun demo.',
		keywords: ['payment', 'doku', 'transfer'],
	},
	{
		question: 'Apakah ada sampel rasa?',
		answer:
			'Ada. Untuk order pertama, tim kami bisa bantu rekomendasi sample pack sesuai preferensi rasa.',
		keywords: ['sample', 'rasa', 'test'],
	},
	{
		question: 'Kapan jam operasional admin?',
		answer:
			'Admin aktif Senin-Sabtu pukul 09.00-18.00 WIB. Di luar jam itu, chatbot tetap membalas pertanyaan umum.',
		keywords: ['jam operasional', 'cs', 'admin'],
	},
]

function makeDate(hoursOffset: number) {
	return new Date(Date.now() + hoursOffset * 60 * 60 * 1000)
}

function hasArrayValue(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0
}

async function upsertAccountScopedRow<T extends { id: string }>(
	model: {
		findFirst: Function
		create: Function
		update: Function
	},
	findWhere: any,
	createData: any,
	updateData: any,
) {
	const existing = await model.findFirst({ where: findWhere, select: { id: true } })
	if (existing?.id) {
		return model.update({ where: { id: existing.id }, data: updateData })
	}
	return model.create({ data: createData })
}

async function ensureProducts() {
	const createdProducts: Array<{ id: string; sku: string; name: string }> = []

	for (const item of PRODUCT_SEED) {
		const existing = await prisma.products.findFirst({
			where: { app_id: APP_ID, sku: item.sku },
			select: { id: true },
		})

		const product = existing
			? await prisma.products.update({
					where: { id: existing.id },
					data: {
						name: item.name,
						description: item.description,
						image_url: item.image_url,
						base_price: item.base_price,
						is_active: true,
						organization_id: ORG_ID,
						metadata: { seed_tag: SEED_TAG, category: 'coffee' },
					},
				})
			: await prisma.products.create({
					data: {
						app_id: APP_ID,
						organization_id: ORG_ID,
						name: item.name,
						sku: item.sku,
						description: item.description,
						image_url: item.image_url,
						base_price: item.base_price,
						is_active: true,
						metadata: { seed_tag: SEED_TAG, category: 'coffee' },
					},
				})

		createdProducts.push({ id: product.id, sku: item.sku, name: item.name })

		for (const variant of item.variants) {
			const existingVariant = await prisma.product_variants.findFirst({
				where: { app_id: APP_ID, sku: variant.sku },
				select: { id: true },
			})

			if (existingVariant?.id) {
				await prisma.product_variants.update({
					where: { id: existingVariant.id },
					data: {
						product_id: product.id,
						organization_id: ORG_ID,
						name: variant.name,
						image_url: item.image_url,
						attributes: variant.attributes,
						price: variant.price,
						stock_on_hand: variant.stock_on_hand,
						is_active: true,
					},
				})
			} else {
				await prisma.product_variants.create({
					data: {
						product_id: product.id,
						app_id: APP_ID,
						organization_id: ORG_ID,
						name: variant.name,
						sku: variant.sku,
						image_url: item.image_url,
						attributes: variant.attributes,
						price: variant.price,
						stock_on_hand: variant.stock_on_hand,
						is_active: true,
					},
				})
			}
		}
	}

	return createdProducts
}

async function ensureContacts() {
	const result: Record<string, any> = {}
	for (const contact of CONTACTS) {
		const existing = await prisma.contacts.findUnique({
			where: { identifier: contact.identifier },
		})

		const payload = {
			account_id: ACCOUNT_ID,
			app_id: APP_ID,
			name: contact.name,
			email: contact.email,
			phone_number: contact.phone_number,
			identifier: contact.identifier,
			channel_type: contact.source,
			company: contact.company,
			city: contact.city,
			consent_status: 'CONSENTED',
			custom_attributes: contact.custom_attributes,
			metadata: { seed_tag: SEED_TAG, source: contact.source },
			additional_attributes: { seed_tag: SEED_TAG },
			first_contact_at: makeDate(-120),
			last_message_at: makeDate(-24),
			last_activity_at: makeDate(-12),
			last_inbound_message_at: makeDate(-24),
		}

		const row = existing
			? await prisma.contacts.update({
					where: { id: existing.id },
					data: payload,
				})
			: await prisma.contacts.create({ data: payload })

		result[contact.identifier] = row
	}
	return result
}

async function ensureConversation(
	params: {
		identifier: string
		contactId: string
		inboxId: string
		status: 'open' | 'resolved'
		priority: 'low' | 'normal' | 'high'
		teamId: string
		assigneeId: string
		labelTitles: string[]
		messages: Array<{
			external_id: string
			content: string
			sender_type: 'contact' | 'agent'
			created_at: Date
			private?: boolean
		}>
		dealValue: number
		pipelineStageName: string
		journeyPhase: string
	},
	labelMap: Map<string, string>,
	pipelineMap: Map<string, string>,
	stageMap: Map<string, string>,
) {
	const existing = await prisma.conversations.findFirst({
		where: { identifier: params.identifier, app_id: APP_ID },
		select: { id: true },
	})

	const conversation = existing
		? await prisma.conversations.update({
				where: { id: existing.id },
				data: {
					account_id: ACCOUNT_ID,
					app_id: APP_ID,
					contact_id: params.contactId,
					inbox_id: params.inboxId,
					channel_type: 'whatsapp',
					assignee_id: params.assigneeId,
					team_id: params.teamId,
					status: params.status,
					priority: params.priority,
					identifier: params.identifier,
					unread_count: params.status === 'open' ? 1 : 0,
					last_message_at: params.messages[params.messages.length - 1]?.created_at,
					total_messages: params.messages.length,
					last_activity_at: params.messages[params.messages.length - 1]?.created_at,
					updated_at: new Date(),
				},
			})
		: await prisma.conversations.create({
				data: {
					account_id: ACCOUNT_ID,
					app_id: APP_ID,
					contact_id: params.contactId,
					inbox_id: params.inboxId,
					channel_type: 'whatsapp',
					assignee_id: params.assigneeId,
					team_id: params.teamId,
					status: params.status,
					priority: params.priority,
					identifier: params.identifier,
					unread_count: params.status === 'open' ? 1 : 0,
					last_message_at: params.messages[params.messages.length - 1]?.created_at,
					total_messages: params.messages.length,
					last_activity_at: params.messages[params.messages.length - 1]?.created_at,
					custom_attributes: { seed_tag: SEED_TAG, journey_phase: params.journeyPhase },
				},
			})

	for (const labelTitle of params.labelTitles) {
		const labelId = labelMap.get(labelTitle)
		if (!labelId) continue
		const existingLabel = await prisma.conversation_labels.findFirst({
			where: { conversation_id: conversation.id, label_id: labelId },
			select: { conversation_id: true },
		})
		if (!existingLabel) {
			await prisma.conversation_labels.create({
				data: { conversation_id: conversation.id, label_id: labelId },
			})
		}
	}

	const pipelineId = pipelineMap.get('Contact Stages')
	const stageId = stageMap.get(params.pipelineStageName)
	if (pipelineId && stageId) {
		const existingDeal = await prisma.conversation_sales.findUnique({
			where: { conversation_id: conversation.id },
			select: { conversation_id: true },
		})
		if (existingDeal) {
			await prisma.conversation_sales.update({
				where: { conversation_id: conversation.id },
				data: {
					pipeline_id: pipelineId,
					stage_id: stageId,
					deal_value: params.dealValue,
					expected_revenue: params.dealValue,
					probability_snapshot: params.pipelineStageName === 'Payment' ? 80 : params.pipelineStageName === 'Hot Leads' ? 60 : 25,
					metadata: { seed_tag: SEED_TAG },
				},
			})
		} else {
			await prisma.conversation_sales.create({
				data: {
					conversation_id: conversation.id,
					pipeline_id: pipelineId,
					stage_id: stageId,
					deal_value: params.dealValue,
					expected_revenue: params.dealValue,
					probability_snapshot: params.pipelineStageName === 'Payment' ? 80 : params.pipelineStageName === 'Hot Leads' ? 60 : 25,
					metadata: { seed_tag: SEED_TAG },
				},
			})
		}
	}

	const existingMessages = await prisma.messages.findMany({
		where: {
			conversation_id: conversation.id,
			external_id: { in: params.messages.map((m) => m.external_id) },
		},
		select: { external_id: true },
	})
	const existingSet = new Set(existingMessages.map((msg) => msg.external_id).filter(Boolean) as string[])

	for (const message of params.messages) {
		if (existingSet.has(message.external_id)) continue
		await prisma.messages.create({
			data: {
				conversation_id: conversation.id,
				app_id: APP_ID,
				inbox_id: params.inboxId,
				message_type: 'text',
				content: message.content,
				content_type: 'text',
				sender_type: message.sender_type,
				status: 'sent',
				external_id: message.external_id,
				metadata: { seed_tag: SEED_TAG },
				raw_payload: { seed_tag: SEED_TAG, external_id: message.external_id },
				created_at: message.created_at,
				updated_at: message.created_at,
				private: message.private || false,
			},
		})
	}

	return conversation
}

async function ensureOrders(
	contacts: Record<string, any>,
	conversations: Record<string, any>,
	productsBySku: Map<string, any>,
) {
	const orders = [
		{
			key: 'andi-box',
			contact: contacts['seed-bumikopi-andi'],
			conversation: conversations['seed-bumikopi-andi'],
			status: 'paid',
			paymentProvider: 'doku',
			journeyPhase: 'paid',
			items: [
				{ sku: 'BK-KOPI-004', variantSku: 'BK-KOPI-004-PREM', qty: 2 },
				{ sku: 'BK-KOPI-002', variantSku: 'BK-KOPI-002-20', qty: 1 },
			],
		},
		{
			key: 'budi-drip',
			contact: contacts['seed-bumikopi-budi'],
			conversation: conversations['seed-bumikopi-budi'],
			status: 'paid',
			paymentProvider: 'doku',
			journeyPhase: 'paid',
			items: [
				{ sku: 'BK-KOPI-003', variantSku: 'BK-KOPI-003-1L', qty: 10 },
			],
		},
		{
			key: 'rika-bulk',
			contact: contacts['seed-bumikopi-rika'],
			conversation: conversations['seed-bumikopi-rika'],
			status: 'pending',
			paymentProvider: 'doku',
			journeyPhase: 'checkout',
			items: [
				{ sku: 'BK-KOPI-001', variantSku: 'BK-KOPI-001-1KG', qty: 12 },
			],
		},
	]

	for (const order of orders) {
		const existing = await prisma.orders.findFirst({
			where: {
				app_id: APP_ID,
				organization_id: ORG_ID,
				metadata: {
					path: ['seed_tag'],
					equals: SEED_TAG,
				},
				notes: { contains: order.key },
			},
			select: { id: true },
		})

		let subtotal = 0
		const orderItems = order.items.map((item) => {
			const variant = productsBySku.get(item.variantSku)
			const price = Number(variant?.price || 0)
			subtotal += price * item.qty
			return {
				productId: productsBySku.get(item.sku)?.productId,
				variantId: variant?.id,
				productName: productsBySku.get(item.sku)?.name,
				variantName: variant?.name,
				quantity: item.qty,
				unitPrice: price,
				lineTotal: price * item.qty,
			}
		})

		const orderRecord = existing
			? await prisma.orders.update({
					where: { id: existing.id },
					data: {
						contact_id: order.contact.id,
						conversation_id: order.conversation.id,
						order_status: order.status,
						payment_provider: order.paymentProvider,
						journey_phase: order.journeyPhase,
						subtotal,
						grand_total: subtotal,
						metadata: { seed_tag: SEED_TAG, key: order.key },
						notes: `Demo order ${order.key}`,
					},
				})
			: await prisma.orders.create({
					data: {
						organization_id: ORG_ID,
						app_id: APP_ID,
						contact_id: order.contact.id,
						conversation_id: order.conversation.id,
						order_status: order.status,
						payment_type: 'one_time_payment',
						payment_method: 'doku',
						payment_provider: order.paymentProvider,
						journey_phase: order.journeyPhase,
						currency: 'IDR',
						subtotal,
						grand_total: subtotal,
						checkout_at: makeDate(-8),
						paid_at: order.status === 'paid' ? makeDate(-6) : null,
						metadata: { seed_tag: SEED_TAG, key: order.key },
						notes: `Demo order ${order.key}`,
					},
				})

		const invoiceExists = await prisma.order_invoices.findFirst({
			where: { order_id: orderRecord.id, provider_invoice_id: `${order.key}-invoice` },
			select: { id: true },
		})
		if (invoiceExists?.id) {
			await prisma.order_invoices.update({
				where: { id: invoiceExists.id },
				data: {
					amount: subtotal,
					status: order.status === 'paid' ? 'PAID' : 'NOT_PAID',
					provider: 'doku',
					payment_method: 'doku',
					payment_link: `https://pay.basim.id/${order.key}`,
					provider_payload: { seed_tag: SEED_TAG },
				},
			})
		} else {
			await prisma.order_invoices.create({
				data: {
					order_id: orderRecord.id,
					amount: subtotal,
					status: order.status === 'paid' ? 'PAID' : 'NOT_PAID',
					provider: 'doku',
					provider_invoice_id: `${order.key}-invoice`,
					payment_method: 'doku',
					payment_link: `https://pay.basim.id/${order.key}`,
					public_token: `${order.key}-public-token`,
					expiry_date: makeDate(48),
					provider_payload: { seed_tag: SEED_TAG },
				},
			})
		}

		for (const item of orderItems) {
			const existingItem = await prisma.order_items.findFirst({
				where: { order_id: orderRecord.id, variant_id: item.variantId },
				select: { id: true },
			})
			if (existingItem?.id) {
				await prisma.order_items.update({
					where: { id: existingItem.id },
					data: {
						product_id: item.productId,
						product_name: item.productName,
						variant_name: item.variantName,
						quantity: item.quantity,
						unit_price: item.unitPrice,
						line_total: item.lineTotal,
						price: item.unitPrice,
						metadata: { seed_tag: SEED_TAG },
					},
				})
			} else {
				await prisma.order_items.create({
					data: {
						order_id: orderRecord.id,
						product_id: item.productId,
						variant_id: item.variantId,
						product_name: item.productName,
						variant_name: item.variantName,
						quantity: item.quantity,
						unit_price: item.unitPrice,
						line_total: item.lineTotal,
						price: item.unitPrice,
						metadata: { seed_tag: SEED_TAG },
					},
				})
			}
		}
	}
}

async function main() {
	console.log('🌱 Seeding Basim demo data for crm.basim.id...')

	const [primaryInbox, secondaryInbox] = await prisma.inboxes.findMany({
		where: { app_id: APP_ID, channel_type: 'whatsapp', deleted_at: null },
		orderBy: { created_at: 'asc' },
		take: 2,
	})

	if (!primaryInbox) {
		throw new Error('No WhatsApp inbox found for the target app')
	}

	const chatbot = await prisma.chatbots.findFirst({
		where: { app_id: APP_ID, is_deleted: false },
		orderBy: { created_at: 'asc' },
	})
	if (!chatbot) throw new Error('No chatbot found for the target app')

	const team = await prisma.teams.findFirst({
		where: { app_id: APP_ID, name: 'Customer Service' },
	})
	if (!team) throw new Error('Customer Service team not found')

	const division = await prisma.divisions.findFirst({
		where: { app_id: APP_ID, name: 'Customer Service' },
	})
	if (!division) throw new Error('Customer Service division not found')

	await prisma.users.update({
		where: { id: USER_ID },
		data: {
			app_id: APP_ID,
			organization_name: 'Basim Digital',
			organization_slug: 'basim-demo',
			last_app_used: APP_ID,
			active: true,
		},
	})

	await prisma.inboxes.update({
		where: { id: primaryInbox.id },
		data: {
			name: 'WA: BumiKopi Sales',
			chatbot_id: chatbot.id,
			auto_assign_enabled: true,
			greeting_enabled: true,
			greeting_message:
				'Halo, selamat datang di BumiKopi ☕ Kami siap bantu pilih kopi untuk kantor, reseller, atau hampers.',
			enable_auto_assignment: true,
			allow_messages_after_resolved: true,
			lock_to_single_conversation: false,
			is_active: true,
		},
	})

	if (secondaryInbox) {
		await prisma.inboxes.update({
			where: { id: secondaryInbox.id },
			data: {
				name: 'WA: BumiKopi Support',
				greeting_enabled: true,
				greeting_message:
					'Terima kasih sudah menghubungi BumiKopi Support. Ada yang bisa kami bantu?',
				chatbot_id: chatbot.id,
				auto_assign_enabled: false,
				is_active: true,
			},
		})
	}

	await prisma.chatbots.update({
		where: { id: chatbot.id },
		data: {
			name: 'BumiKopi Assistant',
			description: 'Demo assistant untuk penjualan kopi, follow-up lead, dan FAQ order.',
			model: 'gpt-4o-mini',
			prompt:
				'Kamu adalah asisten penjualan BumiKopi. Jawab singkat, ramah, dan fokus pada konversi. Jika pelanggan menanyakan katalog, harga, pengiriman, atau pembayaran, beri jawaban praktis dan ajak lanjut ke checkout.',
			welcome_msg:
				'Halo! Saya BumiKopi Assistant. Saya bantu rekomendasi kopi, cek harga, dan proses order.',
			watcher_enabled: true,
			is_hidden: false,
			is_deleted: false,
			ai_followups: [
				'Mau saya kirim katalog lengkap?',
				'Apakah untuk kebutuhan pribadi atau kantor?',
				'Kalau cocok, saya bantu lanjutkan checkout ya.',
			],
			selected_labels: ['Hot Lead', 'Warm Lead', 'Paid', 'Follow Up'],
		},
	})

	await prisma.agent_settings.upsert({
		where: { app_id: APP_ID },
		update: {
			auto_assign_agent: true,
			agent_can_takeover_unserved: true,
			agent_can_access_customers: true,
			agent_can_import_export_customers: true,
			agent_can_send_broadcast: true,
			agent_can_assign_chat: true,
			agent_can_add_agents_to_chat: true,
			agent_can_manage_quick_replies: true,
			hide_handover_dialogue: false,
			updated_at: new Date(),
		},
		create: {
			app_id: APP_ID,
			auto_assign_agent: true,
			agent_can_takeover_unserved: true,
			agent_can_access_customers: true,
			agent_can_import_export_customers: true,
			agent_can_send_broadcast: true,
			agent_can_assign_chat: true,
			agent_can_add_agents_to_chat: true,
			agent_can_manage_quick_replies: true,
			hide_handover_dialogue: false,
		},
	})

	await prisma.ai_settings.upsert({
		where: { app_id: APP_ID },
		update: {
			ai_mode: 'assist',
			model_provider: 'openai',
			model_name: 'gpt-4o-mini',
			temperature: 0.3,
			max_tokens: 700,
			auto_reply_confidence: 0.82,
			response_tone: 'friendly',
			supported_languages: ['id', 'en'],
			auto_detect_language: true,
			use_platform_credentials: false,
			updated_at: new Date(),
		},
		create: {
			app_id: APP_ID,
			ai_mode: 'assist',
			model_provider: 'openai',
			model_name: 'gpt-4o-mini',
			temperature: 0.3,
			max_tokens: 700,
			auto_reply_confidence: 0.82,
			response_tone: 'friendly',
			supported_languages: ['id', 'en'],
			auto_detect_language: true,
			use_platform_credentials: false,
		},
	})

	const labelMap = new Map<string, string>()
	for (const label of LABELS) {
		const created = await upsertAccountScopedRow(
			prisma.labels,
			{ account_id: ACCOUNT_ID, title: label.title },
			{
				account_id: ACCOUNT_ID,
				app_id: APP_ID,
				title: label.title,
				color: label.color,
				is_visible: true,
				show_on_sidebar: true,
				description: `${label.title} demo label`,
			},
			{
				app_id: APP_ID,
				color: label.color,
				is_visible: true,
				show_on_sidebar: true,
				description: `${label.title} demo label`,
				updated_at: new Date(),
			},
		)
		labelMap.set(label.title, created.id)
	}

	for (const tag of CONTACT_TAGS) {
		await upsertAccountScopedRow(
			prisma.contact_tags,
			{ app_id: APP_ID, name: tag.name },
			{ app_id: APP_ID, name: tag.name, color: tag.color },
			{ color: tag.color },
		)
	}

	for (let i = 0; i < CONTACT_FIELDS.length; i++) {
		const field = CONTACT_FIELDS[i]
		await upsertAccountScopedRow(
			prisma.contact_custom_fields,
			{ app_id: APP_ID, field_key: field.field_key },
			{
				app_id: APP_ID,
				field_key: field.field_key,
				field_label: field.field_label,
				field_type: field.field_type,
				options: field.options,
				is_required: field.is_required,
				is_visible: true,
				display_order: i + 1,
			},
			{
				field_label: field.field_label,
				field_type: field.field_type,
				options: field.options,
				is_required: field.is_required,
				is_visible: true,
				display_order: i + 1,
			},
		)
	}

	for (const reply of QUICK_REPLIES) {
		await upsertAccountScopedRow(
			prisma.canned_responses,
			{ account_id: ACCOUNT_ID, short_code: reply.short_code },
			{
				account_id: ACCOUNT_ID,
				app_id: APP_ID,
				short_code: reply.short_code,
				content: reply.content,
			},
			{ content: reply.content, app_id: APP_ID },
		)
	}

	await upsertAccountScopedRow(
		prisma.auto_responder_rules,
		{ app_id: APP_ID, name: 'BumiKopi Welcome Rule' },
		{
			app_id: APP_ID,
			inbox_id: primaryInbox.id,
			name: 'BumiKopi Welcome Rule',
			description: 'Auto welcome reply for new WhatsApp conversations',
			trigger_type: 'conversation_created',
			trigger_config: { channel: 'whatsapp', seed_tag: SEED_TAG },
			response_type: 'text',
			response_content:
				'Halo kak, terima kasih sudah menghubungi BumiKopi ☕ Kami kirim katalog dan rekomendasi produk dalam satu balasan ya.',
			response_delay_seconds: 3,
			max_triggers_per_conversation: 1,
			cooldown_minutes: 1440,
			is_active: true,
			priority: 1,
		},
		{
			inbox_id: primaryInbox.id,
			response_content:
				'Halo kak, terima kasih sudah menghubungi BumiKopi ☕ Kami kirim katalog dan rekomendasi produk dalam satu balasan ya.',
			response_delay_seconds: 3,
			max_triggers_per_conversation: 1,
			cooldown_minutes: 1440,
			is_active: true,
			priority: 1,
		},
	)

	for (const variable of [
		{ name: 'brand_name', category: 'brand', value: 'BumiKopi', fallback_value: 'BumiKopi' },
		{
			name: 'support_hours',
			category: 'support',
			value: 'Senin-Sabtu 09.00-18.00 WIB',
			fallback_value: '09.00-18.00 WIB',
		},
	]) {
		const existingVariable = await prisma.template_variables.findFirst({
			where: { app_id: APP_ID, name: variable.name },
			select: { id: true },
		})
		if (existingVariable?.id) {
			await prisma.template_variables.update({
				where: { id: existingVariable.id },
				data: {
					value: variable.value,
					fallback_value: variable.fallback_value,
					category: variable.category,
					updated_at: new Date(),
				},
			})
		} else {
			await prisma.template_variables.create({
				data: {
					app_id: APP_ID,
					name: variable.name,
					category: variable.category,
					value: variable.value,
					fallback_value: variable.fallback_value,
				},
			})
		}
	}

	await prisma.customer_level_settings.upsert({
		where: { app_id: APP_ID },
		update: {
			basic_chatbot_id: chatbot.id,
			premium_chatbot_id: chatbot.id,
			vip_chatbot_id: chatbot.id,
			updated_at: new Date(),
		},
		create: {
			app_id: APP_ID,
			basic_chatbot_id: chatbot.id,
			premium_chatbot_id: chatbot.id,
			vip_chatbot_id: chatbot.id,
		},
	})

	const contacts = await ensureContacts()
	const products = await ensureProducts()
	const productMap = new Map<string, any>()
	for (const product of products) {
		const productRow = await prisma.products.findFirst({ where: { app_id: APP_ID, sku: product.sku } })
		if (!productRow) continue
		productMap.set(product.sku, { ...productRow, productId: productRow.id })
		const variants = await prisma.product_variants.findMany({
			where: { app_id: APP_ID, product_id: productRow.id },
		})
		for (const variant of variants) {
			productMap.set(variant.sku || `${product.sku}-${variant.name}`, variant)
		}
	}

	const pipeline = await prisma.pipelines.findFirst({
		where: { app_id: APP_ID, name: 'Contact Stages' },
	})
	if (!pipeline) throw new Error('Contact Stages pipeline missing')
	const stages = await prisma.pipeline_stages.findMany({
		where: { pipeline_id: pipeline.id },
		orderBy: { stage_order: 'asc' },
	})
	const pipelineMap = new Map<string, string>([['Contact Stages', pipeline.id]])
	const stageMap = new Map<string, string>()
	for (const stage of stages) stageMap.set(stage.name, stage.id)

	const teamMemberExists = await prisma.team_members.findFirst({
		where: { team_id: team.id, user_id: USER_ID },
		select: { team_id: true },
	})
	if (!teamMemberExists) {
		await prisma.team_members.create({
			data: { team_id: team.id, user_id: USER_ID },
		})
	}

	const agentDivisionExists = await prisma.agent_divisions.findFirst({
		where: { user_id: USER_ID, division_id: division.id },
		select: { user_id: true },
	})
	if (!agentDivisionExists) {
		await prisma.agent_divisions.create({
			data: { user_id: USER_ID, division_id: division.id },
		})
	}

	const inboxId = primaryInbox.id
	const conversationRecords: Record<string, any> = {}

	conversationRecords['seed-bumikopi-andi'] = await ensureConversation(
		{
			identifier: 'seed-conv-andi',
			contactId: contacts['seed-bumikopi-andi'].id,
			inboxId,
			status: 'open',
			priority: 'high',
			teamId: team.id,
			assigneeId: USER_ID,
			labelTitles: ['Hot Lead', 'VIP'],
			pipelineStageName: 'Hot Leads',
			journeyPhase: 'negotiation',
			dealValue: 378000,
			messages: [
				{ external_id: 'seed-andi-msg-1', content: 'Halo kak, saya mau order gift box untuk kantor 40 pcs.', sender_type: 'contact', created_at: makeDate(-12) },
				{ external_id: 'seed-andi-msg-2', content: 'Siap kak, untuk 40 pcs kami bisa bantu custom kartu ucapan dan invoice. Mau saya kirimkan pilihan paket?', sender_type: 'agent', created_at: makeDate(-11) },
			],
		},
		labelMap,
		pipelineMap,
		stageMap,
	)

	conversationRecords['seed-bumikopi-budi'] = await ensureConversation(
		{
			identifier: 'seed-conv-budi',
			contactId: contacts['seed-bumikopi-budi'].id,
			inboxId,
			status: 'resolved',
			priority: 'normal',
			teamId: team.id,
			assigneeId: USER_ID,
			labelTitles: ['Paid', 'Warm Lead'],
			pipelineStageName: 'Payment',
			journeyPhase: 'paid',
			dealValue: 450000,
			messages: [
				{ external_id: 'seed-budi-msg-1', content: 'Cold brew 10 botol ready ya? Saya butuh untuk acara besok.', sender_type: 'contact', created_at: makeDate(-34) },
				{ external_id: 'seed-budi-msg-2', content: 'Ready kak, stok aman. Saya bantu buat link pembayaran sekarang ya.', sender_type: 'agent', created_at: makeDate(-33) },
				{ external_id: 'seed-budi-msg-3', content: 'Sudah saya bayar, terima kasih.', sender_type: 'contact', created_at: makeDate(-32) },
			],
		},
		labelMap,
		pipelineMap,
		stageMap,
	)

	conversationRecords['seed-bumikopi-siti'] = await ensureConversation(
		{
			identifier: 'seed-conv-siti',
			contactId: contacts['seed-bumikopi-siti'].id,
			inboxId,
			status: 'open',
			priority: 'normal',
			teamId: team.id,
			assigneeId: USER_ID,
			labelTitles: ['New Lead', 'Follow Up'],
			pipelineStageName: 'New Leads',
			journeyPhase: 'awareness',
			dealValue: 89000,
			messages: [
				{ external_id: 'seed-siti-msg-1', content: 'Kak, saya cari kopi untuk gift client, ada rekomendasi?', sender_type: 'contact', created_at: makeDate(-20) },
				{ external_id: 'seed-siti-msg-2', content: 'Ada kak, paling cocok Gift Box atau Drip Bag. Budget kakak berapa ya?', sender_type: 'agent', created_at: makeDate(-19) },
			],
		},
		labelMap,
		pipelineMap,
		stageMap,
	)

	conversationRecords['seed-bumikopi-nia'] = await ensureConversation(
		{
			identifier: 'seed-conv-nia',
			contactId: contacts['seed-bumikopi-nia'].id,
			inboxId,
			status: 'open',
			priority: 'high',
			teamId: team.id,
			assigneeId: USER_ID,
			labelTitles: ['Hot Lead', 'Corporate'],
			pipelineStageName: 'Payment',
			journeyPhase: 'checkout',
			dealValue: 1720000,
			messages: [
				{ external_id: 'seed-nia-msg-1', content: 'Kami dari corporate ingin order hampers 100 box. Bisa invoice resmi?', sender_type: 'contact', created_at: makeDate(-8) },
				{ external_id: 'seed-nia-msg-2', content: 'Bisa kak. Kami siapkan invoice, detail PO, dan opsi kirim bertahap.', sender_type: 'agent', created_at: makeDate(-7) },
			],
		},
		labelMap,
		pipelineMap,
		stageMap,
	)

	conversationRecords['seed-bumikopi-dewi'] = await ensureConversation(
		{
			identifier: 'seed-conv-dewi',
			contactId: contacts['seed-bumikopi-dewi'].id,
			inboxId,
			status: 'resolved',
			priority: 'low',
			teamId: team.id,
			assigneeId: USER_ID,
			labelTitles: ['Warm Lead'],
			pipelineStageName: 'Customer',
			journeyPhase: 'paid',
			dealValue: 65000,
			messages: [
				{ external_id: 'seed-dewi-msg-1', content: 'Mau coba drip bag 10 pcs, kira-kira enak untuk hadiah kecil?', sender_type: 'contact', created_at: makeDate(-50) },
				{ external_id: 'seed-dewi-msg-2', content: 'Cocok kak, pack ini paling banyak dipakai untuk gift kecil dan onboarding customer baru.', sender_type: 'agent', created_at: makeDate(-49) },
				{ external_id: 'seed-dewi-msg-3', content: 'Oke, saya ambil 3 pack ya.', sender_type: 'contact', created_at: makeDate(-48) },
			],
		},
		labelMap,
		pipelineMap,
		stageMap,
	)

	conversationRecords['seed-bumikopi-farhan'] = await ensureConversation(
		{
			identifier: 'seed-conv-farhan',
			contactId: contacts['seed-bumikopi-farhan'].id,
			inboxId,
			status: 'open',
			priority: 'normal',
			teamId: team.id,
			assigneeId: USER_ID,
			labelTitles: ['Reseller', 'Warm Lead'],
			pipelineStageName: 'Hot Leads',
			journeyPhase: 'negotiation',
			dealValue: 315000,
			messages: [
				{ external_id: 'seed-farhan-msg-1', content: 'Saya reseller, ada harga grosir untuk beans 1kg?', sender_type: 'contact', created_at: makeDate(-17) },
				{ external_id: 'seed-farhan-msg-2', content: 'Ada kak, untuk reseller kami siapkan harga tier khusus dan repeat order mingguan.', sender_type: 'agent', created_at: makeDate(-16) },
			],
		},
		labelMap,
		pipelineMap,
		stageMap,
	)

	conversationRecords['seed-bumikopi-rika'] = await ensureConversation(
		{
			identifier: 'seed-conv-rika',
			contactId: contacts['seed-bumikopi-rika'].id,
			inboxId,
			status: 'open',
			priority: 'high',
			teamId: team.id,
			assigneeId: USER_ID,
			labelTitles: ['Corporate', 'VIP'],
			pipelineStageName: 'Hot Leads',
			journeyPhase: 'negotiation',
			dealValue: 1368000,
			messages: [
				{ external_id: 'seed-rika-msg-1', content: 'Kami hotel butuh kopi untuk welcome package tamu. Bisa 100 pcs?', sender_type: 'contact', created_at: makeDate(-14) },
				{ external_id: 'seed-rika-msg-2', content: 'Bisa kak, kami ada opsi premium gift dan harga corporate. Saya siapkan proposal ya.', sender_type: 'agent', created_at: makeDate(-13) },
			],
		},
		labelMap,
		pipelineMap,
		stageMap,
	)

	await ensureOrders(contacts, conversationRecords, productMap)

	for (const faq of FAQS) {
		const existingFaq = await prisma.knowledge_faqs.findFirst({
			where: { app_id: APP_ID, chatbot_id: chatbot.id, question: faq.question },
			select: { id: true },
		})
		if (existingFaq?.id) {
			await prisma.knowledge_faqs.update({
				where: { id: existingFaq.id },
				data: {
					app_id: APP_ID,
					chatbot_id: chatbot.id,
					question: faq.question,
					answer: faq.answer,
					keywords: faq.keywords,
					is_active: true,
					priority: 1,
					updated_at: new Date(),
				},
			})
		} else {
			await prisma.knowledge_faqs.create({
				data: {
					id: crypto.randomUUID(),
					app_id: APP_ID,
					chatbot_id: chatbot.id,
					question: faq.question,
					answer: faq.answer,
					keywords: faq.keywords,
					priority: 1,
					is_active: true,
				},
			})
		}
	}

	const openConversations = await prisma.conversations.count({
		where: { app_id: APP_ID, status: 'open' },
	})
	const resolvedConversations = await prisma.conversations.count({
		where: { app_id: APP_ID, status: 'resolved' },
	})
	const productCount = await prisma.products.count({ where: { app_id: APP_ID } })
	const contactCount = await prisma.contacts.count({ where: { app_id: APP_ID } })
	const orderCount = await prisma.orders.count({ where: { app_id: APP_ID } })
	const faqCount = await prisma.knowledge_faqs.count({
		where: { app_id: APP_ID, chatbot_id: chatbot.id },
	})

	console.log(
		JSON.stringify(
			{
				ok: true,
				appId: APP_ID,
				orgId: ORG_ID,
				accountId: ACCOUNT_ID,
				userId: USER_ID,
				counts: {
					contacts: contactCount,
					products: productCount,
					orders: orderCount,
					openConversations,
					resolvedConversations,
					faqs: faqCount,
				},
			},
			null,
			2,
		),
	)
}

main()
	.catch((error) => {
		console.error('❌ Basim demo seed failed:', error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
