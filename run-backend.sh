#!/bin/bash
# ============================================
# ScaleBiz - Backend Dev Server + Tunnel
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUN_PID=""
WORKER_PID=""
TUNNEL_PID=""
TUNNEL_STARTED=0
DB_TUNNEL_PID=""
DB_TUNNEL_STARTED=0

# Read env vars
read_env_var() {
    local key="$1"
    local env_file="$SCRIPT_DIR/.env"
    [ ! -f "$env_file" ] && return 0
    awk -F= -v key="$key" '
        $1 == key { val = substr($0, index($0, "=") + 1); found = val }
        END { if (found != "") print found }
    ' "$env_file"
}

CLOUDFLARED_TUNNEL_TOKEN="${CLOUDFLARED_TUNNEL_TOKEN:-$(read_env_var "CLOUDFLARED_TUNNEL_TOKEN")}"
TUNNEL_API_HOST="${TUNNEL_API_HOST:-$(read_env_var "TUNNEL_API_HOST")}"
TUNNEL_API_HOST="${TUNNEL_API_HOST:-local-api.scalebiz.chat}"
TUNNEL_FE_HOST="${TUNNEL_FE_HOST:-$(read_env_var "TUNNEL_FE_HOST")}"
TUNNEL_FE_HOST="${TUNNEL_FE_HOST:-local-fe.scalebiz.chat}"
FRONTEND_URL="${FRONTEND_URL:-$(read_env_var "FRONTEND_URL")}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3005,http://localhost:3006,https://local-fe.scalebiz.chat}"
DATABASE_URL="${DATABASE_URL:-$(read_env_var "DATABASE_URL")}"
ENABLE_PROD_DB_TUNNEL="${ENABLE_PROD_DB_TUNNEL:-$(read_env_var "ENABLE_PROD_DB_TUNNEL")}"
ENABLE_PROD_DB_TUNNEL="${ENABLE_PROD_DB_TUNNEL:-false}"
PROD_DB_SSH_TARGET="${PROD_DB_SSH_TARGET:-$(read_env_var "PROD_DB_SSH_TARGET")}"
PROD_DB_SSH_TARGET="${PROD_DB_SSH_TARGET:-}"
PROD_DB_SSH_PORT="${PROD_DB_SSH_PORT:-$(read_env_var "PROD_DB_SSH_PORT")}"
PROD_DB_SSH_PORT="${PROD_DB_SSH_PORT:-22}"
PROD_DB_LOCAL_PORT="${PROD_DB_LOCAL_PORT:-$(read_env_var "PROD_DB_LOCAL_PORT")}"
PROD_DB_LOCAL_PORT="${PROD_DB_LOCAL_PORT:-5433}"
PROD_DB_REMOTE_HOST="${PROD_DB_REMOTE_HOST:-$(read_env_var "PROD_DB_REMOTE_HOST")}"
PROD_DB_REMOTE_HOST="${PROD_DB_REMOTE_HOST:-127.0.0.1}"
PROD_DB_REMOTE_PORT="${PROD_DB_REMOTE_PORT:-$(read_env_var "PROD_DB_REMOTE_PORT")}"
PROD_DB_REMOTE_PORT="${PROD_DB_REMOTE_PORT:-5432}"
PROD_DB_TUNNELED_DATABASE_URL="${PROD_DB_TUNNELED_DATABASE_URL:-$(read_env_var "PROD_DB_TUNNELED_DATABASE_URL")}"
PROD_DB_TUNNELED_DATABASE_URL="${PROD_DB_TUNNELED_DATABASE_URL:-}"

if [ "${ENABLE_PROD_DB_TUNNEL,,}" = "true" ] || [ "${ENABLE_PROD_DB_TUNNEL,,}" = "1" ] || [ "${ENABLE_PROD_DB_TUNNEL,,}" = "yes" ]; then
    if [ -z "$PROD_DB_TUNNELED_DATABASE_URL" ] || [ -z "$PROD_DB_SSH_TARGET" ]; then
        echo "❌ PROD_DB_TUNNELED_DATABASE_URL and PROD_DB_SSH_TARGET are required when ENABLE_PROD_DB_TUNNEL is true"
        exit 1
    fi
    DATABASE_URL="$PROD_DB_TUNNELED_DATABASE_URL"
