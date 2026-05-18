#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAMESPACE="${NAMESPACE:-scalebiz}"
CLUSTER_NAME="${CLUSTER_NAME:-scalebiz-local}"
BACKEND_IMAGE_TAG="${BACKEND_IMAGE_TAG:-local2}"
FRONTEND_IMAGE_TAG="${FRONTEND_IMAGE_TAG:-local5}"
COLLAB_DIR="${ROOT_DIR}/.collaborator"

usage() {
  cat <<'EOF'
Simple local stack runner (k3d + k8s + tunnel)

Usage:
  ./deploy/local/local-stack.sh up [--no-build] [--no-tunnel] [--hot-reload]
  ./deploy/local/local-stack.sh down
  ./deploy/local/local-stack.sh status
  ./deploy/local/local-stack.sh destroy

Commands:
  up       Build images (default), create k3d cluster, deploy Helm, start tunnel
  down     Stop tunnel and hot-reload processes started by this script
  status   Show cluster, pods, and quick health checks
  destroy  Stop tunnel/hot-reload, uninstall Helm release, and delete k3d cluster

Flags:
  --no-build   Skip docker build step during "up"
  --no-tunnel  Skip tunnel startup during "up"
  --hot-reload Start local backend/frontend with watch mode and use direct tunnel ports

Environment overrides:
  CLUSTER_NAME=scalebiz-local
  BACKEND_IMAGE_TAG=local2
  FRONTEND_IMAGE_TAG=local5
  NAMESPACE=scalebiz
  HOT_RELOAD_START_WORKER=1
  HOT_RELOAD_START_SCHEDULER=0
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd"
    exit 1
  fi
}

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

free_dev_port() {
  local port="$1"
  if lsof -ti tcp:"${port}" >/dev/null 2>&1; then
    lsof -ti tcp:"${port}" | xargs kill >/dev/null 2>&1 || true
    sleep 1
  fi
}

stop_hot_reload() {
  mkdir -p "${COLLAB_DIR}"
  kill_pid_file "${COLLAB_DIR}/local-backend-hot.pid"
  kill_pid_file "${COLLAB_DIR}/local-worker-hot.pid"
  kill_pid_file "${COLLAB_DIR}/local-scheduler-hot.pid"
  kill_pid_file "${COLLAB_DIR}/local-frontend-hot.pid"
}

