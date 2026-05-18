export type AppRole = 'admin' | 'owner' | 'supervisor' | 'agent' | string

export function normalizeAppRole(role: string | null | undefined): string {
	const normalized = String(role || '')
		.trim()
		.toLowerCase()
	return normalized
}

type AnyRecord = Record<string, unknown> | null | undefined

export function extractNormalizedRole(source: AnyRecord): string {
	if (!source || typeof source !== 'object') return ''

	const roleCandidates: unknown[] = [
		source.role,
		source.app_role,
		source.appRole,
		source.user_role,
		source.userRole,
		source.organizationRole,
		source.memberRole,
		(source.metadata as AnyRecord)?.role,
		(source.user as AnyRecord)?.role,
		((source.user as AnyRecord)?.metadata as AnyRecord)?.role,
	]

	for (const candidate of roleCandidates) {
		if (typeof candidate !== 'string') continue
		const normalized = normalizeAppRole(candidate)
		if (normalized) return normalized
	}

	return ''
}

/**
 * Returns null when unrestricted, otherwise returns exact allowed top-level paths.
 */
export function getAllowedPrimaryPathsForRole(
	role: string | null | undefined,
): string[] | null {
	const normalizedRole = normalizeAppRole(role)

	if (normalizedRole === 'agent') {
		return ['/dashboard', '/chat', '/channels/whatsapp']
	}

	if (normalizedRole === 'supervisor') {
		return [
			'/dashboard',
			'/chat',
			'/team',
			'/channels/whatsapp',
			'/orders',
			'/products',
			'/product-stock',
			'/ai-agents',
			'/settings',
		]
	}

	return null
}

export function isPathAllowedForRole(
	pathname: string,
	role: string | null | undefined,
): boolean {
	const allowedPaths = getAllowedPrimaryPathsForRole(role)
	if (!allowedPaths) return true

	return allowedPaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	)
}
