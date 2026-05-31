# OpenCRM

**CRM omnichannel berbasis WhatsApp dengan AI chatbot, inbox tim, commerce, dan automation flow.**

OpenCRM adalah platform CRM yang berpusat pada percakapan WhatsApp (WhatsApp-first). Bisnis bisa mengelola kontak, percakapan, katalog produk, pesanan, broadcast, sampai chatbot AI berbasis knowledge base — semuanya dari satu workspace.

---

## Daftar Isi
- [Fitur Utama](#fitur-utama)
- [Arsitektur](#arsitektur)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Persyaratan](#persyaratan)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Database](#database)
- [Deploy ke Produksi](#deploy-ke-produksi)
- [Script yang Tersedia](#script-yang-tersedia)
- [Testing & Lint](#testing--lint)

---

## Fitur Utama

- **Omnichannel Inbox** — Tangani percakapan WhatsApp (Baileys & WhatsApp Cloud API/WABA) dan Instagram dari satu inbox realtime.
- **AI Chatbot & Knowledge Base** — Balasan otomatis bertenaga AI yang menjawab berdasarkan knowledge base produk, dengan handover mulus ke agen manusia.
- **Manajemen Kontak & CRM** — Kontak, label, customer, dan pipeline percakapan dalam satu tempat.
- **Commerce & Orders** — Katalog produk, pemesanan, dan integrasi pembayaran (Xendit / Pakasir).
- **Broadcast & Template** — Kirim pesan massal dan kelola template WhatsApp.
- **Automation Flow** — Builder alur percakapan visual untuk otomatisasi.
- **Forms & Canned Response** — Form penangkap lead dan balasan cepat siap pakai.
- **Team & Roles** — Kolaborasi multi-agen dengan navigasi berbasis peran.
- **Developer API & Webhooks** — API key untuk developer plus business webhooks untuk integrasi pihak ketiga.
- **Realtime** — Pembaruan inbox langsung lewat Socket.IO.

## Arsitektur

OpenCRM adalah monorepo (Bun workspaces) dengan dua aplikasi:

```
┌──────────────┐      HTTP / Socket.IO      ┌─────────────────────────────┐
│   Frontend   │ ◄────────────────────────► │           Backend           │
│ React + Vite │                            │  Elysia (API)               │
│ TanStack     │                            │  Worker (BullMQ)            │
│ Start (SSR)  │                            │  Scheduler (cron)           │
└──────────────┘                            └──────────────┬──────────────┘
                                                           │
                          ┌────────────────────────────────┼───────────────────────┐
                          │                                 │                       │
                    ┌─────▼─────┐                    ┌──────▼──────┐         ┌───────▼───────┐
                    │ Postgres  │                    │    Redis    │         │  Integrasi    │
                    │ +pgvector │                    │ Queue/RT    │         │ WA, Xendit... │
                    └───────────┘                    └─────────────┘         └───────────────┘
```

Backend berjalan dalam tiga mode lewat variabel `APP_MODE`:
- `api` — server HTTP Elysia + Socket.IO
- `worker` — pemroses antrian BullMQ
- `scheduler` — job terjadwal (cron)

## Tech Stack

**Backend**
- [Bun](https://bun.sh) runtime
- [Elysia](https://elysiajs.com) untuk routing/HTTP
- [Better Auth](https://www.better-auth.com) untuk sesi & autentikasi
- [Prisma 7](https://www.prisma.io) + PostgreSQL (pgvector)
- [Redis](https://redis.io) + [BullMQ](https://docs.bullmq.io) untuk antrian & realtime
- [Socket.IO](https://socket.io) untuk event realtime
- [Baileys](https://github.com/WhiskeySockets/Baileys) untuk WhatsApp
- Xendit untuk pembayaran, AWS S3 / Cloudflare R2 untuk media

**Frontend**
- [React 18](https://react.dev) + [Vite](https://vite.dev)
- [TanStack Router & Start](https://tanstack.com) (SSR)
- [Tailwind CSS 4](https://tailwindcss.com) + Radix UI / shadcn
- TipTap (rich text), XYFlow (flow builder), Recharts (grafik)

## Struktur Proyek

```
opencrm-app/
├── apps/
│   ├── backend/          # API Elysia, worker, scheduler, Prisma
│   │   ├── src/modules/  # Modul fitur (inbox, chatbot, commerce, dll.)
│   │   ├── prisma/       # Schema & seed database
│   │   └── knowledge/    # Knowledge base AI
│   └── frontend/         # Aplikasi React + TanStack Start
├── deploy/               # Konfigurasi deploy (VPS, k3d/k8s lokal)
├── scripts/              # Script utilitas
├── Dockerfile
└── package.json          # Root workspace
```

## Persyaratan

- [Bun](https://bun.sh) `>= 1.1.0`
- PostgreSQL 16 (dengan ekstensi `pgvector`)
- Redis 7
- Node-compatible environment (untuk beberapa tooling)

## Menjalankan Secara Lokal

```bash
# 1. Clone repo
git clone https://github.com/muhamadbasim/opencrm-app.git
cd opencrm-app

# 2. Install dependency
bun install

# 3. Siapkan environment
cp .env.example .env
# Edit .env sesuai kebutuhan (DATABASE_URL, REDIS_URL, secrets)

# 4. Siapkan database
bun run db:push       # push schema Prisma ke database
bun run db:generate   # generate Prisma client

# 5. Jalankan backend & frontend
bun run dev           # menjalankan keduanya (filter '*')
# atau terpisah:
bun run dev:backend   # API di http://localhost:3010
bun run dev:frontend  # UI di http://localhost:3005
```

> Pastikan PostgreSQL dan Redis sudah berjalan sebelum `db:push` dan `dev`.

## Konfigurasi Environment

Salin file contoh lalu isi nilainya:
- Root: `.env.example` → `.env`
- Backend: `apps/backend/.env.example` → `apps/backend/.env`
- Frontend: `apps/frontend/.env.example` → `apps/frontend/.env`

Variabel penting:

| Variabel | Keterangan |
|----------|------------|
| `DATABASE_URL` | Connection string PostgreSQL |
| `REDIS_URL` | Connection string Redis |
| `BETTER_AUTH_SECRET` / `SESSION_SECRET` / `JWT_SECRET` | Secret auth (`openssl rand -base64 32`) |
| `PORT` / `SOCKET_PORT` | Port API (3010) & Socket.IO (3011) |
| `VITE_API_URL` / `VITE_SOCKET_URL` | URL backend untuk frontend |
| `OPENAI_API_KEY` / `AI_MODEL` | Konfigurasi AI (opsional) |
| `WHATSAPP_*` / `BAILEYS_*` | Integrasi WhatsApp (opsional) |
| `XENDIT` / `PAKASIR_*` | Integrasi pembayaran (opsional) |

Lihat `.env.production.example` untuk daftar lengkap variabel produksi.

## Database

Proyek memakai Prisma + PostgreSQL.

```bash
bun run db:generate   # generate Prisma client
bun run db:push       # sinkronkan schema ke database
bun run db:studio     # buka Prisma Studio
bun run --filter backend db:seed   # seed data awal
```

## Deploy ke Produksi

Cara cepat memakai Docker Compose (lihat [`DEPLOY-QUICK.md`](./DEPLOY-QUICK.md) untuk detail):

```bash
cp .env.production.example .env.production
# Isi domain, secrets, dan password DB

cd deploy/vps
docker compose --env-file ../../.env.production up -d --build

# Inisialisasi database
docker exec opencrm-backend-api bunx prisma db push
docker exec opencrm-backend-api bun run prisma/seed.ts
```

Layanan yang berjalan:

| Container | Port | Fungsi |
|-----------|------|--------|
| `opencrm-postgres` | 5432 | PostgreSQL 16 + pgvector |
| `opencrm-redis` | 6379 | Redis 7 |
| `opencrm-backend-api` | 3010 | API Elysia + Socket.IO (3011) |
| `opencrm-backend-worker` | — | Worker antrian BullMQ |
| `opencrm-backend-scheduler` | — | Job terjadwal |
| `opencrm-frontend` | 80 | Frontend Vite SSR |

Tersedia juga konfigurasi k3d/Kubernetes lokal di folder `deploy/` (`bun run k3d:up`, `bun run k8s:deploy:local`).

## Script yang Tersedia

| Perintah | Aksi |
|----------|------|
| `bun run dev` | Jalankan backend + frontend |
| `bun run build` | Build kedua aplikasi |
| `bun run start:api` | Jalankan API (produksi) |
| `bun run start:worker` | Jalankan worker |
| `bun run start:scheduler` | Jalankan scheduler |
| `bun run lint` | Lint/typecheck semua workspace |
| `bun run format` | Format kode (Biome) |
| `bun run test` | Jalankan test |
| `bun run db:*` | Perintah database Prisma |
| `bun run local:up` | Jalankan stack lokal lengkap |

## Testing & Lint

```bash
bun run test      # menjalankan test di semua workspace
bun run lint      # typecheck (tsc) + lint
bun run format    # format dengan Biome
```

---

## Lisensi

Proprietary — hak cipta pemilik repositori. Hubungi pemilik repo untuk penggunaan.