start_hot_reload() {
  require_cmd bun
  mkdir -p "${COLLAB_DIR}"
  stop_hot_reload

  free_dev_port 3005
  free_dev_port 3010
  free_dev_port 3011
  free_dev_port 42069
  free_dev_port 42070

  if [ ! -d "${ROOT_DIR}/node_modules" ]; then
    echo "Installing dependencies (bun install)..."
    (cd "${ROOT_DIR}" && bun install)
  fi

  echo "Starting backend hot reload (APP_MODE=api)..."
  (
    cd "${ROOT_DIR}"
    APP_MODE=api bun run dev:backend > "${COLLAB_DIR}/local-backend-hot.log" 2>&1 &
    echo $! > "${COLLAB_DIR}/local-backend-hot.pid"
  )

  local hot_start_worker="${HOT_RELOAD_START_WORKER:-1}"
  local hot_start_scheduler="${HOT_RELOAD_START_SCHEDULER:-0}"

  if [ "${hot_start_worker}" = "1" ]; then
    echo "Starting worker hot reload (APP_MODE=worker)..."
    (
      cd "${ROOT_DIR}"
      APP_MODE=worker bun run --filter backend dev:worker > "${COLLAB_DIR}/local-worker-hot.log" 2>&1 &
      echo $! > "${COLLAB_DIR}/local-worker-hot.pid"
    )
  fi

  if [ "${hot_start_scheduler}" = "1" ]; then
    echo "Starting scheduler hot reload (APP_MODE=scheduler)..."
    (
      cd "${ROOT_DIR}"
      APP_MODE=scheduler bun run --filter backend dev:scheduler > "${COLLAB_DIR}/local-scheduler-hot.log" 2>&1 &
      echo $! > "${COLLAB_DIR}/local-scheduler-hot.pid"
    )
  fi

  echo "Starting frontend hot reload..."
  (
    cd "${ROOT_DIR}"
    ENABLE_TUNNEL_HMR="${ENABLE_TUNNEL_HMR:-false}" \
      TUNNEL_FE_HOST="${TUNNEL_FE_HOST:-local-fe.scalebiz.chat}" \
      bun run dev:frontend > "${COLLAB_DIR}/local-frontend-hot.log" 2>&1 &
    echo $! > "${COLLAB_DIR}/local-frontend-hot.pid"
  )

  sleep 3
  local pid_files=(
    "${COLLAB_DIR}/local-backend-hot.pid"
    "${COLLAB_DIR}/local-frontend-hot.pid"
  )
  if [ "${hot_start_worker}" = "1" ]; then
    pid_files+=("${COLLAB_DIR}/local-worker-hot.pid")
  fi
  if [ "${hot_start_scheduler}" = "1" ]; then
    pid_files+=("${COLLAB_DIR}/local-scheduler-hot.pid")
  fi

  for pid_file in "${pid_files[@]}"; do
    local pid
    pid="$(cat "${pid_file}")"
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "Hot reload process failed to start: ${pid_file}"
      echo "Check logs in ${COLLAB_DIR}"
      stop_hot_reload
      exit 1
    fi
  done

  echo "Hot reload started:"
  echo "  backend pid $(cat "${COLLAB_DIR}/local-backend-hot.pid")"
  if [ "${hot_start_worker}" = "1" ]; then
    echo "  worker pid $(cat "${COLLAB_DIR}/local-worker-hot.pid")"
  fi
  if [ "${hot_start_scheduler}" = "1" ]; then
    echo "  scheduler pid $(cat "${COLLAB_DIR}/local-scheduler-hot.pid")"
  fi
  echo "  frontend pid $(cat "${COLLAB_DIR}/local-frontend-hot.pid")"
  echo "  logs: ${COLLAB_DIR}/local-backend-hot.log, ${COLLAB_DIR}/local-worker-hot.log, ${COLLAB_DIR}/local-scheduler-hot.log, ${COLLAB_DIR}/local-frontend-hot.log"
}

build_images() {
  require_cmd docker
  echo "Building backend image: scalebiz-backend:${BACKEND_IMAGE_TAG}"
  docker build \
    -t "scalebiz-backend:${BACKEND_IMAGE_TAG}" \
    -f "${ROOT_DIR}/apps/backend/Dockerfile" \
    "${ROOT_DIR}"

  echo "Building frontend image: scalebiz-frontend:${FRONTEND_IMAGE_TAG}"
  docker build \
    -t "scalebiz-frontend:${FRONTEND_IMAGE_TAG}" \
    -f "${ROOT_DIR}/apps/frontend/Dockerfile" \
    "${ROOT_DIR}"
}

require_local_images() {
  require_cmd docker
  local missing=0

  for image in "scalebiz-backend:${BACKEND_IMAGE_TAG}" "scalebiz-frontend:${FRONTEND_IMAGE_TAG}"; do
    if ! docker image inspect "${image}" >/dev/null 2>&1; then
      echo "Missing local image: ${image}"
      missing=1
    fi
  done

  if [ "${missing}" -ne 0 ]; then
    echo "Run with build enabled first: ./deploy/local/local-stack.sh up"
    exit 1
  fi
}

import_images_to_k3d() {
  require_cmd k3d
  require_local_images

  echo "Importing local images into k3d cluster '${CLUSTER_NAME}'..."
  k3d image import \
    "scalebiz-backend:${BACKEND_IMAGE_TAG}" \
    "scalebiz-frontend:${FRONTEND_IMAGE_TAG}" \
    -c "${CLUSTER_NAME}"
}

