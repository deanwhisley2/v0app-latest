#!/usr/bin/env bash
set -euo pipefail

# Calls cron reconciliation endpoint — set BASE_URL + CRON_SECRET on the runner.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${TREASURY_RECON_BASE_URL:-${BASE_URL:-http://127.0.0.1:3000}}"
SECRET="${CRON_SECRET:-}"

if [[ -z "${SECRET}" ]]; then
  echo "CRON_SECRET is required"; exit 1
fi

curl -sS -X POST "${BASE_URL}/api/cron/treasury-reconcile" \
  -H "x-cron-secret: ${SECRET}" \
  -H "Content-Type: application/json" \
  --data '{}' | jq .
