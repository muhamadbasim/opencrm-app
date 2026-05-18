import { Elysia } from 'elysia'

import { pakasirWebhook } from './pakasir'

export const webhooks = new Elysia({ prefix: '/webhooks' })
	.use(pakasirWebhook)
