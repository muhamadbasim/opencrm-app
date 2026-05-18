import { describe, expect, it, vi } from 'bun:test'

vi.mock('../src/lib/prisma', () => ({
	default: {},
}))
vi.mock('../src/modules/ai/service', () => ({
	AIService: {},
}))
vi.mock('../src/modules/api-tools/service', () => ({
	APIToolsService: {},
}))

const { __test__ } = await import('../src/modules/chatbot/simulation-service')

function makeTool(args: {
	id: string
	name: string
	max_tool_calls?: number | null
}) {
	return {
		id: args.id,
		created_at: new Date().toISOString(),
		business_id: 'app-1',
		name: args.name,
		description: `${args.name} description`,
		webhook_address: 'https://example.com/webhook',
		required: [],
		properties: [],
		max_tool_calls:
			args.max_tool_calls === undefined ? null : args.max_tool_calls,
		api_key: null,
		additional_payload: null,
		method: 'POST',
		authorizationKey: null,
		workflow_id: null,
		schema: null,
		type: 'simple',
	}
}

function makeToolRun(args: {
	toolName: string
	responsePreview: string | null
	ok?: boolean
	skipped?: boolean
}) {
	const ok = args.ok ?? true
	return {
		toolId: 'tool-1',
		toolName: args.toolName,
		method: 'POST',
		url: 'https://example.com/webhook',
		ok,
		skipped: args.skipped ?? false,
		status: ok ? 200 : 500,
		error: ok ? null : 'request failed',
		responsePreview: args.responsePreview,
	}
}

