import { describe, expect, it, vi } from 'bun:test'

vi.mock('../src/lib/prisma', () => ({
	default: {},
}))
vi.mock('../src/modules/knowledge/indexing-service', () => ({
	KnowledgeIndexService: {},
}))
vi.mock('../src/modules/ai/service', () => ({
	AIService: {},
}))

const { __test__ } = await import('../src/modules/knowledge/service')

describe('KnowledgeService helpers', () => {
	it('normalizes source format aliases and mime fallbacks', () => {
		expect(__test__.normalizeSourceFormat('md', null, null)).toBe('markdown')
		expect(__test__.normalizeSourceFormat('img', null, null)).toBe('image')
		expect(__test__.normalizeSourceFormat('url', null, null)).toBe('website')
		expect(
			__test__.normalizeSourceFormat(null, null, 'application/msword'),
		).toBe('docx')
		expect(__test__.normalizeSourceFormat(null, null, 'audio/mpeg')).toBe(
			'audio',
		)
	})

	it('normalizes lifecycle status values', () => {
		expect(__test__.normalizeSourceStatus('processing')).toBe('embedding')
		expect(__test__.normalizeSourceStatus('error')).toBe('failed')
		expect(__test__.normalizeSourceStatus('READY')).toBe('ready')
		expect(__test__.normalizeSourceStatus('unknown')).toBe('pending')
	})

	it('deduplicates selected source ids', () => {
		const ids = __test__.toStrictUuidArray([
			'11111111-1111-4111-8111-111111111111',
			' 11111111-1111-4111-8111-111111111111 ',
			'22222222-2222-4222-8222-222222222222',
			'not-a-uuid',
			null,
			'',
		])
		expect(ids).toEqual([
			'11111111-1111-4111-8111-111111111111',
			'22222222-2222-4222-8222-222222222222',
		])
	})

	it('formats byte size and vector literal consistently', () => {
		expect(__test__.formatBytes(1024)).toBe('1.00 KB')
		expect(__test__.toVectorLiteral([1, 2.345678912, Number.NaN])).toBe(
			'[1,2.34567891,0]',
		)
	})
})
