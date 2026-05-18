import { afterEach, describe, expect, it, vi } from 'bun:test'

vi.mock('../src/lib/prisma', () => ({
	default: {},
}))
vi.mock('../src/lib/redis', () => ({
	default: {},
}))

const { __test__ } = await import('../src/modules/api-tools/service')

const ORIGINAL_N8N_BASE_URL = process.env.N8N_BASE_URL

afterEach(() => {
	if (ORIGINAL_N8N_BASE_URL === undefined) {
		delete process.env.N8N_BASE_URL
		return
	}
	process.env.N8N_BASE_URL = ORIGINAL_N8N_BASE_URL
})

describe('APIToolsService webhook mapping', () => {
	it('keeps original URL when N8N_BASE_URL is missing', () => {
		delete process.env.N8N_BASE_URL
		const url = __test__.resolveWorkflowWebhookForEnvironment(
			'https://workflows.scalebiz.ai/webhook/get-location-branch',
		)
		expect(url).toBe('https://workflows.scalebiz.ai/webhook/get-location-branch')
	})

	it('maps workflows host to N8N_BASE_URL host for webhook path', () => {
		process.env.N8N_BASE_URL = 'https://local-n8n.scalebiz.chat'
		const url = __test__.resolveWorkflowWebhookForEnvironment(
			'https://workflows.scalebiz.ai/webhook/get-location-branch',
		)
		expect(url).toBe('https://local-n8n.scalebiz.chat/webhook/get-location-branch')
	})

	it('does not rewrite non-workflow hosts', () => {
		process.env.N8N_BASE_URL = 'https://local-n8n.scalebiz.chat'
		const url = __test__.resolveWorkflowWebhookForEnvironment(
			'https://script.google.com/macros/s/abc/exec',
		)
		expect(url).toBe('https://script.google.com/macros/s/abc/exec')
	})
})