describe('ChatbotSimulationService tool policy helpers', () => {
	it('toBooleanFlag handles boolean-like values safely', () => {
		expect(__test__.toBooleanFlag(true)).toBe(true)
		expect(__test__.toBooleanFlag(false)).toBe(false)
		expect(__test__.toBooleanFlag('true')).toBe(true)
		expect(__test__.toBooleanFlag('false')).toBe(false)
		expect(__test__.toBooleanFlag('active')).toBe(true)
		expect(__test__.toBooleanFlag('inactive')).toBe(false)
		expect(__test__.toBooleanFlag('unknown', true)).toBe(true)
	})

	it('normalizeAgentToolCards parses id/name and robust is_active values', () => {
		const cards = __test__.normalizeAgentToolCards([
			{ id: 'tool-1', name: 'Tool A', is_active: 'true' },
			{ id: 'tool-2', name: 'Tool B', is_active: 'false' },
		])

		expect(cards).toEqual([
			{
				id: 'tool-1',
				lookupName: 'tool_a',
				isActive: true,
				priority: 0,
			},
			{
				id: 'tool-2',
				lookupName: 'tool_b',
				isActive: false,
				priority: 1,
			},
		])
	})

	it('resolveCandidateTools returns no tools when agent has no configured cards (strict mode)', () => {
		const tools = [
			makeTool({ id: 'tool-1', name: 'Tool A' }),
			makeTool({ id: 'tool-2', name: 'Tool B', max_tool_calls: 0 }),
		]

		const candidates = __test__.resolveCandidateTools({
			availableTools: tools,
			configuredCardsRaw: null,
		})

		expect(candidates).toEqual([])
	})

	it('resolveCandidateTools blocks execution when cards are configured but none active', () => {
		const tools = [makeTool({ id: 'tool-1', name: 'Tool A' })]

		const candidates = __test__.resolveCandidateTools({
			availableTools: tools,
			configuredCardsRaw: [
				{ id: 'tool-1', name: 'Tool A', is_active: false },
			],
		})

		expect(candidates).toEqual([])
	})

	it('resolveCandidateTools keeps only active mapped tools and respects card priority', () => {
		const tools = [
			makeTool({ id: 'tool-1', name: 'Tool A' }),
			makeTool({ id: 'tool-2', name: 'Tool B' }),
			makeTool({ id: 'tool-3', name: 'Tool C' }),
		]

		const candidates = __test__.resolveCandidateTools({
			availableTools: tools,
			configuredCardsRaw: [
				{ id: 'tool-2', name: 'Tool B', is_active: true },
				{ id: 'tool-1', name: 'Tool A', is_active: true },
				{ id: 'tool-3', name: 'Tool C', is_active: false },
			],
		})

		expect(candidates.map((tool: any) => tool.id)).toEqual(['tool-2', 'tool-1'])
	})

	it('inferLocationIntent requires explicit location intent in current user message', () => {
		const locationIntent = __test__.inferLocationIntent({
			message: 'Cabang terdekat di Bogor di mana ya?',
			history: [
				{
					role: 'assistant',
					content:
						'Kalau boleh tahu, Kakak berdomisili di mana? Nanti saya bantu carikan cabang terdekat.',
				},
			],
			conversationLocation: 'bogor',
		})

		expect(locationIntent).toBe(true)
	})

	it('inferLocationIntent does not classify promo keyword reply as location answer', () => {
		const locationIntent = __test__.inferLocationIntent({
			message: 'IPL Glow 199rb',
			history: [
				{
					role: 'assistant',
					content:
						'Kalau boleh tahu, Kakak berdomisili di mana? Nanti saya bantu carikan cabang terdekat.',
				},
			],
			conversationLocation: null,
		})

		expect(locationIntent).toBe(false)
	})

	it('inferLocationIntent does not classify weekend or weekdays prompt as location answer', () => {
		const locationIntent = __test__.inferLocationIntent({
			message: 'Kakak mau coba di weekend atau weekdays nih kak?',
			history: [
				{
					role: 'assistant',
					content:
						'Kalau boleh tahu, Kakak berdomisili di mana? Nanti saya bantu carikan cabang terdekat.',
				},
			],
			conversationLocation: 'bogor',
		})

		expect(locationIntent).toBe(false)
	})

	it('inferLocationIntent ignores synthetic follow-up generator prompts containing di weekend', () => {
		const locationIntent = __test__.inferLocationIntent({
			message: [
				'You are generating a follow-up message for an inactive conversation.',
				'Rule: Kakak mau coba di weekend atau weekdays nih kak?',
				'Inactivity window: 60 minutes.',
				'Write one concise follow-up in the user language, friendly and actionable.',
			].join('\n'),
			history: [
				{
					role: 'assistant',
					content:
						'Kalau boleh tahu, Kakak berdomisili di mana? Nanti saya bantu carikan cabang terdekat.',
				},
			],
			conversationLocation: 'bogor',
		})

		expect(locationIntent).toBe(false)
	})

	it('buildLocationResponseFromToolRuns formats all location branches from get_location_branch payload', () => {
		const response = __test__.buildLocationResponseFromToolRuns({
			locationHint: 'bogor',
			toolRuns: [
				makeToolRun({
					toolName: 'get_location_branch',
					responsePreview: JSON.stringify({
						location: 'Bogor',
						branches: [
							{
								name: 'SOZO Skin Clinic Bogor',
								address:
									'Jl. Bangbarung Raya No.24, RT.02/RW.07, Bantarjati, Kec. Bogor Utara, Kota Bogor, Jawa Barat 16153',
								maps: 'https://maps.app.goo.gl/U3FKERMhzpJbPAKc7',
							},
							{
								name: 'SOZO Skin Clinic Cibubur',
								address:
									'Ruko Downtown Madison Blok SHC 6 No. 8, Kel. Ciangsana, Kec. Gunung Putri, Kab. Bogor',
								maps: 'https://maps.app.goo.gl/5M41YPvkpoN9udTQ6',
							},
							{
								name: 'SOZO Skin Clinic Cibinong',
								address:
									'Jl. Raya Jakarta-Bogor KM. 45 No. 43a, Pakansari, Kec. Cibinong, Kabupaten Bogor',
								maps: 'https://maps.app.goo.gl/kpQxNUxk8jVgu7Uf8',
							},
							{
								name: 'SOZO Skin Clinic Bogor Taman Yasmin',
								address:
									'Jl. Brigjen Saptadji Hadiprawira No. 1 & 2, Cilendek Barat, Bogor Barat, Kota Bogor, Jawa Barat 16112',
								maps: 'https://maps.app.goo.gl/Po5noQvdeSjmrFHn8',
							},
						],
					}),
				}),
			],
		})

		expect(response).toContain('Untuk di Bogor, berikut cabang SOZO yang tersedia:')
		expect(response).toContain('1. SOZO Skin Clinic Bogor')
		expect(response).toContain('2. SOZO Skin Clinic Cibubur')
		expect(response).toContain('3. SOZO Skin Clinic Cibinong')
		expect(response).toContain('4. SOZO Skin Clinic Bogor Taman Yasmin')
	})

	it('buildLocationResponseFromKnowledge falls back to knowledge branch list when tool output is unavailable', () => {
		const response = __test__.buildLocationResponseFromKnowledge({
			locationHint: 'bogor',
			knowledge: [
				{
					type: 'source',
					title: 'Informasi Umum',
					score: 5,
					content: [
						'Di Bogor, SOZO Skin Clinic memiliki beberapa cabang. Berikut daftarnya:',
						'1. SOZO Skin Clinic Bogor',
						'Alamat: Jl. Bangbarung Raya No.24, RT.02/RW.07, Bantarjati, Kec. Bogor Utara, Kota Bogor, Jawa Barat 16153',
						'Maps: https://maps.app.goo.gl/U3FKERMhzpJbPAKc7',
						'2. SOZO Skin Clinic Cibubur',
						'Alamat: Ruko Downtown Madison Blok SHC 6 No. 8, Kel. Ciangsana, Kec. Gunung Putri, Kab. Bogor',
						'Maps: https://maps.app.goo.gl/5M41YPvkpoN9udTQ6',
						'3. SOZO Skin Clinic Cibinong',
						'Alamat: Jl. Raya Jakarta-Bogor KM. 45 No. 43a, Pakansari, Kec. Cibinong, Kabupaten Bogor',
						'Maps: https://maps.app.goo.gl/kpQxNUxk8jVgu7Uf8',
						'4. SOZO Skin Clinic Bogor Taman Yasmin',
						'Alamat: Jl. Brigjen Saptadji Hadiprawira No. 1 & 2, Cilendek Barat, Bogor Barat, Kota Bogor, Jawa Barat 16112',
						'Maps: https://maps.app.goo.gl/Po5noQvdeSjmrFHn8',
					].join('\n'),
				},
			],
		})

		expect(response).toContain('Untuk di Bogor, berikut cabang SOZO yang tersedia:')
		expect(response).toContain('1. SOZO Skin Clinic Bogor')
		expect(response).toContain('2. SOZO Skin Clinic Cibubur')
		expect(response).toContain('3. SOZO Skin Clinic Cibinong')
		expect(response).toContain('4. SOZO Skin Clinic Bogor Taman Yasmin')
	})

	it('extractSequenceTwoVoucherClosingFromPrompt reads sequence-2 closing template from behavior prompt', () => {
		const closing = __test__.extractSequenceTwoVoucherClosingFromPrompt([
			'FORMAT PENUTUP HANYA UNTUK Sequence ke-2 (CONTOH)',
			'"Oh iya kak, Kakak juga bisa mendapatkan voucher treatment 50K + konsultasi dokter gratis jika kakak booking hari ini 😊',
			'',
			'Kakak mau coba di weekend atau weekdays nih kak?"',
		].join('\n'))

		expect(closing).toContain('voucher treatment 50K')
		expect(closing).toContain('weekend atau weekdays')
	})

	it('resolveSequenceTwoVoucherClosing can derive closing from follow-up rules and normalize opening phrase', () => {
		const closing = __test__.resolveSequenceTwoVoucherClosing({
			behaviorPrompt: null,
			matchedFollowups: [
				{
					prompt: [
						'Jika customer sudah tanya lokasi cabang lalu menghilang maka kirimkan followup:',
						'{Kakak juga bisa mendapatkan voucher treatment 50K + konsultasi dokter gratis jika kakak booking hari ini 😊',
						'',
						'Kakak mau coba di weekend atau weekdays nih kak?}',
					].join('\n'),
				},
			],
			allFollowups: [],
		})

		expect(closing).toContain('Oh iya kak,')
		expect(closing).toContain('voucher treatment 50K')
		expect(closing).toContain('weekend atau weekdays')
	})

	it('buildExecutedToolStatusDetails includes readable location tool output summary', () => {
		const statuses = __test__.buildExecutedToolStatusDetails({
			locationHint: 'bintaro',
			toolRuns: [
				makeToolRun({
					toolName: 'get_location_branch',
					responsePreview: JSON.stringify([
						{
							name: 'SOZO Skin Clinic Bintaro',
							alamat: 'Jl. Bintaro Utama V Blok EA 2',
							maps: 'https://maps.app.goo.gl/aoswurDFndc684u38',
						},
					]),
				}),
			],
		})

		expect(statuses).toHaveLength(1)
		expect(statuses[0]).toContain('Location tool output')
		expect(statuses[0]).toContain('SOZO Skin Clinic Bintaro')
	})

	it('shouldAttachAutomaticImage skips promo image injection on location replies', () => {
		expect(
			__test__.shouldAttachAutomaticImage({
				locationIntent: true,
				toolRuns: [],
			}),
		).toBe(false)

		expect(
			__test__.shouldAttachAutomaticImage({
				locationIntent: false,
				toolRuns: [
					makeToolRun({
						toolName: 'get_location_branch',
						responsePreview: '{"branches":[]}',
					}),
				],
			}),
		).toBe(false)

		expect(
			__test__.shouldAttachAutomaticImage({
				locationIntent: false,
				toolRuns: [
					makeToolRun({
						toolName: 'getPromoLainnya',
						responsePreview: '{"ok":true}',
					}),
				],
				message: 'Ada promo apa saat ini?',
			}),
		).toBe(true)
	})

	it('shouldAttachAutomaticImage skips auto image in strict follow-up mode', () => {
		expect(
			__test__.shouldAttachAutomaticImage({
				locationIntent: false,
				strictFollowupMode: true,
				toolRuns: [
					makeToolRun({
						toolName: 'getPromoLainnya',
						responsePreview: '{"ok":true}',
					}),
				],
				message: 'Ada promo apa?',
			}),
		).toBe(false)
	})

	it('shouldAttachAutomaticImage skips unrelated consultation CTA reply', () => {
		expect(
			__test__.shouldAttachAutomaticImage({
				locationIntent: false,
				toolRuns: [],
				message: 'iya',
				resolvedContent:
					'Mau aku bantu jadwalkan konsultasinya? Kakak lebih prefer weekday atau weekend?',
			}),
		).toBe(false)
	})

	it('extractImageCandidates prioritizes inline image URL from AI text response', () => {
		const candidates = __test__.extractImageCandidates({
			resolvedContent:
				'Berikut detail harganya ya Kak: ![Harga IPL Glow](https://files.example.com/ipl_glow_price.jpg)',
			selectedKnowledge: [
				{
					type: 'source',
					title: 'General Promo',
					content:
						'Promo lainnya: https://files.example.com/hair_removal_underarm.png',
					score: 2,
				},
			],
			toolRuns: [],
			messageKeywords: new Set(['ipl', 'glow', '199rb']),
		})

		expect(candidates).toEqual(['https://files.example.com/ipl_glow_price.jpg'])
	})

	it('extractImageCandidates ranks inline markdown images by key relevance from alt/context', () => {
		const candidates = __test__.extractImageCandidates({
			resolvedContent: [
				'Berikut detail harganya ya Kak:',
				'![Hair Removal](https://files.example.com/hair.jpg)',
				'![Harga IPL Glow](https://files.example.com/ipl_glow_price.jpg)',
			].join('\n'),
			selectedKnowledge: [],
			toolRuns: [],
			messageKeywords: new Set(['ipl', 'glow', '199rb']),
		})

		expect(candidates[0]).toBe('https://files.example.com/ipl_glow_price.jpg')
	})

	it('extractImageCandidates filters unrelated knowledge image by user intent keyword', () => {
		const candidates = __test__.extractImageCandidates({
			resolvedContent: 'Berikut detail promo yang sesuai kebutuhan Kakak.',
			selectedKnowledge: [
				{
					type: 'source',
					title: 'Hair Removal Promo',
					content:
						'Hair removal underarm flash sale: https://files.example.com/hair_removal_underarm.png',
					score: 5,
				},
				{
					type: 'source',
					title: 'IPL Glow Promo',
					content:
						'IPL Glow 199rb special: https://files.example.com/ipl_glow_price.jpg',
					score: 3,
				},
			],
			toolRuns: [],
			messageKeywords: new Set(['ipl', 'glow', '199rb']),
		})

		expect(candidates[0]).toBe('https://files.example.com/ipl_glow_price.jpg')
		expect(candidates).not.toContain(
			'https://files.example.com/hair_removal_underarm.png',
		)
	})

	it('extractImageCandidates accepts files.cekat.ai image URLs without extension', () => {
		const candidates = __test__.extractImageCandidates({
			resolvedContent: [
				'Berikut detail harganya ya Kak:',
				'![Harga IPL Glow](https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April_G2elX)',
			].join('\n'),
			selectedKnowledge: [],
			toolRuns: [],
			messageKeywords: new Set(['ipl', 'glow']),
		})

		expect(candidates).toEqual([
			'https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April_G2elX',
		])
	})

	it('buildImageIntentKeywords infers treatment token from price response when user message is generic', () => {
		const keywords = __test__.buildImageIntentKeywords({
			messageKeywords: new Set(['harga', '499k']),
			message: 'itu harganya 499k atau 699k?',
			resolvedContent:
				'Untuk Acne Laser Facial, saat ini harganya 499K ya Kak. Berikut detail harganya:',
			history: [
				{
					role: 'assistant',
					content:
						'Untuk Acne Laser Facial, saat ini harganya 499K ya Kak. Berikut detail harganya:',
				},
			],
		})

		expect(keywords.has('acne')).toBe(true)
		expect(keywords.has('laser')).toBe(true)
		expect(keywords.has('facial')).toBe(true)
	})

	it('extractTreatmentPriceContext picks treatment-specific promo instead of unrelated nearby price', () => {
		const priceContext = __test__.extractTreatmentPriceContext({
			treatment: 'Acne Laser Facial',
			knowledgeSources: [
				{
					title: 'Treatment Recommendation',
					content: [
						'## Jerawat / Bruntusan / Acne',
						'### Treatment Pilihan: Acne Peel, IPL Acne, Acne Laser Facial, Meso Acne',
						'## Meso Pigment https://files.cekat.ai/meso_pigment_flashsale_QChKZm.png',
						'Harga Promo Flash Sale New Customer April (Khusus Customer Baru): 499rb',
						'## Acne Laser Facial https://files.cekat.ai/Flash_Sale_Nov_Acne_Laser_Facial__FY5NaS.png',
						'Harga Normal: 1.499rb',
						'Harga Normal Member: 1.399rb',
						'Harga Promo Flash Sale New Customer April (Khusus Customer Baru): 749rb',
					].join('\n'),
				},
			],
		})

		expect(priceContext).not.toBeNull()
		expect(priceContext?.promo).toBe('Rp 749.000')
		expect(priceContext?.normalMember).toBe('Rp 1.399.000')
		expect(priceContext?.normal).toBe('Rp 1.499.000')
	})

	it('buildDeterministicSingleTreatmentPriceResponse returns the correct treatment promo reply', () => {
		const response = __test__.buildDeterministicSingleTreatmentPriceResponse({
			message: 'itu harganya 499k atau 699k atau 749k?',
			history: [
				{
					role: 'assistant',
					content:
						'Untuk Acne Laser Facial, saat ini harganya 499K ya Kak. Berikut detail harganya:',
				},
			],
			resolvedContent:
				'Untuk Acne Laser Facial, saat ini harganya 499K ya Kak. Berikut detail harganya:',
			knowledgeSources: [
				{
					title: 'Treatment Recommendation',
					content: [
						'## Acne Laser Facial https://files.cekat.ai/Flash_Sale_Nov_Acne_Laser_Facial__FY5NaS.png',
						'Harga Normal: 1.499rb',
						'Harga Normal Member: 1.399rb',
						'Harga Promo Flash Sale New Customer April (Khusus Customer Baru): 749rb',
					].join('\n'),
				},
			],
		})

		expect(response).toContain('Untuk Acne Laser Facial, saat ini harganya Rp 749.000 ya Kak.')
		expect(response).toContain('Berikut detail harganya ya Kak:')
	})

	it('buildDeterministicSingleTreatmentPriceResponse resolves promo-first wording without explicit harga keyword', () => {
		const response = __test__.buildDeterministicSingleTreatmentPriceResponse({
			message: 'Halo SOZO, saya tertarik promo acne laser facial',
			history: [],
			resolvedContent:
				'Untuk Acne Laser Facial, saat ini harganya 299K ya Kak. Berikut detail harganya:',
			knowledgeSources: [
				{
					title: 'Treatment Recommendation',
					content: [
						'## Acne Laser Facial https://files.cekat.ai/Flash_Sale_Nov_Acne_Laser_Facial__FY5NaS.png',
						'Harga Normal: 1.499rb',
						'Harga Normal Member: 1.399rb',
						'Harga Promo Flash Sale New Customer April (Khusus Customer Baru): 749rb',
					].join('\n'),
				},
			],
		})

		expect(response).toContain('Untuk Acne Laser Facial, saat ini harganya Rp 749.000 ya Kak.')
	})

	it('buildTreatmentPriceCatalog parses strict treatment blocks from knowledge content', () => {
		const catalog = __test__.buildTreatmentPriceCatalog({
			knowledgeSources: [
				{
					title: 'HARGA TREATMENT',
					content: [
						'## PRP Face https://files.cekat.ai/PRP_Face_-_flash_sale_X33agE.png',
						'Harga Normal (Non Member): 1.499rb',
						'Harga Normal Member: 1.399rb',
						'Harga Promo Flash Sale New Customer April (Khusus Customer Baru): 7999rb',
					].join('\n'),
				},
			],
		})

		expect(catalog).toHaveLength(1)
		expect(catalog[0]?.name).toBe('PRP Face')
		expect(catalog[0]?.imageUrl).toBe(
			'https://files.cekat.ai/PRP_Face_-_flash_sale_X33agE.png',
		)
		expect(catalog[0]?.promo).toBe('Rp 7.999.000')
		expect(catalog[0]?.normalMember).toBe('Rp 1.399.000')
		expect(catalog[0]?.normal).toBe('Rp 1.499.000')
	})

	it('applyStrictTreatmentPriceFormatter rewrites hallucinated price and image to knowledge values', () => {
		const formatted = __test__.applyStrictTreatmentPriceFormatter({
			message: 'harga promo PRP Face berapa ya?',
			history: [],
			currentContent: [
				'Untuk PRP Face, saat ini harganya Rp 699.000 ya Kak.',
				'Berikut detail harganya ya Kak:',
				'https://files.cekat.ai/PRP_Harga.png',
			].join('\n'),
			knowledgeSources: [
				{
					title: 'HARGA TREATMENT',
					content: [
						'## PRP Face https://files.cekat.ai/PRP_Face_-_flash_sale_X33agE.png',
						'Harga Normal (Non Member): 1.499rb',
						'Harga Normal Member: 1.399rb',
						'Harga Promo Flash Sale New Customer April (Khusus Customer Baru): 7999rb',
					].join('\n'),
				},
			],
		})

		expect(formatted).toContain('Untuk PRP Face, saat ini harganya Rp 7.999.000 ya Kak.')
		expect(formatted).toContain('https://files.cekat.ai/PRP_Face_-_flash_sale_X33agE.png')
		expect(formatted).not.toContain('https://files.cekat.ai/PRP_Harga.png')
		expect(formatted).not.toContain('Rp 699.000')
	})

	it('applyStrictTreatmentPriceFormatter appends missing price image from knowledge', () => {
		const formatted = __test__.applyStrictTreatmentPriceFormatter({
			message: 'harga IPL Acne berapa ya?',
			history: [],
			currentContent: [
				'Untuk IPL Acne, saat ini harganya Rp 199.000 ya Kak.',
				'Berikut detail harganya ya Kak:',
			].join('\n'),
			knowledgeSources: [
				{
					title: 'HARGA TREATMENT',
					content: [
						'## IPL Acne https://files.cekat.ai/IPL_Acne_-_Flash_sale_DQXFEQ.png',
						'Harga Normal: 399rb',
						'Harga Normal Member: 359rb',
						'Harga Promo Flash Sale New Customer April (Khusus Customer Baru): 199rb',
					].join('\n'),
				},
			],
		})

		expect(formatted).toContain('Untuk IPL Acne, saat ini harganya Rp 199.000 ya Kak.')
		expect(formatted).toContain(
			'https://files.cekat.ai/IPL_Acne_-_Flash_sale_DQXFEQ.png',
		)
	})

	it('extractImageCandidates preferPriceImage avoids before-after and aftercare image in price context', () => {
		const candidates = __test__.extractImageCandidates({
			resolvedContent:
				'Untuk Acne Laser Facial, saat ini harganya 499K ya Kak. Berikut detail harganya:',
			selectedKnowledge: [
				{
					type: 'source',
					title: 'Treatment Knowledge',
					content: [
						'Before After: https://files.cekat.ai/Acne_Laser_Facial_1SbqsK.png',
						'Aftercare Tattoo Laser: https://files.cekat.ai/Aftercare_Tatto_Laser_HQYAmI.jpeg',
					].join('\n'),
					score: 8,
				},
				{
					type: 'source',
					title: 'Treatment Recommendation',
					content:
						'Acne Laser Facial: https://files.cekat.ai/Flash_Sale_Nov_Acne_Laser_Facial__FY5NaS.png',
					score: 6,
				},
			],
			toolRuns: [],
			messageKeywords: new Set(['acne', 'laser', 'facial', '499k']),
			preferPriceImage: true,
		})

		expect(candidates[0]).toBe(
			'https://files.cekat.ai/Flash_Sale_Nov_Acne_Laser_Facial__FY5NaS.png',
		)
		expect(candidates).not.toContain(
			'https://files.cekat.ai/Aftercare_Tatto_Laser_HQYAmI.jpeg',
		)
	})

	it('resolveInlineImageUrlForSection prefers treatment recommendation URL that matches section key', () => {
		const resolved = __test__.resolveInlineImageUrlForSection({
			currentUrl:
				'https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April__1__8AViHV.jpg',
			sectionText: 'Berikut detail harganya ya Kak: Harga IPL Glow',
			messageKeywords: new Set(['ipl', 'glow', '199rb']),
			selectedKnowledge: [
				{
					type: 'source',
					title: 'Treatment Recommendation',
					content: [
						'## IPL Glow https://files.cekat.ai/IPL_Glow_-_Flash_sale_QlMdWS.png',
						'## Hair Removal https://files.cekat.ai/Hair_removal_3x_-_flash_sale_JPRFwA.png',
					].join('\n'),
					score: 4,
				},
			],
			toolRuns: [],
		})

		expect(resolved).toBe(
			'https://files.cekat.ai/IPL_Glow_-_Flash_sale_QlMdWS.png',
		)
	})

	it('resolveMappedImageUrlByKeywords prefers specific treatment URL over generic poster URL', () => {
		const resolved = __test__.resolveMappedImageUrlByKeywords({
			knowledge: [
				{
					type: 'source',
					title: 'General Promo',
					content:
						'![Harga IPL Glow](https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April__1__8AViHV.jpg)',
					score: 6,
				},
				{
					type: 'source',
					title: 'Treatment Recommendation',
					content:
						'## IPL Glow https://files.cekat.ai/IPL_Glow_-_Flash_sale_QlMdWS.png',
					score: 4,
				},
			],
			keywords: new Set(['ipl', 'glow']),
		})

		expect(resolved).toBe(
			'https://files.cekat.ai/IPL_Glow_-_Flash_sale_QlMdWS.png',
		)
	})

	it('resolveMappedImageUrlByKeywords parses HTML knowledge content and maps IPL Glow correctly', () => {
		const resolved = __test__.resolveMappedImageUrlByKeywords({
			knowledge: [
				{
					type: 'source',
					title: 'Treatment Recommendation',
					content: [
						'<p><strong>IPL Glow: https://files.cekat.ai/IPL_Glow_-_Flash_sale_QlMdWS.png</strong></p>',
						'<p><strong>Before After: https://files.cekat.ai/IPL_Glow_eyn3Vc.png</strong></p>',
						'<p><strong>Promo Skin: https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April__1__8AViHV.jpg</strong></p>',
					].join(''),
					score: 5,
				},
			],
			keywords: new Set(['ipl', 'glow', '199rb']),
		})

		expect(resolved).toBe(
			'https://files.cekat.ai/IPL_Glow_-_Flash_sale_QlMdWS.png',
		)
	})

	it('normalizeInlineImageTargetsForResponse replaces non-price inline image with price image', () => {
		const normalized = __test__.normalizeInlineImageTargetsForResponse({
			content: [
				'Untuk Rejuran Shine Dermabooster, saat ini harganya Rp 749.000 ya Kak.',
				'Berikut detail harganya ya Kak:',
				'https://files.cekat.ai/Rejuran_Shine_visual.jpg',
			].join('\n'),
			message: 'harga rejuran shine dermabooster berapa ya?',
			history: [],
			selectedKnowledge: [
				{
					type: 'source',
					title: 'Treatment Recommendation',
					content: [
						'## Rejuran Shine Dermabooster https://files.cekat.ai/Rejuran_Shine_visual.jpg',
						'## Harga Rejuran Shine Dermabooster https://files.cekat.ai/Rejuran_Shine_flash_sale_749rb.jpg',
					].join('\n'),
					score: 5,
				},
			],
			toolRuns: [],
		})

		expect(normalized).toContain(
			'https://files.cekat.ai/Rejuran_Shine_flash_sale_749rb.jpg',
		)
		expect(normalized).not.toContain(
			'https://files.cekat.ai/Rejuran_Shine_visual.jpg',
		)
	})

	it('normalizeInlineImageTargetsForResponse drops non-price inline image when no price image exists', () => {
		const normalized = __test__.normalizeInlineImageTargetsForResponse({
			content: [
				'Untuk Rejuran Shine Dermabooster, saat ini harganya Rp 749.000 ya Kak.',
				'Berikut detail harganya ya Kak:',
				'https://files.cekat.ai/Rejuran_Shine_visual.jpg',
			].join('\n'),
			message: 'harga rejuran shine dermabooster berapa ya?',
			history: [],
			selectedKnowledge: [
				{
					type: 'source',
					title: 'Treatment Knowledge',
					content:
						'## Rejuran Shine Dermabooster https://files.cekat.ai/Rejuran_Shine_visual.jpg',
					score: 5,
				},
			],
			toolRuns: [],
		})

		expect(normalized).toContain('Berikut detail harganya ya Kak:')
		expect(normalized).not.toContain('https://files.cekat.ai/Rejuran_Shine_visual.jpg')
	})

	it('normalizeInlineImageTargetsForResponse replaces unknown price URL with known knowledge URL', () => {
		const normalized = __test__.normalizeInlineImageTargetsForResponse({
			content: [
				'Untuk PRP Face, saat ini harganya Rp 699.000 ya Kak.',
				'Berikut detail harganya ya Kak:',
				'https://files.cekat.ai/PRP_Harga.png',
			].join('\n'),
			message: 'Halo SOZO, saya tertarik promo PRP 699rb',
			history: [],
			selectedKnowledge: [
				{
					type: 'source',
					title: 'Treatment Recommendation',
					content:
						'PRP Face: https://files.cekat.ai/PRP_Face_-_flash_sale_X33agE.png',
					score: 8,
				},
			],
			toolRuns: [],
		})

		expect(normalized).toContain(
			'https://files.cekat.ai/PRP_Face_-_flash_sale_X33agE.png',
		)
		expect(normalized).not.toContain('https://files.cekat.ai/PRP_Harga.png')
	})

	it('stripInlineImageTokensFromText removes markdown and plain image URLs from response text', () => {
		const cleaned = __test__.stripInlineImageTokensFromText(
			[
				'Berikut detail harganya ya Kak:',
				'![Harga IPL Glow](https://files.example.com/ipl_glow.jpg)',
				'✨ Skin Treatment https://files.example.com/skin.jpg',
			].join('\n'),
		)

		expect(cleaned).toContain('Berikut detail harganya ya Kak:')
		expect(cleaned).toContain('✨ Skin Treatment')
		expect(cleaned).not.toContain('files.example.com')
		expect(cleaned).not.toContain('![Harga IPL Glow]')
	})

	it('splitInlineContentSegments preserves text-image ordering for promo list', () => {
		const segments = __test__.splitInlineContentSegments(
			[
				'✨ Acne & Bekas Jerawat',
				'https://files.example.com/acne.jpg',
				'✨ Skin Treatment',
				'https://files.example.com/skin.jpg',
			].join('\n'),
		)

		expect(segments).toEqual([
			{ type: 'text', content: '✨ Acne & Bekas Jerawat' },
			{ type: 'image', url: 'https://files.example.com/acne.jpg' },
			{ type: 'text', content: '✨ Skin Treatment' },
			{ type: 'image', url: 'https://files.example.com/skin.jpg' },
		])
	})

	it('splitInlineContentSegments treats files.cekat.ai URL without extension as image', () => {
		const segments = __test__.splitInlineContentSegments(
			[
				'✨ Skin Treatment',
				'https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April_G2elX',
			].join('\n'),
		)

		expect(segments).toEqual([
			{ type: 'text', content: '✨ Skin Treatment' },
			{
				type: 'image',
				url: 'https://files.cekat.ai/__APR_26___Flashsale_New_User_Area_1_-_General___Tiktok_Skin_1-15_April_G2elX',
			},
		])
	})

	it('isServiceCatalogIntent detects layanan query correctly', () => {
		expect(__test__.isServiceCatalogIntent('Ada layanan apa saja ya?')).toBe(true)
		expect(__test__.isServiceCatalogIntent('lokasi cabang di mana?')).toBe(false)
	})

	it('hasStructuredServiceCatalog validates category-rich response', () => {
		const structured = [
			'Perawatan Wajah',
			'• Facial',
			'• Acne Laser Facial',
			'Perawatan Tubuh',
			'• Body Whitening Peel',
			'Perawatan Rambut',
			'• PRP Hair',
			'Boleh tahu concern Kakak agar aku rekomendasikan yang paling cocok?',
		].join('\n')
		expect(__test__.hasStructuredServiceCatalog(structured)).toBe(true)
		expect(__test__.hasStructuredServiceCatalog('Kami punya berbagai treatment.')).toBe(
			false,
		)
	})

	it('buildServiceCatalogResponse generates category-based service listing from knowledge', () => {
		const content = __test__.buildServiceCatalogResponse({
			chatbot: {
				id: 'cb-1',
				app_id: 'app-1',
				name: 'SOPHIA',
				model: 'gpt-4o-mini',
				prompt: null,
				welcome_msg: null,
				agent_transfer: null,
				temperature: 0.2,
				history_limit: 50,
				context_limit: 50,
				max_file_read_window: 3,
				message_limit: 1000,
				session_only_memory: false,
				timezone: 'Asia/Jakarta',
				label_condition: null,
				selected_labels: [],
				app_data: null,
				ai_followups: [],
				plugin_data: null,
			},
			knowledgeSources: [
				{
					title: 'Treatment Knowledge',
					content: [
						'Glass Skin Facial',
						'SOZO Signature Facial',
						'IPL Acne',
						'Meso Acne',
						'Body Spot Repair',
						'Body Whitening Peel',
						'PRP Hair',
						'Biolight Hair',
					].join('\n'),
				},
			],
		})

		expect(content).toContain('Perawatan Wajah')
		expect(content).toContain('Perawatan Tubuh')
		expect(content).toContain('Perawatan Rambut')
		expect(content).toContain('Glass Skin Facial')
		expect(content).toContain('Body Whitening Peel')
		expect(content).toContain('PRP Hair')
	})
})

