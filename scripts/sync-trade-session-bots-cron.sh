#!/usr/bin/env bash
# Settle trade session bot participants at scheduled end; promote booked → running at start.
# Run every 2–5 min on VPS cron, e.g.:
# */3 * * * * CRON_SECRET=... APP_URL=https://nexuspro.it.com bash /opt/nexus-pro/scripts/sync-trade-session-bots-cron.sh
set -euo pipefail
APP_URL="${APP_URL:-https://www.nexuspro.it.com}"
SECRET="${CRON_SECRET:?Set CRON_SECRET}"
curl -fsS -X POST "${APP_URL%/}/api/cron/sync-trade-session-bots" \
  -H "x-cron-secret: ${SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 120