fi

export FRONTEND_URL
export TUNNEL_FE_HOST
export TUNNEL_API_HOST
export CLOUDFLARED_TUNNEL_TOKEN
export DATABASE_URL
export PROD_DB_SSH_TARGET
export PROD_DB_SSH_PORT
export PROD_DB_LOCAL_PORT
export PROD_DB_REMOTE_HOST
export PROD_DB_REMOTE_PORT
export PROD_DB_TUNNELED_DATABASE_URL

cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    [ -n "$BUN_PID" ] && kill "$BUN_PID" 2>/dev/null && wait "$BUN_PID" 2>/dev/null
    [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null && wait "$WORKER_PID" 2>/dev/null
    if [ "$DB_TUNNEL_STARTED" -eq 1 ] && [ -n "$DB_TUNNEL_PID" ]; then
        kill "$DB_TUNNEL_PID" 2>/dev/null && wait "$DB_TUNNEL_PID" 2>/dev/null
    fi
    if [ "$TUNNEL_STARTED" -eq 1 ] && [ -n "$TUNNEL_PID" ]; then
        kill "$TUNNEL_PID" 2>/dev/null && wait "$TUNNEL_PID" 2>/dev/null
    fi
    exit 0
}
trap cleanup INT TERM

echo "🚀 Starting ScaleBiz Backend..."

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Install it via: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Kill stale processes on backend ports
for port in 3010 3011; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "🧹 Killing stale process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Install deps if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd "$SCRIPT_DIR" && bun install
fi

get_existing_tunnel_pid() {
    local token="$1"
    ps -ef | awk -v token="$token" '$0 ~ "cloudflared tunnel run --token " && index($0, token) {print $2; exit}'
}

get_existing_db_tunnel_pid() {
    local target="$1"
    local local_port="$2"
    local remote_host="$3"
    local remote_port="$4"
    ps -ef | awk -v target="$target" -v local_port="$local_port" -v remote_host="$remote_host" -v remote_port="$remote_port" '
        $0 ~ "ssh " &&
        index($0, target) &&
        index($0, "-L " local_port ":" remote_host ":" remote_port) {
            print $2
            exit
        }
    '
}

start_db_tunnel() {
    local db_tunnel_flag="${ENABLE_PROD_DB_TUNNEL,,}"
    if [ "$db_tunnel_flag" != "true" ] && [ "$db_tunnel_flag" != "1" ] && [ "$db_tunnel_flag" != "yes" ]; then
        echo "⚠️  Skipping prod DB tunnel (ENABLE_PROD_DB_TUNNEL=$ENABLE_PROD_DB_TUNNEL)"
        return
    fi
    if ! command -v ssh &>/dev/null; then
        echo "⚠️  Skipping prod DB tunnel (ssh not installed)"
        return
    fi

    mkdir -p "$SCRIPT_DIR/.collaborator"
    DB_TUNNEL_LOG="$SCRIPT_DIR/.collaborator/ssh-db-tunnel.log"
    existing_pid="$(get_existing_db_tunnel_pid "$PROD_DB_SSH_TARGET" "$PROD_DB_LOCAL_PORT" "$PROD_DB_REMOTE_HOST" "$PROD_DB_REMOTE_PORT")"
    if [ -n "$existing_pid" ]; then
        echo "✅ DB tunnel already running (PID: $existing_pid) on localhost:$PROD_DB_LOCAL_PORT"
        return
    fi

    local port_pid
    port_pid="$(lsof -ti:"$PROD_DB_LOCAL_PORT" 2>/dev/null | head -n 1 || true)"
    if [ -n "$port_pid" ]; then
        echo "⚠️  Port $PROD_DB_LOCAL_PORT is already in use (PID: $port_pid). Skipping DB tunnel start."
        return
    fi

    echo "🗄️  DB Tunnel: localhost:$PROD_DB_LOCAL_PORT → $PROD_DB_REMOTE_HOST:$PROD_DB_REMOTE_PORT via $PROD_DB_SSH_TARGET"
    echo "🔗 DATABASE_URL=$DATABASE_URL"
    ssh -N \
        -p "$PROD_DB_SSH_PORT" \
        -L "${PROD_DB_LOCAL_PORT}:${PROD_DB_REMOTE_HOST}:${PROD_DB_REMOTE_PORT}" \
        "$PROD_DB_SSH_TARGET" >"$DB_TUNNEL_LOG" 2>&1 &
    DB_TUNNEL_PID=$!
    DB_TUNNEL_STARTED=1
    sleep 2

    if kill -0 "$DB_TUNNEL_PID" 2>/dev/null; then
        echo "✅ DB tunnel running (PID: $DB_TUNNEL_PID)"
    else
        existing_pid="$(get_existing_db_tunnel_pid "$PROD_DB_SSH_TARGET" "$PROD_DB_LOCAL_PORT" "$PROD_DB_REMOTE_HOST" "$PROD_DB_REMOTE_PORT")"
        if [ -n "$existing_pid" ]; then
            echo "⚠️  DB tunnel process replaced before we could track PID. Reusing existing PID: $existing_pid"
            DB_TUNNEL_PID="$existing_pid"
            DB_TUNNEL_STARTED=0
            return
        fi
        echo "⚠️  DB tunnel failed to start. Check: $DB_TUNNEL_LOG"
        DB_TUNNEL_PID=""
        DB_TUNNEL_STARTED=0
    fi
}

