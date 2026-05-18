import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { syncOrganizationContextFromSession } from '@/lib/organization'

export const Route = createFileRoute('/login')({
	component: LoginPage,
})

const AUTH_BASE = import.meta.env.VITE_API_URL
	? `${import.meta.env.VITE_API_URL}/auth`
	: 'http://localhost:3010/auth'

function LoginPage() {
	const navigate = useNavigate()

	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault()
		setLoading(true)
		setError('')

		try {
			const response = await fetch(`${AUTH_BASE}/sign-in/email`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ email, password }),
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Login failed')
			}

			const data = await response.json()
			if (data?.token) {
				localStorage.setItem('scalechat_token', data.token)
			}

			localStorage.setItem('scalechat_user', JSON.stringify(data.user))

			try {
				const context = await syncOrganizationContextFromSession()
				navigate({
					to:
						context.onboardingRequired || !context.organization
							? '/onboarding'
							: '/dashboard',
					replace: true,
				})
			} catch {
				navigate({ to: '/dashboard', replace: true })
			}
		} catch (err: any) {
			setError(err.message || 'Login failed')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/5">
			<div className="mx-auto w-full max-w-md space-y-8 px-4 py-12 sm:px-6 lg:px-8">
				<div className="flex flex-col gap-6">
					<div className="flex flex-col items-center gap-2 text-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white shadow-md">
							<span className="text-2xl font-bold">🚀</span>
						</div>
						<div>
							<h1 className="text-2xl font-bold text-gray-900">OpenCRM</h1>
							<p className="text-sm text-gray-500">
								WhatsApp Messaging Platform
							</p>
						</div>
					</div>

					<div className="space-y-6" data-auth-content="true">
						<div className="text-card-foreground rounded-xl bg-card/50 p-8 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl">
							<form onSubmit={handleLogin} className="flex flex-col gap-6">
								<FieldGroup>
									<div className="flex flex-col items-center gap-1 text-center">
										<h1 className="text-2xl font-bold">Welcome Back</h1>
										<p className="text-muted-foreground text-sm text-balance">
											Enter your email and password to continue
										</p>
									</div>

									<Field>
										<FieldLabel htmlFor="email">Email</FieldLabel>
										<Input
											id="email"
											type="email"
											placeholder="m@example.com"
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											required
											className="bg-background"
										/>
									</Field>

									<Field>
										<div className="flex items-center justify-between">
											<FieldLabel htmlFor="password">Password</FieldLabel>
											<a
												href="/"
												className="text-muted-foreground text-sm font-medium hover:underline"
											>
												Forgot password?
											</a>
										</div>
										<Input
											id="password"
											type="password"
											placeholder="Password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											required
											className="bg-background"
										/>
									</Field>

									{error && (
										<Field>
											<Alert variant="destructive">
												<AlertDescription>{error}</AlertDescription>
											</Alert>
										</Field>
									)}

									<Field>
										<Button
											type="submit"
											disabled={loading}
											size="lg"
											className="w-full"
										>
											{loading ? 'Logging in...' : 'Login'}
										</Button>
									</Field>

									<Field>
										<FieldDescription className="rounded-md border border-amber-200/50 bg-amber-50/50 px-3 py-2 text-center text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
											💡 Login issues? Try Ctrl+Shift+R (hard refresh) or clear
											browser cache/storage.
										</FieldDescription>
									</Field>
								</FieldGroup>
							</form>
						</div>
					</div>

					<div className="flex flex-col space-y-4 text-center">
						<p className="text-muted-foreground px-8 text-xs">
							By logging in, you agree to our{' '}
							<Link
								className="hover:text-primary transition-all underline underline-offset-4"
								to="/terms"
							>
								Terms of Service
							</Link>{' '}
							and{' '}
							<Link
								className="hover:text-primary transition-all underline underline-offset-4"
								to="/privacy"
							>
								Privacy Policy
							</Link>
						</p>
					</div>

					<div className="text-center text-xs text-gray-500">
						<p>
							Don't have an account?{' '}
							<Link
								to="/register"
								className="text-gray-900 hover:underline font-medium"
							>
								Sign up
							</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
