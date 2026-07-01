#!/usr/bin/env bash
#
# Keep the public Lookout demo (REAL backend + scraped thumbnails) online for
# judging. Idempotent: starts only what's down, prevents the Mac from sleeping,
# and auto-restarts the ngrok tunnel if it drops.
#
# Run it in a normal Terminal (NOT inside the IDE) so it survives the IDE
# closing, then leave the window open:
#
#     bash scripts/serve-public.sh
#
set -u

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
LOG="/tmp/lookout"
mkdir -p "$LOG"

DOMAIN="fantasy-tubby-mustang.ngrok-free.dev"
VITE_PORT=5173
API_PORT=8000
REDIS_PORT=6379

port_up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
log()     { printf '\033[36m[serve]\033[0m %s\n' "$*"; }

# --- Prevent sleep --------------------------------------------------------
if ! pgrep -x caffeinate >/dev/null; then
  log "preventing sleep (caffeinate)"
  caffeinate -dimsu >/dev/null 2>&1 &
fi

# --- Redis Stack (RediSearch / vector KNN) --------------------------------
if port_up "$REDIS_PORT"; then
  log "redis already up on :$REDIS_PORT"
else
  log "starting redis-stack-server"
  redis-stack-server --daemonize yes >"$LOG/redis.log" 2>&1
fi

# --- Backend (FastAPI) ----------------------------------------------------
if port_up "$API_PORT"; then
  log "backend already up on :$API_PORT"
else
  log "starting uvicorn backend"
  nohup ./venv-backend/bin/uvicorn lookout.app:app --host 127.0.0.1 --port "$API_PORT" \
    >"$LOG/backend.log" 2>&1 &
fi

# --- Frontend (Vite, REAL backend mode) -----------------------------------
if port_up "$VITE_PORT"; then
  log "frontend already up on :$VITE_PORT"
else
  log "starting vite (real backend, API base https://$DOMAIN)"
  VITE_USE_REAL_BACKEND=true VITE_API_BASE="https://$DOMAIN" nohup npm run dev >"$LOG/vite.log" 2>&1 &
fi

# --- ngrok tunnel: keep it alive forever ----------------------------------
log "public URL: https://$DOMAIN  (logs: $LOG/ngrok.log)"
log "watching tunnel — leave this window open. Ctrl-C to stop watching."
while true; do
  if ! pgrep -f "ngrok http $VITE_PORT" >/dev/null; then
    log "tunnel down — restarting ngrok"
    nohup ngrok http "$VITE_PORT" --url="https://$DOMAIN" --log=stdout \
      >"$LOG/ngrok.log" 2>&1 &
  fi
  sleep 15
done
