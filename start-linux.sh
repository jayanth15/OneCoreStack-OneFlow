#!/usr/bin/env bash
# start-linux.sh
# Starts OneFlow ERP on Linux with PROPER trusted HTTPS for PWA:
#
#   1. Creates a local Certificate Authority (CA) if none exists
#   2. Generates a server cert signed by that CA (trusted by devices that install the CA)
#   3. Copies the CA cert to public/ so phones can download and trust it
#   4. Starts the FastAPI backend (port 8000)
#   5. Starts the Next.js frontend (port 3000)
#   6. Starts the HTTPS proxy  (port 443 → 3000)
#
# Port 443 needs root — the script will sudo only the proxy process.
# Usage:  ./start-linux.sh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
CERTS="$FRONTEND/certs"
LOGS="$ROOT/logs"
PID_FILE="$ROOT/.oneflow.pids"

# ── Colours ───────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo "============================================================"
echo " OneFlow ERP — Starting"
echo "============================================================"

# ── Already running? ─────────────────────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
  warn "OneFlow appears to already be running (found $PID_FILE)."
  warn "Run ./stop-linux.sh first, or delete $PID_FILE if stale."
  exit 1
fi

mkdir -p "$LOGS" "$CERTS"

# ── Detect local IP ───────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
[[ -z "$IP" ]] && IP="localhost"
echo "Local IP: $IP"

# ────────────────────────────────────────────────────────────────────────
#  Certificate Authority + Server Certificate
#  (This is what makes Chrome on Android trust the HTTPS connection
#   and allow proper standalone PWA installation.)
# ────────────────────────────────────────────────────────────────────────

CA_KEY="$CERTS/oneflow-ca-key.pem"
CA_CERT="$CERTS/oneflow-ca-cert.pem"
SERVER_KEY="$CERTS/oneflow-key.pem"
SERVER_CERT="$CERTS/oneflow-cert.pem"
SERVER_CSR="$CERTS/oneflow.csr"
SERVER_EXT="$CERTS/oneflow-ext.cnf"

# Step 1: Create local CA (once — reused across server cert renewals)
if [[ ! -f "$CA_CERT" || ! -f "$CA_KEY" ]]; then
  echo ""
  echo "Creating OneFlow local Certificate Authority..."
  openssl genrsa -out "$CA_KEY" 2048 2>/dev/null
  openssl req -x509 -new -nodes \
    -key "$CA_KEY" \
    -sha256 -days 3650 \
    -subj "/C=IN/ST=Local/L=Local/O=OneFlow/CN=OneFlow Local CA" \
    -out "$CA_CERT"
  ok "CA created: $CA_CERT"
else
  ok "CA already exists."
fi

# Step 2: Create server cert signed by the CA (with IP in SAN)
if [[ ! -f "$SERVER_CERT" || ! -f "$SERVER_KEY" ]]; then
  echo "Creating server certificate for IP: $IP ..."

  # Generate private key for the server
  openssl genrsa -out "$SERVER_KEY" 2048 2>/dev/null

  # Create a CSR
  openssl req -new \
    -key "$SERVER_KEY" \
    -subj "/C=IN/ST=Local/L=Local/O=OneFlow/CN=$IP" \
    -out "$SERVER_CSR"

  # Create extensions file with SAN
  cat > "$SERVER_EXT" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment
subjectAltName=@alt_names

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
IP.2  = $IP
EOF

  # Sign with CA
  openssl x509 -req \
    -in "$SERVER_CSR" \
    -CA "$CA_CERT" \
    -CAkey "$CA_KEY" \
    -CAcreateserial \
    -out "$SERVER_CERT" \
    -days 3650 \
    -sha256 \
    -extfile "$SERVER_EXT"

  # Cleanup temp files
  rm -f "$SERVER_CSR" "$SERVER_EXT" "$CERTS/oneflow-ca-cert.srl"

  ok "Server certificate created and signed by CA."
else
  ok "Server certificate already exists."
fi

