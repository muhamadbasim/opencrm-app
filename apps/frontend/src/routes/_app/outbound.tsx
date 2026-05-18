import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/outbound')({
	beforeLoad: () => {
		throw redirect({
			to: '/broadcast',
		})
	},
})