start_tunnel() {
    if ! command -v cloudflared &>/dev/null; then
        echo "⚠️  Skipping tunnel (cloudflared not installed)"
        return
    fi
    if [ -z "$CLOUDFLARED_TUNNEL_TOKEN" ]; then
        echo "⚠️  Skipping tunnel (CLOUDFLARED_TUNNEL_TOKEN not set)"
        return
    fi

    mkdir -p "$SCRIPT_DIR/.collaborator"
    TUNNEL_LOG="$SCRIPT_DIR/.collaborator/cloudflared-backend.log"

    existing_pid="$(get_existing_tunnel_pid "$CLOUDFLARED_TUNNEL_TOKEN")"
    if [ -n "$existing_pid" ]; then
        echo "✅ Tunnel already running (PID: $existing_pid). Reusing existing tunnel."
        return
    fi

    echo "☁️  Tunnel: https://$TUNNEL_API_HOST → :3010"
    echo "   Frontend route from token: https://$TUNNEL_FE_HOST"
    cloudflared tunnel run --token "$CLOUDFLARED_TUNNEL_TOKEN" >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    TUNNEL_STARTED=1
    sleep 2
    if kill -0 "$TUNNEL_PID" 2>/dev/null; then
        echo "✅ Tunnel running (PID: $TUNNEL_PID)"
    else
        existing_pid="$(get_existing_tunnel_pid "$CLOUDFLARED_TUNNEL_TOKEN")"
        if [ -n "$existing_pid" ]; then
            echo "⚠️  Tunnel process replaced before we could track PID. Using existing PID: $existing_pid"
            TUNNEL_PID="$existing_pid"
            TUNNEL_STARTED=0
            return
        fi
        echo "⚠️  Tunnel failed to start. Check: $TUNNEL_LOG"
        TUNNEL_PID=""
        TUNNEL_STARTED=0
    fi
}

# Start Cloudflared tunnel (used by local FE/API exposure)
start_db_tunnel
start_tunnel


echo ""
echo "▶️  Running: bun run dev:backend (includes Baileys runtime + storage bootstrap) + bun run --filter backend dev:worker"
echo "-------------------------------------------"

cd "$SCRIPT_DIR"
bun run dev:backend &
BUN_PID=$!
bun run --filter backend dev:worker &
WORKER_PID=$!

echo "✅ API PID: $BUN_PID"
echo "✅ Worker PID: $WORKER_PID"

# Keep script alive while both processes are healthy.
# macOS bash (3.2) doesn't support `wait -n`, so we poll.
while true; do
    if ! kill -0 "$BUN_PID" 2>/dev/null; then
        echo "❌ API process stopped."
        cleanup
    fi
    if ! kill -0 "$WORKER_PID" 2>/dev/null; then
        echo "❌ Worker process stopped."
        cleanup
    fi
    sleep 1
done
