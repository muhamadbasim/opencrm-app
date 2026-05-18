import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
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

export const Route = createFileRoute('/register')({
	component: RegisterPage,
})

const AUTH_BASE = import.meta.env.VITE_API_URL
	? `${import.meta.env.VITE_API_URL}/auth`
	: 'http://localhost:3010/auth'

function RegisterPage() {
	const navigate = useNavigate()
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)

	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')

	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError('')

		if (password !== confirmPassword) {
			setError('Passwords do not match')
			return
		}
		if (password.length < 8) {
			setError('Password must be at least 8 characters')
			return
		}

		setLoading(true)

		try {
			const signupResponse = await fetch(`${AUTH_BASE}/sign-up/email`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ email, password, name }),
			})

			if (!signupResponse.ok) {
				const errorData = await signupResponse.json()
				throw new Error(errorData.error || 'Registration failed')
			}

			const signupData = await signupResponse.json()
			if (signupData?.token) {
				localStorage.setItem('scalechat_token', signupData.token)
			}

			localStorage.setItem(
				'scalechat_user',
				JSON.stringify({ id: signupData.user?.id, name, email }),
			)

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
				navigate({ to: '/onboarding', replace: true })
			}
		} catch (err: any) {
			setError(err.message || 'Registration failed')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/5">
			<div className="mx-auto w-full max-w-md space-y-8 px-4 py-12 sm:px-6 lg:px-8">
				<div className="flex flex-col items-center justify-center space-y-3">
					<div className="text-center">
						<h1 className="text-2xl font-bold tracking-tight">OpenCRM</h1>
						<p className="text-muted-foreground mt-1 text-sm">
							WhatsApp Messaging Platform
						</p>
					</div>
				</div>

				<div className="space-y-6" data-auth-content="true">
					<div className="text-card-foreground rounded-xl border border-border/50 bg-card/50 p-5 sm:p-8 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl">
						<form onSubmit={handleSubmit} className="flex flex-col gap-6">
							<FieldGroup>
								<div className="flex flex-col gap-1 text-center">
									<h1 className="text-2xl font-bold tracking-tight">
										Create New Account
									</h1>
									<p className="text-muted-foreground text-sm text-balance">
										Create your account to get started.
									</p>
								</div>

								{error && (
									<Field>
										<Alert variant="destructive">
											<AlertDescription>{error}</AlertDescription>
										</Alert>
									</Field>
								)}

								<Field>
									<FieldLabel htmlFor="name">Full Name</FieldLabel>
									<Input id="name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} required className="bg-background" />
								</Field>
								<Field>
									<FieldLabel htmlFor="email">Email</FieldLabel>
									<Input id="email" type="email" placeholder="m@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background" />
								</Field>
								<Field>
									<FieldLabel htmlFor="password">Password</FieldLabel>
									<div className="relative">
										<Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Minimum 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required className="bg-background pr-10" />
										<Button type="button" variant="ghost" size="icon-sm" className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>
											{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
										</Button>
									</div>
									<FieldDescription>Must be at least 8 characters long.</FieldDescription>
								</Field>
								<Field>
									<FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
									<div className="relative">
										<Input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="bg-background pr-10" />
										<Button type="button" variant="ghost" size="icon-sm" className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
											{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
										</Button>
									</div>
								</Field>

								<Field>
									<Button type="submit" disabled={loading} size="lg" className="w-full">
										{loading ? 'Please wait...' : 'Create Account'}
									</Button>
								</Field>
							</FieldGroup>
						</form>
					</div>

					<div className="flex flex-col space-y-4 text-center">
						<p className="text-muted-foreground text-sm">
							Already have an account?{' '}
							<Link to="/login" className="font-semibold text-primary hover:underline">Login here</Link>
						</p>
						<p className="text-muted-foreground px-8 text-xs">
							By registering, you agree to our{' '}
							<Link to="/terms" className="hover:text-primary underline underline-offset-4">Terms of Service</Link>{' '}
							and{' '}
							<Link to="/privacy" className="hover:text-primary underline underline-offset-4">Privacy Policy</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
