#!/bin/bash
# ============================================
# ScaleBiz - Frontend Dev Server
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUN_PID=""
TUNNEL_PID=""
TUNNEL_STARTED=0

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
TUNNEL_FE_HOST="${TUNNEL_FE_HOST:-$(read_env_var "TUNNEL_FE_HOST")}"
TUNNEL_FE_HOST="${TUNNEL_FE_HOST:-local-fe.scalebiz.chat}"

get_existing_tunnel_pid() {
    local token="$1"
    ps -ef | awk -v token="$token" '$0 ~ "cloudflared tunnel run --token " && index($0, token) {print $2; exit}'
}

start_tunnel() {
    if [ "${ENABLE_TUNNEL:-true}" != "true" ]; then
        echo "🚫 Tunnel disabled (set ENABLE_TUNNEL=true to enable)"
        return
    fi

    if ! command -v cloudflared &>/dev/null; then
        echo "⚠️  Skipping tunnel (cloudflared not installed)"
        return
    fi
    if [ -z "$CLOUDFLARED_TUNNEL_TOKEN" ]; then
        echo "⚠️  Skipping tunnel (CLOUDFLARED_TUNNEL_TOKEN not set)"
        return
    fi

    existing_pid="$(get_existing_tunnel_pid "$CLOUDFLARED_TUNNEL_TOKEN")"
    if [ -n "$existing_pid" ]; then
        echo "✅ Tunnel already running (PID: $existing_pid). Reusing existing tunnel."
        return
    fi

    mkdir -p "$SCRIPT_DIR/.collaborator"
    TUNNEL_LOG="$SCRIPT_DIR/.collaborator/cloudflared-frontend.log"

    echo "☁️  Tunnel: https://$TUNNEL_FE_HOST → :3005"
    echo "   (disable with ENABLE_TUNNEL=false)"
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

cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    [ -n "$BUN_PID" ] && kill "$BUN_PID" 2>/dev/null && wait "$BUN_PID" 2>/dev/null
    if [ "$TUNNEL_STARTED" -eq 1 ] && [ -n "$TUNNEL_PID" ]; then
        kill "$TUNNEL_PID" 2>/dev/null && wait "$TUNNEL_PID" 2>/dev/null
    fi
    exit 0
}
trap cleanup INT TERM

echo "🚀 Starting ScaleBiz Frontend..."
    
# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Install it via: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Kill stale processes on frontend ports
for port in 3005 42069 42070; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "🧹 Killing stale process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Start Cloudflare tunnel first so frontend url is ready before Vite boots.
start_tunnel

# Install deps if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd "$SCRIPT_DIR" && bun install
fi

echo ""
echo "▶️  Running: bun run dev:frontend (port 3005)"
echo "   Tunnel: https://$TUNNEL_FE_HOST → :3005"
echo "   HMR over tunnel: optional (set ENABLE_TUNNEL_HMR=true if needed)"
echo "-------------------------------------------"

cd "$SCRIPT_DIR"
export ENABLE_TUNNEL_HMR="${ENABLE_TUNNEL_HMR:-false}"
export TUNNEL_FE_HOST="$TUNNEL_FE_HOST"

bun run dev:frontend &
BUN_PID=$!
wait "$BUN_PID"
