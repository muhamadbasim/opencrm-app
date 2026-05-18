#!/usr/bin/env bash
set -euo pipefail

CERT_MANAGER_NAMESPACE="${CERT_MANAGER_NAMESPACE:-cert-manager}"
INGRESS_CLASS="${INGRESS_CLASS:-traefik}"
CLUSTER_ISSUER_NAME="${CLUSTER_ISSUER_NAME:-letsencrypt-prod}"
ACME_EMAIL="${ACME_EMAIL:-}"

if [[ -z "${ACME_EMAIL}" ]]; then
  echo "ACME_EMAIL is required."
  echo "Example: ACME_EMAIL=ops@scalebiz.chat ./deploy/scripts/setup-cert-manager.sh"
  exit 1
fi

helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo update >/dev/null

helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace "${CERT_MANAGER_NAMESPACE}" \
  --create-namespace \
  --set crds.enabled=true

cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ${CLUSTER_ISSUER_NAME}
spec:
  acme:
    email: ${ACME_EMAIL}
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: ${CLUSTER_ISSUER_NAME}-account-key
    solvers:
      - http01:
          ingress:
            class: ${INGRESS_CLASS}
EOF

kubectl -n "${CERT_MANAGER_NAMESPACE}" rollout status deployment/cert-manager --timeout=300s
kubectl -n "${CERT_MANAGER_NAMESPACE}" rollout status deployment/cert-manager-cainjector --timeout=300s
kubectl -n "${CERT_MANAGER_NAMESPACE}" rollout status deployment/cert-manager-webhook --timeout=300s

echo "cert-manager and ClusterIssuer '${CLUSTER_ISSUER_NAME}' are ready."
