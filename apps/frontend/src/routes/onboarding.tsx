import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
	completeOrganizationOnboarding,
	syncOrganizationContextFromSession,
} from '@/lib/organization'

export const Route = createFileRoute('/onboarding')({
	component: OnboardingPage,
})

function slugify(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
}

function OnboardingPage() {
	const navigate = useNavigate()
	const [companyName, setCompanyName] = useState('')
	const [slug, setSlug] = useState('')
	const [slugEdited, setSlugEdited] = useState(false)
	const [loading, setLoading] = useState(false)
	const [checking, setChecking] = useState(true)
	const [error, setError] = useState('')

	useEffect(() => {
		let mounted = true

		const bootstrap = async () => {
			try {
				const context = await syncOrganizationContextFromSession()
				if (!mounted) return

				if (!context.authenticated) {
					navigate({ to: '/login', replace: true })
					return
				}

				if (context.organization && !context.onboardingRequired) {
					navigate({ to: '/dashboard', replace: true })
					return
				}
			} catch {
				// Keep onboarding page open, user can still submit.
			} finally {
				if (mounted) setChecking(false)
			}
		}

		bootstrap()
		return () => {
			mounted = false
		}
	}, [navigate])

	const normalizedSlug = useMemo(() => slugify(slug), [slug])

	const handleCompanyNameChange = (value: string) => {
		setCompanyName(value)
		if (!slugEdited) {
			setSlug(slugify(value))
		}
	}

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		setError('')

		const cleanName = companyName.trim()
		const cleanSlug = slugify(slug || companyName)

		if (cleanName.length < 2) {
			setError('Company name must be at least 2 characters')
			return
		}

		if (cleanSlug.length < 3) {
			setError('Slug must be at least 3 characters')
			return
		}

		setLoading(true)
		try {
			await completeOrganizationOnboarding({
				companyName: cleanName,
				slug: cleanSlug,
			})
			navigate({ to: '/dashboard', replace: true })
		} catch (err: any) {
			setError(err?.message || 'Failed to complete onboarding')
		} finally {
			setLoading(false)
		}
	}

	if (checking) return null

	return (
		<div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/5">
			<div className="mx-auto w-full max-w-md space-y-8 px-4 py-12 sm:px-6 lg:px-8">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight">Set Up Workspace</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Set your company name and workspace slug to continue.
					</p>
				</div>

				<div className="text-card-foreground rounded-xl border border-border/50 bg-card/50 p-5 sm:p-8 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl">
					<form onSubmit={handleSubmit} className="flex flex-col gap-6">
						<FieldGroup>
							{error ? (
								<Field>
									<Alert variant="destructive">
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								</Field>
							) : null}

							<Field>
								<FieldLabel htmlFor="companyName">Company Name</FieldLabel>
								<Input
									id="companyName"
									placeholder="Acme Corp"
									value={companyName}
									onChange={(event) => handleCompanyNameChange(event.target.value)}
									required
									className="bg-background"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="slug">Workspace Slug</FieldLabel>
								<Input
									id="slug"
									placeholder="acme-corp"
									value={slug}
									onChange={(event) => {
										setSlugEdited(true)
										setSlug(event.target.value)
									}}
									required
									className="bg-background"
								/>
								<p className="text-muted-foreground mt-2 text-xs">
									URL slug preview: <strong>{normalizedSlug || '-'}</strong>
								</p>
							</Field>

							<Field>
								<Button type="submit" disabled={loading} size="lg" className="w-full">
									{loading ? 'Saving...' : 'Continue to Dashboard'}
								</Button>
							</Field>
						</FieldGroup>
					</form>
				</div>
			</div>
		</div>
	)
}
