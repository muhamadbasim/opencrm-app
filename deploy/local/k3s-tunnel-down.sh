#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COLLAB_DIR="${ROOT_DIR}/.collaborator"

mkdir -p "${COLLAB_DIR}"

kill_pid_file() {
  local file="$1"
  if [ -f "${file}" ]; then
    local pid
    pid="$(cat "${file}")"
    if [ -n "${pid}" ]; then
      kill "${pid}" 2>/dev/null || true
    fi
    rm -f "${file}"
  fi
}

kill_pid_file "${COLLAB_DIR}/cloudflared-k3s.pid"
kill_pid_file "${COLLAB_DIR}/bridge-3005.pid"
kill_pid_file "${COLLAB_DIR}/bridge-3010.pid"
kill_pid_file "${COLLAB_DIR}/bridge-3011.pid"

# Fallback for stale bridge processes whose pid files are missing.
pkill -f "socat TCP-LISTEN:3005,reuseaddr,fork TCP:127.0.0.1:80" >/dev/null 2>&1 || true
pkill -f "socat TCP-LISTEN:3010,reuseaddr,fork TCP:127.0.0.1:80" >/dev/null 2>&1 || true
pkill -f "socat TCP-LISTEN:3011,reuseaddr,fork TCP:127.0.0.1:80" >/dev/null 2>&1 || true

echo "k3s tunnel stopped"
