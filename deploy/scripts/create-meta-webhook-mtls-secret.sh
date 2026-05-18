#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-scalebiz}"
SECRET_NAME="${SECRET_NAME:-meta-webhooks-ca}"
CERT_PATH="${CERT_PATH:-./deploy/certs/meta-outbound-api-ca-2025-12.pem}"

if [ ! -f "${CERT_PATH}" ]; then
  echo "Certificate file not found: ${CERT_PATH}"
  echo "Set CERT_PATH to the Meta root CA PEM file and retry."
  exit 1
fi

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# Keep both keys for better compatibility across controllers and tooling.
kubectl -n "${NAMESPACE}" create secret generic "${SECRET_NAME}" \
  --from-file=tls.ca="${CERT_PATH}" \
  --from-file=ca.crt="${CERT_PATH}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret ${SECRET_NAME} applied in namespace ${NAMESPACE}"
echo "Source certificate: ${CERT_PATH}"
