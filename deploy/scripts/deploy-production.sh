#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-scalebiz}"
RELEASE="${RELEASE:-scalebiz}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY_OWNER="${REGISTRY_OWNER:-REPLACE_ME}"

# Backward compatibility for existing scheduler Deployment strategy.
if kubectl -n "${NAMESPACE}" get deployment "${RELEASE}-scheduler" >/dev/null 2>&1; then
  current_scheduler_strategy="$(kubectl -n "${NAMESPACE}" get deployment "${RELEASE}-scheduler" -o jsonpath='{.spec.strategy.type}' || true)"
  if [ "${current_scheduler_strategy}" = "RollingUpdate" ]; then
    echo "Patching ${RELEASE}-scheduler strategy to Recreate (one-time compatibility fix)..."
    kubectl -n "${NAMESPACE}" patch deployment "${RELEASE}-scheduler" \
      --type='json' \
      -p='[{"op":"replace","path":"/spec/strategy","value":{"type":"Recreate"}}]'
  fi
fi

helm upgrade --install "${RELEASE}" ./deploy/helm/scalebiz \
  --namespace "${NAMESPACE}" \
  --create-namespace \
  --atomic \
  --wait \
  --timeout 10m \
  --history-max 20 \
  -f ./deploy/helm/scalebiz/values.yaml \
  -f ./deploy/helm/scalebiz/values-production.yaml \
  --set api.image.repository="ghcr.io/${REGISTRY_OWNER}/scalebiz-backend" \
  --set api.image.tag="${IMAGE_TAG}" \
  --set worker.image.repository="ghcr.io/${REGISTRY_OWNER}/scalebiz-backend" \
  --set worker.image.tag="${IMAGE_TAG}" \
  --set scheduler.image.repository="ghcr.io/${REGISTRY_OWNER}/scalebiz-backend" \
  --set scheduler.image.tag="${IMAGE_TAG}" \
  --set frontend.image.repository="ghcr.io/${REGISTRY_OWNER}/scalebiz-frontend" \
  --set frontend.image.tag="${IMAGE_TAG}"

kubectl -n "${NAMESPACE}" rollout status deployment/"${RELEASE}"-api --timeout=300s
kubectl -n "${NAMESPACE}" rollout status deployment/"${RELEASE}"-frontend --timeout=300s
kubectl -n "${NAMESPACE}" rollout status deployment/"${RELEASE}"-worker --timeout=300s
kubectl -n "${NAMESPACE}" rollout status deployment/"${RELEASE}"-scheduler --timeout=300s

kubectl -n "${NAMESPACE}" get pods
