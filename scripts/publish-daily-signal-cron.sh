#!/usr/bin/env bash
# Publish one trade signal to Telegram channel.
# Runs at 9:00 AM (morning) and 5:00 PM (evening) via VPS crontab.
# Usage:
#   CRON_SECRET=... APP_URL=https://nexuspro.it.com bash /opt/nexus-pro/scripts/publish-daily-signal-cron.sh
set -euo pipefail
APP_URL="${APP_URL:-https://www.nexuspro.it.com}"
SECRET="${CRON_SECRET:?Set CRON_SECRET}"
curl -fsS -X POST "${APP_URL%/}/api/cron/publish-daily-signal" \
  -H "x-cron-secret: ${SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 120
