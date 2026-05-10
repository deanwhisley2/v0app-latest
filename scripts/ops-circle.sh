#!/usr/bin/env bash
set -euo pipefail

# One-command operational supervision loop:
# localhost -> GitHub auth -> VPS -> Supabase schema probe -> PM2/app/daemon signal checks
#
# Usage:
#   bash scripts/ops-circle.sh
#   VPS_HOST=67.159.52.40 VPS_USER=vpsuser bash scripts/ops-circle.sh

VPS_HOST="${VPS_HOST:-67.159.52.40}"
VPS_USER="${VPS_USER:-vpsuser}"
# Public site (override for curls from the VPS): https://nexuspro.it.com — internal Node often listens on :3000 behind nginx.
APP_URL="${APP_URL:-http://127.0.0.1:3000}"

echo "=== LOCAL: git + gh ==="
git status --short --branch
if command -v gh >/dev/null 2>&1; then
  gh auth status || true
else
  echo "WARN: gh not installed"
fi

echo
echo "=== VPS: core runtime ==="
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "pm2 list"

echo
echo "=== VPS: app health endpoints ==="
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "curl -sS '${APP_URL}/api/health' || true"
echo
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "curl -sS '${APP_URL}/api/grok/status' || true"
echo

echo "=== VPS: Supabase schema probe (profiles columns) ==="
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" '
  cd /opt/nexus-pro
  SUPA_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" .env.local | cut -d= -f2-)
  SRK=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d= -f2-)
  if [ -z "${SUPA_URL}" ] || [ -z "${SRK}" ]; then
    echo "FAIL: Missing Supabase env vars on VPS (.env.local)"
    exit 1
  fi
  curl -sS "$SUPA_URL/rest/v1/profiles?select=id,nexus_exchange_balances_snapshot,operational_workspace&limit=1" \
    -H "apikey: $SRK" \
    -H "Authorization: Bearer $SRK"
  echo
'

echo
echo "=== VPS: daemon lease + recent log signal ==="
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" '
  echo "--- last lease lines ---"
  grep -n "orchestration-lease\|worker-takeover\|daemon-heartbeat" /home/vpsuser/.pm2/logs/nexus-auto-trader-out.log | tail -n 20 || true
  echo "--- last daemon lines ---"
  tail -n 40 /home/vpsuser/.pm2/logs/nexus-auto-trader-out.log
'

echo
echo "=== VPS: app error tail ==="
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "tail -n 40 /home/vpsuser/.pm2/logs/nexus-pro-error.log || true"

echo
echo "Circle supervision check complete."
