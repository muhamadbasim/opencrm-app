import { beforeEach, describe, expect, it, vi } from 'bun:test'

const mockChatbotFindFirst = vi.fn()
const mockPersonaFindFirst = vi.fn()
const mockAppFindFirst = vi.fn()
const mockSimulateResponse = vi.fn()

vi.mock('../src/lib/prisma', () => ({
	default: {
		apps: {
			findFirst: mockAppFindFirst,
		},
		chatbots: {
			findFirst: mockChatbotFindFirst,
		},
		ai_playground_personas: {
			findFirst: mockPersonaFindFirst,
		},
	},
}))

vi.mock('../src/modules/chatbot/simulation-service', () => ({
	ChatbotSimulationService: {
		simulateResponse: mockSimulateResponse,
	},
}))

vi.mock('../src/modules/knowledge/indexing-service', () => ({
	KnowledgeIndexService: {},
}))

const { ChatbotService } = await import('../src/modules/chatbot/service')

describe('ChatbotService', () => {
	const APP_ID = '6aa3b21b-25b9-4573-9f33-3a4dcd5ec3c3'
	const PERSONA_ID = '5098190b-82f1-4648-9366-4a9cb866d1b4'

	beforeEach(() => {
		vi.resetAllMocks()
		mockSimulateResponse.mockResolvedValue({
			content: 'Halo Kak, saya bantu ya.',
			meta: {},
			preview: {},
		})
	})

	it('uses an AI persona as the agent when no chatbot row exists', async () => {
		mockChatbotFindFirst.mockResolvedValue(null)
		mockPersonaFindFirst.mockResolvedValue({
			id: PERSONA_ID,
			app_id: APP_ID,
			persona_key: 'sales-closer-rina',
			label: 'AI Sales Rina (Closer)',
			system_instruction: 'Use Rina sales closer behavior.',
		})

		await ChatbotService.generateAgentReply(PERSONA_ID, APP_ID, {
			message: 'Halo',
			history: [],
			runTools: false,
			mode: 'live',
			entrypoint: 'flow_runtime',
			conversationId: '7000f1e9-5e19-4607-9051-820721d6bbbf',
			sourceMessageIds: ['e7ea88b6-f3fc-4a36-9d7a-2c04472baacd'],
			allowAllKnowledge: true,
		})

		expect(mockPersonaFindFirst).toHaveBeenCalledWith({
			where: {
				id: PERSONA_ID,
				app_id: APP_ID,
			},
			select: {
				id: true,
				app_id: true,
				persona_key: true,
				label: true,
				system_instruction: true,
			},
		})
		expect(mockSimulateResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				appId: APP_ID,
				message: 'Halo',
				mode: 'live',
				entrypoint: 'flow_runtime',
				allowAllKnowledge: true,
				chatbot: expect.objectContaining({
					id: PERSONA_ID,
					app_id: APP_ID,
					name: 'AI Sales Rina (Closer)',
					prompt: 'Use Rina sales closer behavior.',
					app_data: expect.objectContaining({
						agent_kind: 'ai_persona',
						persona_key: 'sales-closer-rina',
					}),
				}),
			}),
		)
	})
})
