import { describe, expect, it } from 'bun:test'
import { __contactDetailInternals } from '../src/modules/conversation/service'

describe('conversation contact-detail helpers', () => {
	it('uses heuristic summary when context summary is unavailable', () => {
		const summary = __contactDetailInternals.buildHeuristicSummary({
			intent: 'Tanya Stok → Closing',
			latestCustomerMessage: 'Kak stok warna mocha masih ada?',
			repeatOrders: 3,
			lifetimeValue: 12_400_000,
			openCart: {
				grand_total: 2_850_000,
				items: [
					{
						product_name: 'Almari Kayu Jati Mocha',
						quantity: 1,
					},
				],
			},
		})

		expect(summary).toContain('Intent terbaru mengarah ke Tanya Stok → Closing.')
		expect(summary).toContain('Almari Kayu Jati Mocha')
		expect(summary).toContain('Rekomendasi: dorong checkout dan kirim link pembayaran.')
	})

	it('maps buying stage from open cart journey phase', () => {
		expect(
			__contactDetailInternals.resolveBuyingStageSignal({ journey_phase: 'cart' }),
		).toEqual({
			value: 'Add to Cart',
			tone: 'success',
		})

		expect(
			__contactDetailInternals.resolveBuyingStageSignal({ journey_phase: 'paid' }),
		).toEqual({
			value: 'Purchased',
			tone: 'success',
		})
	})

	it('uses commerce stage for intent and positive sentiment', () => {
		const commerceStage =
			__contactDetailInternals.resolveCommerceJourneyFromSummary({
				openCart: { journey_phase: 'payment_pending' },
				orderHistory: [],
			})

		expect(
			__contactDetailInternals.resolveIntentSignal('order_intent', commerceStage),
		).toEqual({
			value: 'Waiting Payment',
			tone: 'warning',
		})
		expect(
			__contactDetailInternals.resolveCommerceSentimentSignal(
				{ value: 'Netral', tone: 'info' },
				commerceStage,
			),
		).toEqual({
			value: 'Positif',
			tone: 'success',
		})
	})

	it('maps raw decision intents to clearer live labels', () => {
		expect(__contactDetailInternals.resolveIntentSignal('product_lookup')).toEqual({
			value: 'Tanya Produk',
			tone: 'info',
		})
		expect(__contactDetailInternals.resolveIntentSignal('inquiry_general')).toEqual({
			value: 'Tanya Informasi',
			tone: 'info',
		})
		expect(__contactDetailInternals.resolveIntentSignal('order_intent')).toEqual({
			value: 'Add to Cart',
			tone: 'success',
		})
	})

	it('keeps explicit negative sentiment even when commerce stage exists', () => {
		expect(
			__contactDetailInternals.resolveCommerceSentimentSignal(
				{ value: 'Negatif', tone: 'warning' },
				'checkout',
			),
		).toEqual({
			value: 'Negatif',
			tone: 'warning',
		})
	})

	it('derives sentiment trend from latest six customer messages', () => {
		const sentiment = __contactDetailInternals.resolveSentimentSignal([
			{ content: 'Saya kecewa, responsnya lama.' },
			{ content: 'Pengiriman lambat sekali.' },
			{ content: 'Masih jelek follow up nya.' },
			{ content: 'Ok, sekarang sudah bagus.' },
			{ content: 'Makasih, siap lanjut.' },
			{ content: 'Deal, terima kasih ya.' },
		])

		expect(sentiment.value).toBe('Negatif → Positif')
		expect(sentiment.tone).toBe('success')
	})

	it('scores churn risk low for active repeat customer', () => {
		const churn = __contactDetailInternals.resolveChurnRiskSignal({
			lastCustomerMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
			hasOpenCart: true,
			repeatOrders: 4,
			lifetimeValue: 15_000_000,
			conversationStatus: 'open',
		})

		expect(churn.percent).toBeLessThanOrEqual(25)
		expect(churn.value.startsWith('Rendah')).toBe(true)
	})

	it('scores churn risk high for stale non-repeat customer', () => {
		const churn = __contactDetailInternals.resolveChurnRiskSignal({
			lastCustomerMessageAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
			hasOpenCart: false,
			repeatOrders: 0,
			lifetimeValue: 0,
			conversationStatus: 'resolved',
		})

		expect(churn.percent).toBeGreaterThanOrEqual(60)
		expect(churn.value.startsWith('Tinggi')).toBe(true)
	})
})
