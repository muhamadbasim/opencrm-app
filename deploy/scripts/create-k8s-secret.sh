#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-scalebiz}"
SECRET_NAME="${SECRET_NAME:-scalebiz-secrets}"

required_vars=(
  DATABASE_URL
  REDIS_URL
  BETTER_AUTH_SECRET
)

for name in "${required_vars[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required env var: ${name}"
    exit 1
  fi
done

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret generic "${SECRET_NAME}" \
  --from-env-file=.env \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret ${SECRET_NAME} applied in namespace ${NAMESPACE}"
