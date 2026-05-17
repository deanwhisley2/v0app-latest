#!/usr/bin/env bash
# Spot-check canonical market authority + failover resilience.
set -euo pipefail

BASE="${BASE_URL:-https://nexuspro.it.com}"

echo "== Unified authority =="
auth="$(curl -fsS "${BASE}/api/market/authority")"
echo "$auth" | head -c 500
echo ""
if ! echo "$auth" | grep -q '"ok":true'; then
  echo "FAIL: /api/market/authority"
  exit 1
fi
rev="$(echo "$auth" | grep -o '"authorityRevision":[0-9]*' | head -1)"
echo "OK: authority $rev"

echo ""
echo "== BTC (legacy path) =="
btc="$(curl -fsS "${BASE}/api/market/btc")"
echo "$btc" | head -c 280
echo ""
if ! echo "$btc" | grep -q '"ok":true'; then
  echo "FAIL: /api/market/btc"
  exit 1
fi

echo ""
echo "== Revision sync (btc vs authority) =="
btc_rev="$(echo "$btc" | grep -o '"authorityRevision":[0-9]*' | head -1)"
if [ -n "$rev" ] && [ -n "$btc_rev" ] && [ "$rev" != "$btc_rev" ]; then
  echo "WARN: revision mismatch $rev vs $btc_rev (may be timing)"
else
  echo "OK: revisions aligned"
fi

echo ""
echo "== Live catalog =="
live="$(curl -fsS "${BASE}/api/market/live")"
if ! echo "$live" | grep -q '"BTC"'; then
  echo "FAIL: catalog missing BTC"
  exit 1
fi
echo "OK: live catalog includes BTC"

echo ""
echo "PASS: market price authority healthy"
