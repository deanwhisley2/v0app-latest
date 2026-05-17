#!/usr/bin/env bash
# Uganda launch readiness — production spot checks.
set -euo pipefail

BASE="${BASE_URL:-https://nexuspro.it.com}"
FAIL=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
warn() { echo "WARN: $1"; }

echo "== Core health =="
if curl -fsS "${BASE}/api/health" >/dev/null; then pass "GET /api/health"; else fail "GET /api/health"; fi

echo ""
echo "== Launch health =="
launch_json="$(curl -fsS "${BASE}/api/health/launch" 2>/dev/null || echo '{}')"
echo "$launch_json" | head -c 500
echo ""
if echo "$launch_json" | grep -q '"platform_launch"'; then
  if echo "$launch_json" | grep -q '"active":true'; then
    pass "platform launch window active"
  else
    fail "platform launch not active (apply migration + admin seed)"
  fi
else
  warn "platform_launch field missing (deploy launch slice)"
fi

echo ""
echo "== Public launch status =="
status_json="$(curl -fsS "${BASE}/api/platform-launch/status" 2>/dev/null || echo '{}')"
if echo "$status_json" | grep -q '"active":true'; then
  pass "GET /api/platform-launch/status"
else
  fail "launch status inactive or route missing"
fi

echo ""
echo "== Market authority =="
if bash "$(dirname "$0")/verify-market-price-authority.sh"; then
  pass "market price authority"
else
  fail "market price authority checks"
fi

echo ""
echo "== Referral API (auth required — smoke structure only) =="
ref_code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/api/user/referral")"
if [ "$ref_code" = "401" ]; then
  pass "referral route reachable (401 without token)"
else
  warn "referral route HTTP $ref_code"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "PASS: Uganda launch readiness checks"
  exit 0
fi
echo "FAIL: Uganda launch readiness — fix blockers above"
exit 1
