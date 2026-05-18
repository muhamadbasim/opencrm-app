#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-scalebiz-local}"
K8S_IMAGE="${K8S_IMAGE:-rancher/k3s:v1.31.5-k3s1}"

if ! command -v k3d >/dev/null 2>&1; then
  echo "k3d not found. Install first: https://k3d.io"
  exit 1
fi

if k3d cluster list | grep -q "${CLUSTER_NAME}"; then
  echo "Cluster ${CLUSTER_NAME} already exists, ensuring it is running..."
  k3d cluster start "${CLUSTER_NAME}" --wait
  echo "Cluster ${CLUSTER_NAME} ready"
  echo "kubectl context: k3d-${CLUSTER_NAME}"
  exit 0
fi

k3d cluster create "${CLUSTER_NAME}" \
  --image "${K8S_IMAGE}" \
  --servers 1 \
  --agents 2 \
  -p "80:80@loadbalancer" \
  -p "443:443@loadbalancer" \
  --wait

echo "Cluster ${CLUSTER_NAME} created"
echo "kubectl context: k3d-${CLUSTER_NAME}"
