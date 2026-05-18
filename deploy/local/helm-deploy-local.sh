#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-scalebiz}"
RELEASE="${RELEASE:-scalebiz}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
TMP_ENV="${TMP_ENV:-/tmp/scalebiz-k8s.env}"
REDIS_URL="${REDIS_URL:-redis://redis.${NAMESPACE}.svc.cluster.local:6379}"
FRONTEND_IMAGE_TAG="${FRONTEND_IMAGE_TAG:-local5}"
BACKEND_IMAGE_TAG="${BACKEND_IMAGE_TAG:-local2}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# Local-only Redis for multi-instance simulation
kubectl -n "${NAMESPACE}" get deploy redis >/dev/null 2>&1 \
  || kubectl -n "${NAMESPACE}" create deployment redis --image=redis:7-alpine --port=6379
kubectl -n "${NAMESPACE}" get svc redis >/dev/null 2>&1 \
  || kubectl -n "${NAMESPACE}" expose deployment redis --name=redis --port=6379 --target-port=6379

# Build a deduplicated env-file so kubectl secret accepts it.
awk -F= '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    k=$1
    sub(/^[[:space:]]+|[[:space:]]+$/, "", k)
    v=substr($0, index($0, "=")+1)
    val[k]=v
    if (!(k in seen)) { order[++n]=k; seen[k]=1 }
  }
  END {
    for (i=1; i<=n; i++) {
      k=order[i]
      print k "=" val[k]
    }
  }
' "${ENV_FILE}" > "${TMP_ENV}"

if ! rg -q '^REDIS_URL=' "${TMP_ENV}"; then
  echo "REDIS_URL=${REDIS_URL}" >> "${TMP_ENV}"
fi

kubectl -n "${NAMESPACE}" create secret generic scalebiz-secrets \
  --from-env-file="${TMP_ENV}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Backward compatibility: existing scheduler deployments with RollingUpdate strategy
# cannot be switched directly to Recreate via Helm patch if rollingUpdate keys remain.
if kubectl -n "${NAMESPACE}" get deployment "${RELEASE}-scheduler" >/dev/null 2>&1; then
  current_scheduler_strategy="$(kubectl -n "${NAMESPACE}" get deployment "${RELEASE}-scheduler" -o jsonpath='{.spec.strategy.type}' || true)"
  if [ "${current_scheduler_strategy}" = "RollingUpdate" ]; then
    echo "Patching ${RELEASE}-scheduler strategy to Recreate (one-time compatibility fix)..."
    kubectl -n "${NAMESPACE}" patch deployment "${RELEASE}-scheduler" \
      --type='json' \
      -p='[{"op":"replace","path":"/spec/strategy","value":{"type":"Recreate"}}]' >/dev/null
  fi
fi

helm upgrade --install "${RELEASE}" "${ROOT_DIR}/deploy/helm/scalebiz" \
  --namespace "${NAMESPACE}" \
  --create-namespace \
  -f "${ROOT_DIR}/deploy/helm/scalebiz/values.yaml" \
  -f "${ROOT_DIR}/deploy/helm/scalebiz/values-local.yaml" \
  --set frontend.image.repository=scalebiz-frontend \
  --set frontend.image.tag="${FRONTEND_IMAGE_TAG}" \
  --set frontend.image.pullPolicy=IfNotPresent \
  --set api.image.repository=scalebiz-backend \
  --set api.image.tag="${BACKEND_IMAGE_TAG}" \
  --set api.image.pullPolicy=IfNotPresent \
  --set worker.image.repository=scalebiz-backend \
  --set worker.image.tag="${BACKEND_IMAGE_TAG}" \
  --set worker.image.pullPolicy=IfNotPresent \
  --set scheduler.image.repository=scalebiz-backend \
  --set scheduler.image.tag="${BACKEND_IMAGE_TAG}" \
  --set scheduler.image.pullPolicy=IfNotPresent

kubectl -n "${NAMESPACE}" get pods
