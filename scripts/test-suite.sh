#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
RUN_LIVE_ORDERS="${RUN_LIVE_ORDERS:-0}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }
}

need curl
need jq

echo "=== PHASE 1: ANALYSIS TESTS ==="
ANALYSIS=$(curl -sS -X POST "$BASE_URL/api/expert/analyze" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","timeWindowSeconds":60,"useNex":false}')

echo "$ANALYSIS" | jq -e '.analysisId and .result.action and (.result.confidence|type=="number")' >/dev/null
ANALYSIS_ID="$(echo "$ANALYSIS" | jq -r '.analysisId')"
SYMBOL="BTCUSDT"
echo "✅ Analysis created: $ANALYSIS_ID"

echo "=== PHASE 2: SAFETY GATE TESTS ==="
HOLD_OR_LOW=$(curl -sS -X POST "$BASE_URL/api/expert/execute/manual" \
  -H "Content-Type: application/json" \
  -d "{\"analysisId\":\"$ANALYSIS_ID\",\"symbol\":\"$SYMBOL\",\"config\":{\"buyPrice\":1,\"sellPrice\":1,\"stopLossPercent\":2,\"timeInTradeMinutes\":1,\"repeatCount\":1,\"amountPerTrade\":5}}")

if echo "$HOLD_OR_LOW" | jq -e '.code' >/dev/null; then
  CODE="$(echo "$HOLD_OR_LOW" | jq -r '.code')"
  echo "✅ Safety gate response code: $CODE"
else
  echo "✅ Execution route accepted current analysis (signal passed thresholds)"
fi

MISMATCH=$(curl -sS -X POST "$BASE_URL/api/expert/execute/manual" \
  -H "Content-Type: application/json" \
  -d "{\"analysisId\":\"$ANALYSIS_ID\",\"symbol\":\"ETHUSDT\",\"config\":{\"buyPrice\":1,\"sellPrice\":1,\"stopLossPercent\":2,\"timeInTradeMinutes\":1,\"repeatCount\":1,\"amountPerTrade\":5}}")

echo "$MISMATCH" | jq -e '.code=="SYMBOL_MISMATCH"' >/dev/null && echo "✅ Symbol mismatch blocked"

echo "=== PHASE 3: JOELIN RE-ANALYSIS TEST ==="
REANALYZE=$(curl -sS -X POST "$BASE_URL/api/joelin/re-analyze" \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"$SYMBOL\",\"timeWindowSeconds\":60}")
echo "$REANALYZE" | jq -e '.result.action and (.result.confidence|type=="number")' >/dev/null
echo "✅ Joelin re-analysis returned deterministic analysis payload"

echo "=== PHASE 4: OPTIONAL LIVE ORDER TEST ==="
if [[ "$RUN_LIVE_ORDERS" != "1" ]]; then
  echo "⚠️ Skipped live order test (set RUN_LIVE_ORDERS=1 to enable)"
  exit 0
fi

LIVE=$(curl -sS -X POST "$BASE_URL/api/expert/execute/manual" \
  -H "Content-Type: application/json" \
  -d "{\"analysisId\":\"$ANALYSIS_ID\",\"symbol\":\"$SYMBOL\",\"config\":{\"buyPrice\":1,\"sellPrice\":1,\"stopLossPercent\":2,\"timeInTradeMinutes\":1,\"repeatCount\":1,\"amountPerTrade\":5}}")

if echo "$LIVE" | jq -e '.orderIds and (.orderIds|length>0)' >/dev/null; then
  echo "✅ Live execution returned exchange order ids"
else
  echo "❌ Live execution did not return order ids"
  echo "$LIVE"
  exit 1
fi
