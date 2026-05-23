import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const isTunnelHmrEnabled = process.env.ENABLE_TUNNEL_HMR === 'true'
const tunnelFeHost = process.env.TUNNEL_FE_HOST || 'local-fe.scalebiz.chat'
const rawApiUrl = process.env.VITE_API_URL || 'http://localhost:3010'
const forceOptimizeDeps = process.env.VITE_FORCE_OPTIMIZE_DEPS === 'true'

function resolveApiProxyTarget(input: string) {
	try {
		const url = new URL(input)
		const normalizedPath = url.pathname.replace(/\/+$/, '')
		const pathWithoutApi =
			normalizedPath === '/api'
				? ''
				: normalizedPath.endsWith('/api')
					? normalizedPath.slice(0, -4)
					: normalizedPath

		return `${url.origin}${pathWithoutApi}`
	} catch {
		return input.replace(/\/api\/?$/, '')
	}
}

const apiProxyTarget = resolveApiProxyTarget(rawApiUrl)

export default defineConfig({
	optimizeDeps: {
		include: ['react', 'react-dom'],
		force: forceOptimizeDeps,
	},
	// @ts-ignore
	plugins: [
		devtools(),
		nitro({
			preset: 'node',
			devServer: {
				port: 42070,
			},
			devProxy: {
				'/api/**': apiProxyTarget,
				'/auth/**': apiProxyTarget,
			},
			routeRules: {
				'/api/**': {
					proxy: `${apiProxyTarget}/api/**`,
				},
				'/auth/**': {
					proxy: `${apiProxyTarget}/auth/**`,
				},
			},
			prerender: {
				routes: [],
			},
		}),
		viteTsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
	ssr: {
		noExternal: ['@tanstack/react-router', '@tanstack/react-start'],
		external: ['react', 'react-dom'],
	},
	server: {
		host: true,
		allowedHosts: true,
		proxy: {
			'/api': {
				target: apiProxyTarget,
				changeOrigin: true,
				secure: false,
			},
			'/auth': {
				target: apiProxyTarget,
				changeOrigin: true,
				secure: false,
			},
		},
		...(isTunnelHmrEnabled
			? {
					hmr: {
						protocol: 'wss',
						host: tunnelFeHost,
						clientPort: 443,
					},
				}
			: {}),
	},
	build: {
		chunkSizeWarningLimit: 1000,
	},
})