# Step 3: Copy CA cert to public/ so devices can download it at http://<ip>:3000/oneflow-ca.crt
cp "$CA_CERT" "$FRONTEND/public/oneflow-ca.crt"
ok "CA cert copied to public/oneflow-ca.crt (downloadable by devices)"

# ── Rebuild frontend with HTTPS env ───────────────────────────────────────
echo ""
echo "Refreshing .env.local (HTTPS URL)..."
cd "$FRONTEND"
node scripts/detect-backend.js
echo "Building frontend..."
npm run build --silent
ok "Frontend built."

# ── Start backend ─────────────────────────────────────────────────────────
echo ""
echo "Starting backend (port 8000)..."
cd "$BACKEND"
source venv-linux/bin/activate
nohup python -m uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 \
  > "$LOGS/backend.log" 2> "$LOGS/backend-error.log" &
BACKEND_PID=$!
ok "Backend PID: $BACKEND_PID"

# ── Start frontend ────────────────────────────────────────────────────────
echo "Starting frontend (port 3000)..."
cd "$FRONTEND"
nohup node node_modules/next/dist/bin/next start --port 3000 \
  > "$LOGS/frontend.log" 2> "$LOGS/frontend-error.log" &
FRONTEND_PID=$!
ok "Frontend PID: $FRONTEND_PID"

# Wait briefly for Next.js to come up before proxy starts
sleep 3

# ── Set up iptables redirect: 443 → 4443 (one sudo call, no root process needed) ─
echo "Setting up iptables redirect 443 → 4443..."
# Remove any old rules first to avoid duplicates
sudo iptables -t nat -D PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
sudo iptables -t nat -D OUTPUT     -p tcp -d 127.0.0.1 --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
sudo iptables -t nat -D OUTPUT     -p tcp -d "$IP"    --dport 443 -j REDIRECT --to-port 4443 2>/dev/null || true
# PREROUTING: redirect incoming connections from phones/other devices
sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 4443
# OUTPUT: only redirect HTTPS to THIS machine's own IP / localhost — NOT all internet traffic
sudo iptables -t nat -A OUTPUT     -p tcp -d 127.0.0.1 --dport 443 -j REDIRECT --to-port 4443
sudo iptables -t nat -A OUTPUT     -p tcp -d "$IP"    --dport 443 -j REDIRECT --to-port 4443
# Allow ports through UFW if active
if command -v ufw &>/dev/null && sudo ufw status | grep -q "active"; then
  sudo ufw allow 443/tcp  >/dev/null 2>&1 || true
  sudo ufw allow 4443/tcp >/dev/null 2>&1 || true
fi
ok "iptables: 443 → 4443"

# ── Start HTTPS proxy (port 4443 — no root needed) ────────────────────────────
echo "Starting HTTPS proxy (port 4443)..."
nohup node "$FRONTEND/https-proxy.js" \
  > "$LOGS/https-proxy.log" 2> "$LOGS/https-proxy-error.log" &
PROXY_PID=$!
ok "HTTPS proxy PID: $PROXY_PID"

# ── Save PIDs ─────────────────────────────────────────────────────────────
printf "BACKEND_PID=%d\nFRONTEND_PID=%d\nPROXY_PID=%d\n" \
  "$BACKEND_PID" "$FRONTEND_PID" "$PROXY_PID" > "$PID_FILE"

echo ""
echo "============================================================"
echo " OneFlow is running!"
echo ""
echo " ┌─────────────────────────────────────────────────────┐"
echo " │  FIRST-TIME SETUP FOR EACH PHONE (one-time only):  │"
echo " │                                                     │"
echo " │  1. Open http://$IP:3000/setup on the phone  │"
echo " │  2. Tap 'Download Certificate' and install it       │"
echo " │  3. Then open https://$IP              │"
echo " │  4. Install the PWA when Chrome prompts you         │"
echo " └─────────────────────────────────────────────────────┘"
echo ""
echo " After setup:  https://$IP"
echo " Logs:         $LOGS/"
echo " Stop:         ./stop-linux.sh"
