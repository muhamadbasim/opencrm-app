#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-scalebiz-local}"

if ! command -v k3d >/dev/null 2>&1; then
  echo "k3d not found"
  exit 1
fi

k3d cluster delete "${CLUSTER_NAME}" || true
