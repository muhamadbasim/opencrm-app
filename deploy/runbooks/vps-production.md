# VPS Production Runbook (Docker Compose)

## 1. Production Host

- SSH target: `ubuntu@43.156.163.46`
- App directory: `/home/ubuntu/opencrm-app`
- Compose file: `/home/ubuntu/opencrm-app/deploy/vps/docker-compose.yml`
- Compose project: `vps`
- Public frontend: `https://crm.scalebiz.chat`
- Public API: `https://api-crm.scalebiz.chat`

The production `.env.production` file must stay on the server at:

```bash
/home/ubuntu/opencrm-app/.env.production
```

## 2. Standard Deploy

CI path:

- Push to `main` triggers `.github/workflows/ci-cd.yml`.
- GitHub Actions builds `opencrm/backend:${GITHUB_SHA}` and `opencrm/frontend:${GITHUB_SHA}`.
- Image archives are copied to `ubuntu@43.156.163.46`.
- Server loads images with Docker.
- Server runs `prisma migrate deploy` from the backend image.
- Server restarts app services with `docker compose up -d --no-build --remove-orphans --force-recreate backend-api backend-worker backend-scheduler frontend`.

Required GitHub Environment secret in environment `Dev`:

- `SSH_PRIVATE_KEY`

The production host and SSH user are pinned in the workflow:

```yaml
SSH_HOST: 43.156.163.46
SSH_USER: ubuntu
```

## 3. Manual Deploy

From repo root:

```bash
./scripts/deploy.sh
```

Optional overrides:

```bash
TARGET=ubuntu@43.156.163.46 IMAGE_TAG=my-tag ./scripts/deploy.sh
```

## 4. Post-Deploy Verification

```bash
curl -fsS https://api-crm.scalebiz.chat/health
curl -fsSL https://crm.scalebiz.chat/login >/dev/null
ssh ubuntu@43.156.163.46 'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -E "opencrm|NAMES"'
```

CI also validates the Socket.IO websocket handshake at:

```text
wss://api-crm.scalebiz.chat/socket.io/?EIO=4&transport=websocket
```

## 5. Live Logs

```bash
ssh ubuntu@43.156.163.46 'docker logs -f --since=10m opencrm-backend-api'
ssh ubuntu@43.156.163.46 'docker logs -f --since=10m opencrm-frontend'
ssh ubuntu@43.156.163.46 'docker logs -f --since=10m opencrm-backend-worker'
ssh ubuntu@43.156.163.46 'docker logs -f --since=10m opencrm-backend-scheduler'
```

## 6. Rollback

Use GitHub Actions workflow `Rollback Scalebiz (Docker Compose via SSH)` and input an existing image tag on the server, for example the previous Git SHA.

Manual rollback:

```bash
ssh ubuntu@43.156.163.46
cd /home/ubuntu/opencrm-app/deploy/vps
IMAGE_TAG=<previous-image-tag> docker compose --env-file ../../.env.production -p vps up -d --no-build --remove-orphans --force-recreate backend-api backend-worker backend-scheduler frontend
```

## 7. Database Migration Policy

Use expand-contract migrations:

1. Release N: run additive migrations only, such as new table, new nullable column, or new index.
2. Release N: deploy app code that remains compatible with both old and new schema.
3. Release N+1: remove old schema only after production observation is safe.

Avoid bundling destructive migration and app code that immediately depends on the destructive change in one deploy window.
