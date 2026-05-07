#!/usr/bin/env bash
# Concatenate ALL project Supabase DDL into one paste-ready file (Supabase Dashboard → SQL Editor).
# Safe to re-run on the DB if underlying scripts use IF NOT EXISTS / DROP POLICY IF EXISTS.
#
# Usage (from repo root):
#   bash scripts/build-supabase-master-bundle.sh
# Writes: docs/supabase-master-bundle.sql
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/docs/supabase-master-bundle.sql"

banner() {
  echo ""
  echo "-- ============================================================================"
  echo "-- SECTION: $1"
  echo "-- Source file: $2"
  echo "-- ============================================================================"
  echo ""
}

{
  echo "-- ============================================================================="
  echo "-- NEXUS / V0 APP — MASTER SUPABASE BUNDLE (auto-generated)"
  echo "-- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "-- Regenerate: bash scripts/build-supabase-master-bundle.sh"
  echo "--"
  echo "-- APPLY: Dashboard → SQL Editor → New query → paste entire file → Run"
  echo "-- IF SUPABASE OFFERS \"Run without RLS\" vs \"Run and enable RLS\": choose Run WITHOUT RLS."
  echo "--   Bulk auto-RLS assumes column user_id; Phase-2 tables use quoted \"userId\" → error 42703."
  echo "-- \"Destructive operations\" warning: OK if you want idempotent re-runs (DROP POLICY IF EXISTS)."
  echo "-- Prereqs: Supabase Auth enabled; table public.profiles exists (Supabase template)."
  echo "-- Communication: Browser → anon key + JWT; Server API routes → service role via"
  echo "--   NEXT_PUBLIC_SUPABASE_* + SUPABASE_SERVICE_ROLE_KEY (see docs/SUPABASE_COMPLETE_SQL_INVENTORY.md)"
  echo "-- ============================================================================="
  echo ""

  banner "Platform (profiles column, balances, verification, bot audit, RLS)" "supabase/trading_platform_schema.sql"
  cat "${ROOT}/supabase/trading_platform_schema.sql"

  banner "Auth trigger: profiles on signup (fixes duplicate profile inserts)" "supabase/fix_profiles_registration.sql"
  cat "${ROOT}/supabase/fix_profiles_registration.sql"

  banner "Blocked trade patterns (StrategyLearner RLS)" "supabase/blocked_trade_patterns.sql"
  cat "${ROOT}/supabase/blocked_trade_patterns.sql"

  banner "Expert / Joelin / persistence baseline (quoted public schema tables)" "docs/phase2-supabase-migration.sql"
  cat "${ROOT}/docs/phase2-supabase-migration.sql"

  banner "Incremental catch-up + profiles JSONB operational columns ALL-IN-ONE" "docs/supabase-all-deltas-in-order.sql"
  cat "${ROOT}/docs/supabase-all-deltas-in-order.sql"

  echo ""
  echo "-- END OF MASTER BUNDLE"
  echo ""
} > "${OUT}"

echo "Wrote ${OUT} ($(wc -l < "${OUT}" | tr -d ' ') lines)"