status() {
  echo "== k3d clusters =="
  k3d cluster list || true
  echo

  echo "== kubectl context =="
  kubectl config current-context || true
  echo

  if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    echo "== pods (${NAMESPACE}) =="
    kubectl -n "${NAMESPACE}" get pods || true
    echo
  else
    echo "Namespace ${NAMESPACE} not found."
    echo
  fi

  echo "== tunnel listeners =="
  for port in 3005 3010 3011; do
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Port ${port}: LISTEN"
    else
      echo "Port ${port}: not listening"
    fi
  done
  echo

  echo "== hot reload pids =="
  for proc in local-backend-hot local-worker-hot local-scheduler-hot local-frontend-hot; do
    local pid_file="${COLLAB_DIR}/${proc}.pid"
    if [ -f "${pid_file}" ]; then
      local pid
      pid="$(cat "${pid_file}")"
      if kill -0 "${pid}" 2>/dev/null; then
        echo "${proc}: running (pid ${pid})"
      else
        echo "${proc}: stale pid file"
      fi
    else
      echo "${proc}: not running"
    fi
  done
  echo

  echo "== quick checks =="
  curl --max-time 8 -sS -o /dev/null -w "local-api ingress: %{http_code}\n" \
    -H 'Host: local-api.scalebiz.chat' \
    http://127.0.0.1/health || true
  curl --max-time 8 -sS -o /dev/null -w "local-fe ingress: %{http_code}\n" \
    -H 'Host: local-fe.scalebiz.chat' \
    http://127.0.0.1/ || true
}

do_up() {
  local with_build="$1"
  local with_tunnel="$2"
  local with_hot_reload="$3"

  require_cmd k3d
  require_cmd kubectl
  require_cmd helm

  if [ "${with_build}" = "1" ]; then
    build_images
  else
    echo "Skipping image build (--no-build)."
  fi

  "${ROOT_DIR}/deploy/local/k3d-up.sh"
  import_images_to_k3d
  BACKEND_IMAGE_TAG="${BACKEND_IMAGE_TAG}" FRONTEND_IMAGE_TAG="${FRONTEND_IMAGE_TAG}" \
    "${ROOT_DIR}/deploy/local/helm-deploy-local.sh"

  if [ "${with_hot_reload}" = "1" ]; then
    start_hot_reload
  fi

  if [ "${with_tunnel}" = "1" ]; then
    if [ "${with_hot_reload}" = "1" ]; then
      "${ROOT_DIR}/deploy/local/k3s-tunnel-up.sh" --direct
    else
      "${ROOT_DIR}/deploy/local/k3s-tunnel-up.sh"
    fi
  else
    echo "Skipping tunnel startup (--no-tunnel)."
  fi

  echo
  status
}

do_down() {
  "${ROOT_DIR}/deploy/local/k3s-tunnel-down.sh" || true
  stop_hot_reload || true
}

do_destroy() {
  do_down
  "${ROOT_DIR}/deploy/local/helm-delete-local.sh" || true
  "${ROOT_DIR}/deploy/local/k3d-down.sh" || true
}

ACTION="${1:-help}"
if [ $# -gt 0 ]; then
  shift
fi

WITH_BUILD=1
WITH_TUNNEL=1
WITH_HOT_RELOAD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-build)
      WITH_BUILD=0
      ;;
    --no-tunnel)
      WITH_TUNNEL=0
      ;;
    --hot-reload)
      WITH_HOT_RELOAD=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

case "${ACTION}" in
  up)
    do_up "${WITH_BUILD}" "${WITH_TUNNEL}" "${WITH_HOT_RELOAD}"
    ;;
  down)
    do_down
    ;;
  status)
    status
    ;;
  destroy)
    do_destroy
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: ${ACTION}"
    usage
    exit 1
    ;;
esac
