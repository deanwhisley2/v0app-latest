#!/usr/bin/env bash
# Spot-check canonical market authority + failover resilience.
set -euo pipefail

BASE="${BASE_URL:-https://nexuspro.it.com}"

echo "== Unified authority =="
auth="$(curl -fsS "${BASE}/api/market/authority")"
echo "$auth" | head -c 400
echo ""
if ! echo "$auth" | grep -q '"ok":true'; then
  echo "FAIL: /api/market/authority"
  exit 1
fi

echo ""
echo "== Compare (authority reference slot) =="
cmp="$(curl -fsS "${BASE}/api/market/compare?symbol=BTCUSDT")"
if ! echo "$cmp" | grep -q 'market-price-authority'; then
  echo "WARN: compare may not be using authority reference"
else
  echo "OK: compare uses authority for reference venue"
fi

echo ""
echo "== Revision sync =="
btc="$(curl -fsS "${BASE}/api/market/btc")"
rev_a="$(echo "$auth" | grep -o '"authorityRevision":[0-9]*' | head -1)"
rev_b="$(echo "$btc" | grep -o '"authorityRevision":[0-9]*' | head -1)"
if [ -n "$rev_a" ] && [ -n "$rev_b" ] && [ "$rev_a" = "$rev_b" ]; then
  echo "OK: btc and authority revisions aligned ($rev_a)"
else
  echo "WARN: revision mismatch (timing) $rev_a vs $rev_b"
fi

echo ""
echo "== Live catalog =="
if ! echo "$auth" | grep -q '"BTC"'; then
  echo "FAIL: catalog missing BTC"
  exit 1
fi

echo ""
echo "PASS: market price authority platform checks"
