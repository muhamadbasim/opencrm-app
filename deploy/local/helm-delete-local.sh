#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-scalebiz}"
RELEASE="${RELEASE:-scalebiz}"

helm -n "${NAMESPACE}" uninstall "${RELEASE}" || true
