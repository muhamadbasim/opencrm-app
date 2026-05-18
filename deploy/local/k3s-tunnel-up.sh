#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COLLAB_DIR="${ROOT_DIR}/.collaborator"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
DIRECT_MODE="${TUNNEL_DIRECT:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --direct)
      DIRECT_MODE=1
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--direct]"
      exit 1
      ;;
  esac
  shift
done

mkdir -p "${COLLAB_DIR}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install first: brew install cloudflared"
  exit 1
fi

if [ "${DIRECT_MODE}" != "1" ]; then
  if ! command -v socat >/dev/null 2>&1; then
    echo "socat not found. Install first: brew install socat"
    exit 1
  fi
fi

TOKEN="${CLOUDFLARED_TUNNEL_TOKEN:-}"
if [ -z "${TOKEN}" ] && [ -f "${ENV_FILE}" ]; then
  TOKEN="$(awk -F= '/^CLOUDFLARED_TUNNEL_TOKEN=/{print substr($0,index($0,"=")+1)}' "${ENV_FILE}")"
fi

if [ -z "${TOKEN}" ]; then
  echo "Missing CLOUDFLARED_TUNNEL_TOKEN (env or ${ENV_FILE})"
  exit 1
fi

"${ROOT_DIR}/deploy/local/k3s-tunnel-down.sh" >/dev/null 2>&1 || true

if [ "${DIRECT_MODE}" != "1" ]; then
  nohup socat TCP-LISTEN:3005,reuseaddr,fork TCP:127.0.0.1:80 > "${COLLAB_DIR}/bridge-3005.log" 2>&1 &
  echo $! > "${COLLAB_DIR}/bridge-3005.pid"

  nohup socat TCP-LISTEN:3010,reuseaddr,fork TCP:127.0.0.1:80 > "${COLLAB_DIR}/bridge-3010.log" 2>&1 &
  echo $! > "${COLLAB_DIR}/bridge-3010.pid"

  nohup socat TCP-LISTEN:3011,reuseaddr,fork TCP:127.0.0.1:80 > "${COLLAB_DIR}/bridge-3011.log" 2>&1 &
  echo $! > "${COLLAB_DIR}/bridge-3011.pid"
fi

nohup cloudflared tunnel run --token "${TOKEN}" > "${COLLAB_DIR}/cloudflared-k3s.log" 2>&1 &
echo $! > "${COLLAB_DIR}/cloudflared-k3s.pid"

sleep 3

echo "k3s tunnel started (mode: $( [ "${DIRECT_MODE}" = "1" ] && echo direct || echo bridge )):"
if [ "${DIRECT_MODE}" != "1" ]; then
  echo "  bridge 3005 -> 80 (pid $(cat "${COLLAB_DIR}/bridge-3005.pid"))"
  echo "  bridge 3010 -> 80 (pid $(cat "${COLLAB_DIR}/bridge-3010.pid"))"
  echo "  bridge 3011 -> 80 (pid $(cat "${COLLAB_DIR}/bridge-3011.pid"))"
else
  echo "  direct ports expected: 3005 (frontend), 3010/3011 (backend)"
fi
echo "  cloudflared pid $(cat "${COLLAB_DIR}/cloudflared-k3s.pid")"
echo
echo "Quick checks:"
if [ "${DIRECT_MODE}" != "1" ]; then
  curl --max-time 8 -sS -o /dev/null -w "  local-api via bridge: %{http_code}\n" -H 'Host: local-api.scalebiz.chat' http://127.0.0.1:3010/health || true
  curl --max-time 8 -sS -o /dev/null -w "  local-fe via bridge: %{http_code}\n" -H 'Host: local-fe.scalebiz.chat' http://127.0.0.1:3005/ || true
else
  curl --max-time 8 -sS -o /dev/null -w "  local-api direct: %{http_code}\n" http://127.0.0.1:3010/health || true
  curl --max-time 8 -sS -o /dev/null -w "  local-fe direct: %{http_code}\n" http://127.0.0.1:3005/ || true
fi
