# OpenCRM — Quick Deploy Guide

## Prerequisites (VPS)
- Docker + Docker Compose v2
- 2+ vCPU, 4+ GB RAM
- Domain pointed to VPS IP (e.g. `crm.yourdomain.com`, `api.yourdomain.com`)
- Reverse proxy (Caddy/Nginx/Traefik) for TLS

## Steps

### 1. Clone & configure
```bash
git clone https://github.com/muhamadbasim/opencrm-app.git
cd opencrm-app
cp .env.production.example .env.production
# Edit .env.production — fill in domain, secrets, DB password
```

### 2. Generate secrets
```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)"
echo "SESSION_SECRET=$(openssl rand -base64 32)"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "DEVELOPER_API_KEY_SECRET=$(openssl rand -base64 32)"
echo "N8N_EMBED_AUTH_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
```

### 3. Build & start
```bash
cd deploy/vps
docker compose --env-file ../../.env.production up -d --build
```

### 4. Initialize database
```bash
# Wait for postgres to be healthy, then:
docker exec opencrm-backend-api bunx prisma db push
docker exec opencrm-backend-api bun run prisma/seed.ts
```

### 5. Verify
```bash
curl https://api.yourdomain.com/health
# Should return: {"status":"healthy","timestamp":"...","version":"2.0.0"}
```

## Services
| Container | Port | Purpose |
|-----------|------|---------|
| opencrm-postgres | 5432 | PostgreSQL 16 + pgvector |
| opencrm-redis | 6379 | Redis 7 |
| opencrm-backend-api | 3010 | Elysia API + Socket.IO (3011) |
| opencrm-backend-worker | — | BullMQ queue worker |
| opencrm-backend-scheduler | — | Cron/scheduled jobs |
| opencrm-frontend | 80 | Vite SSR (Nitro) |

## Reverse Proxy (Caddy example)
```
crm.yourdomain.com {
    reverse_proxy localhost:3005
}

api.yourdomain.com {
    reverse_proxy localhost:3010
    
    handle /socket-io/* {
        reverse_proxy localhost:3011
    }
}
```

## Update
```bash
cd opencrm-app && git pull
cd deploy/vps && docker compose --env-file ../../.env.production up -d --build
```
