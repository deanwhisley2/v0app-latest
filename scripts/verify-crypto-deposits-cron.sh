#!/usr/bin/env bash
# Poll open USDT deposits and auto-credit. Run every 2–5 min on VPS cron, e.g.:
# */3 * * * * CRON_SECRET=... APP_URL=https://nexuspro.it.com bash /opt/nexus-pro/scripts/verify-crypto-deposits-cron.sh
set -euo pipefail
APP_URL="${APP_URL:-https://nexuspro.it.com}"
SECRET="${CRON_SECRET:?Set CRON_SECRET}"
curl -fsS -X POST "${APP_URL%/}/api/cron/verify-crypto-deposits" \
  -H "x-cron-secret: ${SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 120
