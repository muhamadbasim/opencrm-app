# Root Dockerfile keeps frontend image compatibility.
# Preferred production images are:
# - apps/backend/Dockerfile
# - apps/frontend/Dockerfile
FROM oven/bun:1.2.15-alpine AS deps
WORKDIR /app

COPY bun.lock package.json tsconfig.json bunfig.toml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY apps/frontend apps/frontend
COPY apps/backend apps/backend
RUN cd apps/frontend && bun run build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
	CMD wget -q -O- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
