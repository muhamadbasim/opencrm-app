# Scalebiz Kubernetes Deployment

This folder contains the production-oriented deployment assets for Scalebiz:

- `helm/scalebiz`: Helm chart for `frontend`, `api`, `worker`, and `scheduler`
- `local`: Local k3d simulation scripts (multi-node)
- `nginx/frontend.conf`: SPA runtime nginx config for frontend image

## Prerequisites

- Docker
- kubectl
- helm
- k3d (for local simulation)

## Local Multi-Node Simulation (k3d)

```bash
./deploy/local/k3d-up.sh
./deploy/local/helm-deploy-local.sh
```

## One-Command Local Runner

Use this when you want simple commands for run + tunnel:

```bash
bun run local:up
```

Useful variants:

```bash
bun run local:up:fast      # skip docker build
bun run local:up:no-tunnel # run k3s only
bun run local:status
bun run local:down         # stop tunnel only
bun run local:destroy      # stop tunnel + uninstall helm + delete k3d cluster
```

## Dev Tunnel on top of k3s (local domains)

This mode keeps Cloudflare dev domains active (`local-fe.scalebiz.chat`, `local-api.scalebiz.chat`)
while runtime is served by k3s ingress.

```bash
./deploy/local/k3s-tunnel-up.sh
# stop when done
./deploy/local/k3s-tunnel-down.sh
```

Notes:
- The script bridges `localhost:3005`, `:3010`, `:3011` to ingress `:80` to match existing Cloudflare tunnel config.
- Local values disable Xendit reconciliation cron by default (`XENDIT_RECONCILIATION_ENABLED=false`) to avoid schema mismatch noise in dev.

## Production Deploy (GitHub Actions via SSH)

CI/CD path (default):
- Push ke `main` memicu `.github/workflows/ci-cd.yml`
- Action build image backend/frontend
- Action transfer image archive ke VPS via SSH
- Action import image ke K3s containerd lalu jalankan Helm guarded rollout (`--atomic --wait`)

Required GitHub Environment secrets (environment: `Dev`):
- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_SUDO_PASSWORD` (opsional jika user SSH belum passwordless sudo)

> The chart expects runtime secrets from a Kubernetes Secret (default name: `scalebiz-secrets`).
> You should store sensitive variables such as `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
> and all third-party API keys in that secret.

## Production TLS (cert-manager + Let's Encrypt)

Recommended one-time bootstrap on VPS:

```bash
ACME_EMAIL=ops@scalebiz.chat ./deploy/scripts/setup-cert-manager.sh
```

If you prefer applying the issuer manifest directly:

```bash
kubectl apply -f ./deploy/k8s/cluster-issuer-letsencrypt-prod.yaml
```

`values-production.yaml` already sets:
- `ingress.tls.enabled=true`
- `ingress.annotations.cert-manager.io/cluster-issuer=letsencrypt-prod`

## Meta Webhooks mTLS CA (March 2026 Transition)

If you verify inbound Meta Webhooks client certificates (mTLS), add the new Meta
root CA to the ingress trust store.

1. Create or update Kubernetes Secret from the bundled PEM:

```bash
./deploy/scripts/create-meta-webhook-mtls-secret.sh
```

2. Enable dedicated webhook ingress + Traefik TLSOption mTLS (recommended so normal API traffic is unaffected):

```bash
helm upgrade --install scalebiz ./deploy/helm/scalebiz \
  --namespace scalebiz \
  -f ./deploy/helm/scalebiz/values.yaml \
  -f ./deploy/helm/scalebiz/values-production.yaml \
  --set webhookIngress.enabled=true \
  --set webhookIngress.host=webhook-api.scalebiz.chat \
  --set webhookIngress.tls.secretName=scalebiz-webhook-tls \
  --set webhookMtls.enabled=true \
  --set webhookMtls.traefik.caSecretName=meta-webhooks-ca \
  --set webhookMtls.traefik.clientAuthType=VerifyClientCertIfGiven
```

3. Point Meta webhook callback to the dedicated host, for example:
- `https://webhook-api.scalebiz.chat/api/v1/webhooks/whatsapp`

## Near-Zero Downtime Defaults

The chart is hardened for guarded rolling updates:
- `api` and `frontend`: `RollingUpdate` with `maxUnavailable=0`, `maxSurge=1`
- `worker`: conservative `RollingUpdate`
- `scheduler`: `Recreate` to avoid double cron execution
- `minReadySeconds`, `progressDeadlineSeconds`, `revisionHistoryLimit`
- `terminationGracePeriodSeconds` + `preStop` drain for `api` and `frontend`
- `PodDisruptionBudget` for `api` and `frontend` (`minAvailable: 1`)

## Deploy and Rollback Runbook

Production deploy with guard rails:
- Trigger otomatis via push ke `main`
- Atau manual via GitHub Actions `workflow_dispatch`

Manual rollback via GitHub Actions workflow:
- Workflow: `.github/workflows/rollback.yml`
- Input required: Helm revision

Rollback is mandatory when one of these happens after deploy:
- `/health` API fails repeatedly
- `/login` frontend fails repeatedly
- websocket handshake on `/socket.io` fails repeatedly
- worker queue backlog keeps growing abnormally

Live logs:

```bash
kubectl -n scalebiz logs deployment/scalebiz-api -f --since=10m
kubectl -n scalebiz logs deployment/scalebiz-frontend -f --since=10m
kubectl -n scalebiz logs deployment/scalebiz-worker -f --since=10m
kubectl -n scalebiz logs deployment/scalebiz-scheduler -f --since=10m
```

## Database Migration Policy (Expand-Contract)

- Do not run destructive migrations in the main app deploy pipeline.
- Run additive migrations in a separate, manual-gated step.
- Deploy app changes after additive migration is in place.
- Remove old columns/constraints in a later release after verification.
