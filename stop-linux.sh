#!/usr/bin/env bash
# stop-linux.sh
# Stops all OneFlow ERP processes started by start-linux.sh

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/.oneflow.pids"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo "============================================================"
echo " OneFlow ERP — Stopping"
echo "============================================================"

if [[ ! -f "$PID_FILE" ]]; then
  warn "No PID file found at $PID_FILE"
  warn "Attempting to kill by port anyway..."

  fuser -k 8000/tcp  2>/dev/null && ok "Killed process on port 8000"  || true
  fuser -k 3000/tcp  2>/dev/null && ok "Killed process on port 3000"  || true
  fuser -k 4443/tcp  2>/dev/null && ok "Killed process on port 4443"  || true
  LOCAL_IP=$(hostname -I | awk '{print $1}')
  sudo iptables -t nat -D PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
  sudo iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1  --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
  sudo iptables -t nat -D OUTPUT -p tcp -d "$LOCAL_IP" --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
  sudo iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
  exit 0
fi

source "$PID_FILE"

kill_pid() {
  local name="$1" pid="$2"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null && ok "Stopped $name (PID $pid)" || warn "Could not stop $name (PID $pid)"
  else
    warn "$name (PID $pid) was not running"
  fi
}

kill_pid "HTTPS proxy" "$PROXY_PID"
kill_pid "Backend"     "$BACKEND_PID"
kill_pid "Frontend"    "$FRONTEND_PID"

# Remove iptables redirect rules
sudo iptables -t nat -D PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 4443 2>/dev/null && ok "iptables PREROUTING rule removed" || true
# Remove scoped OUTPUT rules (new style — destination-specific)
LOCAL_IP=$(hostname -I | awk '{print $1}')
sudo iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1  --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
sudo iptables -t nat -D OUTPUT -p tcp -d "$LOCAL_IP" --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
# Also remove the old broad OUTPUT rule in case a previous version left it behind
sudo iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
ok "iptables OUTPUT rules removed"

rm -f "$PID_FILE"
ok "PID file removed."

echo ""
echo "OneFlow stopped. Run ./start-linux.sh to start again."
