#!/usr/bin/env bash
# Spot-check canonical BTC + live market endpoints (failover when Binance geo-blocked).
set -euo pipefail

BASE="${BASE_URL:-https://nexuspro.it.com}"

echo "== BTC authority =="
btc="$(curl -fsS "${BASE}/api/market/btc")"
echo "$btc" | head -c 400
echo ""
if ! echo "$btc" | grep -q '"ok":true'; then
  echo "FAIL: /api/market/btc not ok"
  exit 1
fi
if echo "$btc" | grep -q '"provider":"binance"'; then
  echo "NOTE: primary provider is binance (region allows)"
else
  echo "OK: non-binance or failover provider active"
fi

echo ""
echo "== Live market =="
live="$(curl -fsS "${BASE}/api/market/live")"
echo "$live" | head -c 500
echo ""
if ! echo "$live" | grep -q '"ok":true'; then
  echo "FAIL: /api/market/live not ok"
  exit 1
fi
if ! echo "$live" | grep -q '"BTC"'; then
  echo "FAIL: catalog missing BTC"
  exit 1
fi

echo ""
echo "PASS: market price authority endpoints healthy"
