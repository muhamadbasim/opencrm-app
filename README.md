<div align="center">

# OpenCRM

**A WhatsApp-first, omnichannel CRM with an AI chatbot, shared team inbox, built-in commerce, and visual automation flows.**

Manage contacts, conversations, product catalogs, orders, broadcasts, and AI-assisted replies — all from a single realtime workspace.

[Quick Deploy](./DEPLOY-QUICK.md) · [Report an Issue](https://github.com/muhamadbasim/opencrm-app/issues)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Application Modules](#application-modules)
- [API Surface](#api-surface)
- [Frontend Screens](#frontend-screens)
- [Requirements](#requirements)
- [Getting Started (Local)](#getting-started-local)
- [Environment Configuration](#environment-configuration)
- [Database](#database)
- [WhatsApp Integration](#whatsapp-integration)
- [Deployment](#deployment)
- [Available Scripts](#available-scripts)
- [Testing & Linting](#testing--linting)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

OpenCRM is a conversation-centric CRM built around WhatsApp. It lets businesses capture leads, talk to customers, sell products, and automate repetitive replies — without leaving the chat. An AI layer answers customer questions from a curated knowledge base and hands the conversation over to a human agent the moment things get nuanced.

The platform is a **Bun-powered monorepo** with two applications:

- **`apps/backend`** — an [Elysia](https://elysiajs.com) HTTP API, a BullMQ background worker, and a cron scheduler, all sharing one entrypoint and switching behavior via the `APP_MODE` environment variable.
- **`apps/frontend`** — a [React 18](https://react.dev) + [TanStack Start](https://tanstack.com/start) (SSR) workspace UI with realtime inbox updates over Socket.IO.

The API exposes a Swagger/OpenAPI playground at `/docs` and a health probe at `/health` (returns `{"status":"healthy","version":"2.0.0"}`).

## Key Features

| Area | What it does |
|------|--------------|
| **Omnichannel Inbox** | Handle WhatsApp (Baileys + WhatsApp Cloud API / WABA) and Instagram conversations in one realtime inbox. |
| **AI Chatbot & Knowledge Base** | LLM-powered replies grounded in a product knowledge base (RAG with `pgvector` embeddings), with configurable providers, an AI playground, response logging, and evaluations. |
| **Human Handover** | Automatic and manual handover from bot to agent, with assignment rules and handover requests. |
| **Contacts & CRM** | Contacts, custom fields, notes, tags/labels, and a conversation pipeline. |
| **Commerce & Orders** | Product catalog, stock, orders, invoices, and payment integration (Xendit / Pakasir). |
| **Broadcast & Templates** | Mass messaging with delivery logs plus WhatsApp template management. |
| **Automation Flows** | Visual flow builder (powered by XYFlow) for conversation automation and auto-responder rules. |
| **Forms & Canned Responses** | Lead-capture forms with field extraction, plus quick-reply snippets. |
| **Teams & Roles** | Multi-agent collaboration, divisions, availability/presence, and role-based navigation. |
| **Developer API & Webhooks** | Scoped developer API keys and business webhooks for third-party integrations. |
| **Analytics & Metrics** | Dashboards for conversation, sales, and agent metrics. |
| **Realtime** | Live inbox and presence updates via Socket.IO (with a Redis adapter for horizontal scaling). |

## Architecture

```
                         ┌───────────────────────────────────────────┐
                         │                Frontend                   │
                         │   React 18 · TanStack Start (SSR) · Vite   │
                         │   Tailwind 4 · Radix/shadcn · Socket.IO    │
                         └───────────────┬───────────────────────────┘
                                         │ HTTPS (REST /api, /api/v1)
                                         │ WebSocket (Socket.IO)
                         ┌───────────────▼───────────────────────────┐
                         │                 Backend                    │
                         │            Elysia on Bun runtime           │
                         │                                            │
                         │  APP_MODE=api        → HTTP + Socket.IO    │
                         │  APP_MODE=worker     → BullMQ consumer     │
                         │  APP_MODE=scheduler  → cron / scheduled     │
                         └───┬───────────────┬───────────────┬────────┘
                             │               │               │
                   ┌─────────▼──────┐ ┌──────▼──────┐ ┌──────▼─────────────┐
                   │  PostgreSQL 16 │ │   Redis 7   │ │   Integrations     │
                   │   + pgvector   │ │ queues + RT │ │  WhatsApp / Meta   │
                   │   (Prisma 7)   │ │  (BullMQ)   │ │  Xendit · S3 / R2  │
                   └────────────────┘ └─────────────┘ └────────────────────┘
```

**Runtime modes** — the same backend binary runs in three roles, selected with `APP_MODE`:

- `api` — serves the Elysia HTTP API and the Socket.IO realtime server. On boot it also reconnects embedded Baileys WhatsApp sessions in the background (disable with `BAILEYS_EMBEDDED_BOOTSTRAP=off`).
- `worker` — consumes BullMQ queues for async jobs (e.g. broadcasts, knowledge ingestion).
- `scheduler` — runs cron/scheduled jobs.

**Auth & context** — sessions use [Better Auth](https://www.better-auth.com); requests resolve organization/app context from headers (`x-business-id`, `x-app-id`, `x-org-slug`) and bearer tokens, enabling multi-tenant organizations.

## Tech Stack

**Backend**
- [Bun](https://bun.sh) runtime (`>= 1.1.0`)
- [Elysia](https://elysiajs.com) HTTP framework with `@elysiajs/cors`, `@elysiajs/openapi`, `@elysiajs/swagger`
- [Better Auth](https://www.better-auth.com) for sessions & authentication
- [Prisma 7](https://www.prisma.io) + PostgreSQL 16 (with `pgvector` for embeddings)
- [Redis](https://redis.io) + [BullMQ](https://docs.bullmq.io) for queues, with a Socket.IO Redis adapter
- [Socket.IO](https://socket.io) for realtime events
- [Baileys](https://github.com/WhiskeySockets/Baileys) for WhatsApp (embedded or microservice)
- [Xendit](https://www.xendit.co) for payments; AWS S3 / Cloudflare R2 for media storage

**Frontend**
- [React 18](https://react.dev) + [Vite 7](https://vite.dev)
- [TanStack Router & Start](https://tanstack.com) (file-based routing, SSR via Nitro)
- [Tailwind CSS 4](https://tailwindcss.com) with Radix UI / shadcn primitives
- [TipTap](https://tiptap.dev) (rich text), [XYFlow](https://reactflow.dev) (flow builder), [Recharts](https://recharts.org) (charts)
- `socket.io-client`, `@dnd-kit` (drag & drop), `zod` (validation)

**Tooling**
- [Biome](https://biomejs.dev) for formatting & linting
- TypeScript across both apps
- Docker / Docker Compose and k3d/Kubernetes manifests for deployment

## Project Structure

```
opencrm-app/
├── apps/
│   ├── backend/                  # Elysia API, worker, scheduler
│   │   ├── src/
│   │   │   ├── index.ts          # Entrypoint (mode switch: api/worker/scheduler)
│   │   │   ├── modules/          # Feature modules (see below)
│   │   │   ├── plugins/          # CORS, auth, OpenAPI, Socket.IO, app context
│   │   │   └── workers/          # BullMQ workers / scheduled jobs
│   │   ├── prisma/               # schema.prisma (113 models), migrations, seed
│   │   ├── knowledge/            # AI knowledge base content
│   │   └── scripts/              # Seeders & ops scripts
│   └── frontend/                 # React + TanStack Start app
│       ├── src/routes/           # File-based routes (workspace + public)
│       ├── src/lib/              # API client (api.ts), socket client (socket.ts)
│       └── public/               # Static assets
├── deploy/                       # VPS (docker-compose) + local k3d/k8s configs
├── scripts/                      # Repo-level utility scripts
├── Dockerfile
├── DEPLOY-QUICK.md               # Production deploy walkthrough
└── package.json                  # Root workspace (Bun workspaces)
```

## Application Modules

The backend is organized into focused Elysia routers under `apps/backend/src/modules/`:

`agent`, `agent-settings`, `ai`, `api-tools`, `auth`, `broadcast`, `business-webhooks`, `canned-response`, `chatbot`, `commerce`, `contact`, `conversation`, `crm`, `customer`, `developer-keys`, `flow`, `form`, `handover`, `inbox`, `instagram`, `knowledge`, `label`, `media`, `message`, `metrics`, `orchestration`, `orders`, `team`, `template-variables`, `user`, `waba`, `webhook(s)`, `whatsapp`, `whatsapp-templates`.

Each module is a thin HTTP layer that validates input, resolves org/app context, and delegates to a service. The data layer spans **113 Prisma models** covering organizations/members, conversations, contacts, AI settings & logs, knowledge ingestion, automation flows, broadcasts, commerce, and more.

## API Surface

The API is mounted under two prefixes for compatibility:

- **`/api`** — legacy/compatibility routes (includes extra AI-settings/provider endpoints).
- **`/api/v1`** — the current versioned API.

Notable system endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health/version probe |
| `*` | `/docs` | Swagger / OpenAPI playground |
| `*` | `/auth/*` | Better Auth endpoints |
| `*` | `/api/v1/whatsapp-channels/*` | WhatsApp channel management |
| `*` | `/api/v1/webhooks/whatsapp` | Inbound WhatsApp webhook |

Multi-tenant requests pass context via the `x-business-id`, `x-app-id`, `x-org-slug`, and `x-api-key` headers (all allow-listed in CORS).

## Frontend Screens

Authenticated workspace routes live under `/_app` and include:

`dashboard`, `chat` (inbox), `ai` / `ai-agents`, `knowledge`, `flows`, `handover`, `broadcast`, `outbound`, `pipeline`, `products`, `product-stock`, `orders`, `templates`, `team`, `analytics`, `metrics`, `integration`, `settings`, `help`.

Public routes include `login`, `register`, `onboarding`, `invoice/$token`, `payment/success`, `privacy`, and `terms`.

## Requirements

- [Bun](https://bun.sh) `>= 1.1.0`
- PostgreSQL 16 with the `pgvector` extension
- Redis 7
- (Optional) Docker + Docker Compose v2 for containerized runs

## Getting Started (Local)

```bash
# 1. Clone
git clone https://github.com/muhamadbasim/opencrm-app.git
cd opencrm-app

# 2. Install dependencies (Bun workspaces installs both apps)
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, and auth secrets

# 4. Prepare the database
bun run db:generate   # generate the Prisma client
bun run db:push       # push the schema to your database

# 5. Run both apps
bun run dev
#   Backend API → http://localhost:3010   (Swagger at /docs)
#   Frontend UI → http://localhost:3005

# …or run them individually
bun run dev:backend
bun run dev:frontend
```

> Make sure PostgreSQL and Redis are running before `db:push` and `dev`. For a one-command local stack (DB, Redis, tunnels), see `bun run local:up`.

To run the background services locally:

```bash
bun run start:worker      # BullMQ worker (APP_MODE=worker)
bun run start:scheduler   # scheduled jobs (APP_MODE=scheduler)
```

## Environment Configuration

Copy the example files and fill in values:

- Root: `.env.example` → `.env`
- Backend: `apps/backend/.env.example` → `apps/backend/.env`
- Frontend: `apps/frontend/.env.example` → `apps/frontend/.env`

The backend loads `apps/backend/.env` first, then falls back to the workspace root `.env`.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `BETTER_AUTH_SECRET` / `SESSION_SECRET` / `JWT_SECRET` | Auth secrets (`openssl rand -base64 32`) |
| `DEVELOPER_API_KEY_SECRET` | Secret for signing developer API keys |
| `PORT` / `SOCKET_PORT` | API port (3010) & Socket.IO port (3011) |
| `APP_MODE` | `api` \| `worker` \| `scheduler` |
| `FRONTEND_URL` | Allowed CORS origin(s) for the frontend |
| `VITE_API_URL` / `VITE_SOCKET_URL` | Backend URLs the frontend talks to |
| `AI_PROVIDER` / `AI_MODEL` / `OPENAI_API_KEY` | AI configuration (optional) |
| `WHATSAPP_*` / `META_*` / `FB_APP_*` | WhatsApp Cloud API / Meta config (optional) |
| `BAILEYS_*` | Embedded or external Baileys WhatsApp service (optional) |
| `R2_*` | Cloudflare R2 / S3 media storage (optional) |
| `XENDIT` / `PAKASIR_*` | Payment provider config (optional) |

See `.env.production.example` for the full production variable list.

## Database

The backend uses Prisma against PostgreSQL (with `pgvector` for AI embeddings).

```bash
bun run db:generate                 # generate the Prisma client
bun run db:push                     # sync the schema to the database
bun run db:studio                   # open Prisma Studio
bun run --filter backend db:seed    # seed initial data
```

The schema defines 113 models with migrations tracked under `apps/backend/prisma/migrations/`.

## WhatsApp Integration

OpenCRM supports two WhatsApp paths:

1. **Baileys (unofficial / QR-based)** — runs embedded in the API process by default. Sessions reconnect automatically on boot; set `BAILEYS_EMBEDDED_BOOTSTRAP=off` to run an external Baileys microservice instead (`BAILEYS_SERVICE_URL`).
2. **WhatsApp Cloud API / WABA (official)** — configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and point Meta's webhook at `/api/v1/webhooks/whatsapp`.

## Deployment

The fastest path is Docker Compose. See [`DEPLOY-QUICK.md`](./DEPLOY-QUICK.md) for the full walkthrough.

```bash
cp .env.production.example .env.production
# Fill in domain, secrets, and DB password

cd deploy/vps
docker compose --env-file ../../.env.production up -d --build

# Initialize the database once Postgres is healthy
docker exec opencrm-backend-api bunx prisma db push
docker exec opencrm-backend-api bun run prisma/seed.ts

# Verify
curl https://api.yourdomain.com/health
```

Containers started by the compose stack:

| Container | Port | Purpose |
|-----------|------|---------|
| `opencrm-postgres` | 5432 | PostgreSQL 16 + pgvector |
| `opencrm-redis` | 6379 | Redis 7 |
| `opencrm-backend-api` | 3010 | Elysia API + Socket.IO (3011) |
| `opencrm-backend-worker` | — | BullMQ queue worker |
| `opencrm-backend-scheduler` | — | Cron / scheduled jobs |
| `opencrm-frontend` | 80 | Vite SSR (Nitro) |

Put a reverse proxy (Caddy/Nginx/Traefik) in front for TLS, routing the Socket.IO path (`/socket-io/*`) to port 3011. A local **k3d / Kubernetes** workflow is also available:

```bash
bun run k3d:up              # spin up a local k3d cluster
bun run k8s:deploy:local    # deploy via Helm
bun run local:up            # full local stack helper
```

## Available Scripts

Run from the repo root:

| Command | Action |
|---------|--------|
| `bun run dev` | Run backend + frontend in watch mode |
| `bun run dev:backend` / `bun run dev:frontend` | Run a single app |
| `bun run build` | Build both apps |
| `bun run start:api` | Start the API (production) |
| `bun run start:worker` | Start the BullMQ worker |
| `bun run start:scheduler` | Start the scheduler |
| `bun run lint` | Typecheck / lint all workspaces |
| `bun run format` | Format code with Biome |
| `bun run test` | Run tests across workspaces |
| `bun run db:generate` / `db:push` / `db:studio` / `db:pull` | Prisma database commands |
| `bun run local:up` / `local:down` / `local:status` | Local stack lifecycle |
| `bun run k3d:up` / `k8s:deploy:local` | Local Kubernetes workflow |

## Testing & Linting

```bash
bun run test      # run tests in every workspace
bun run lint      # typecheck (tsc --noEmit) + lint
bun run format    # format with Biome
```

Backend tests live in `apps/backend/test/` and run with Bun's test runner.

## Troubleshooting

- **`db:push` fails** — confirm `DATABASE_URL` is reachable and the `pgvector` extension is installed in your database.
- **Realtime/inbox not updating** — check that the Socket.IO port (`SOCKET_PORT`, default 3011) is reachable and `VITE_SOCKET_URL` points to it; behind a proxy, route `/socket-io/*` correctly.
- **CORS errors in the browser** — add your frontend origin to `FRONTEND_URL` (comma-separated origins are supported).
- **WhatsApp messages not arriving** — for Baileys, ensure the embedded runtime bootstrapped (look for `📱 Baileys embedded runtime bootstrapped` in logs); for Cloud API, verify the Meta webhook URL and verify token.

## Contributing

1. Create a feature branch from `main`.
2. Run `bun run lint` and `bun run test` before opening a PR.
3. Keep changes scoped and follow the existing module/service structure.

## License

Released under the [MIT License](./LICENSE). © 2026 Muhamad Basim.