describe('ChatbotSimulationService telemetry and RTK helpers', () => {
	it('parses provider usage payload when available', () => {
		const usage = __test__.parseUsageFromProviderPayload({
			usage: {
				prompt_tokens: 120,
				completion_tokens: 80,
				total_tokens: 200,
			},
		})

		expect(usage).toEqual({
			prompt_tokens: 120,
			completion_tokens: 80,
			total_tokens: 200,
		})
	})

	it('falls back to estimator usage when provider usage is missing', () => {
		const estimated = __test__.estimateUsageFromMessages({
			messages: [
				{ role: 'system', content: 'Instruksi' },
				{ role: 'user', content: 'Halo, ada promo?' },
			],
			completionText: '',
		})

		const resolved = __test__.resolveUsageWithFallback({
			payload: { choices: [{ message: { content: 'Hai kak!' } }] },
			estimatedUsage: estimated,
			completionText: 'Hai kak!',
		})

		expect(resolved.prompt_tokens).toBeGreaterThan(0)
		expect(resolved.completion_tokens).toBeGreaterThan(0)
		expect(resolved.total_tokens).toBe(
			resolved.prompt_tokens + resolved.completion_tokens,
		)
	})

	it('enforces RTK compression limits and dedupe behavior', () => {
		const items = Array.from({ length: 10 }).map((_, index) => ({
			type: index % 2 === 0 ? 'faq' : 'source',
			id: `k-${index % 5}`,
			title: `Knowledge ${index % 5}`,
			content: `Konten knowledge ${index} ${'x'.repeat(500)}`,
			score: 100 - index,
			keywordScore: 4,
			vectorScore: 0.5,
		}))

		const compressed = __test__.compressKnowledgeWithRTK({
			items,
			contextLimit: 3,
			mode: 'simulate',
		})

		expect(compressed.items.length).toBeLessThanOrEqual(3)
		expect(compressed.summary.before_count).toBe(10)
		expect(compressed.summary.after_count).toBe(compressed.items.length)
		expect(compressed.summary.deduped_count).toBeGreaterThanOrEqual(0)
	})

	it('filters out low-relevance knowledge so behavior prompt is not drowned', () => {
		const filtered = __test__.filterKnowledgeByRelevance([
			{
				type: 'faq',
				id: 'low-1',
				title: 'General info',
				content: 'Informasi umum tanpa relevansi.',
				score: 0.2,
				keywordScore: 0,
				vectorScore: 0.01,
			},
			{
				type: 'source',
				id: 'high-1',
				title: 'Promo IPL Acne',
				content: 'Promo IPL Acne 199rb khusus member baru.',
				score: 9.5,
				keywordScore: 2,
				vectorScore: 0.42,
			},
		])

		expect(filtered.map((item: any) => item.id)).toEqual(['high-1'])
	})

	it('sanitizes leaked template artifacts from assistant content', () => {
		const raw = [
			'Berdasarkan knowledge "Informasi Umum", berikut informasinya:',
			'https://files.cekat.ai/files/sample.pdf',
			'## RESPONSE TEMPLATES & OBJECTION HANDLING',
			'Concern Identification (Indonesian): Untuk concern ini ada beberapa treatment.',
			'✨ [Treatment A] -> [benefit] ✨ [Treatment B] -> [benefit]',
			'Uncertain Customer (Indonesian): Kalau masih bingung, coba konsultasi.',
			'Lagi ada promo hemat juga! Konsultasi awal gratis.',
		].join('\n')

		expect(__test__.hasMainResponseLeakage(raw)).toBe(true)
		const sanitized = __test__.sanitizeAssistantResponseForDelivery(raw)

		expect(sanitized).not.toContain('Berdasarkan knowledge')
		expect(sanitized).not.toContain('RESPONSE TEMPLATES')
		expect(sanitized).not.toContain('[Treatment A]')
		expect(sanitized).not.toContain('Uncertain Customer')
		expect(sanitized).not.toContain('files.cekat.ai/files/sample.pdf')
		expect(sanitized).toContain('Lagi ada promo hemat juga!')
	})

	it('serializes knowledge references and maps usage costs from tokens', () => {
		const refs = __test__.serializeKnowledgeReferences([
			{
				type: 'faq',
				id: 'faq-1',
				title: 'Harga treatment',
				content: 'Promo treatment dimulai dari 99rb untuk pelanggan baru.',
				score: 12.345678,
				keywordScore: 3,
				vectorScore: 0.7,
			},
		])
		const costs = __test__.mapUsageCostFromTokens(345)

		expect(refs).toEqual([
			{
				type: 'faq',
				id: 'faq-1',
				title: 'Harga treatment',
				score: 12.345678,
				excerpt: 'Promo treatment dimulai dari 99rb untuk pelanggan baru.',
			},
		])
		expect(costs).toEqual({
			credits: 345,
			usd: 345,
			idr: 345,
		})
	})
})
