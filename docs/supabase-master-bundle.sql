-- =============================================================================
-- NEXUS / V0 APP — MASTER SUPABASE BUNDLE (auto-generated)
-- Generated: 2026-05-07T23:14:10Z
-- Regenerate: bash scripts/build-supabase-master-bundle.sh
--
-- APPLY: Dashboard → SQL Editor → New query → paste entire file → Run
-- IF SUPABASE OFFERS "Run without RLS" vs "Run and enable RLS": choose Run WITHOUT RLS.
--   Bulk auto-RLS assumes column user_id; Phase-2 tables use quoted "userId" → error 42703.
-- "Destructive operations" warning: OK if you want idempotent re-runs (DROP POLICY IF EXISTS).
-- Prereqs: Supabase Auth enabled; table public.profiles exists (Supabase template).
-- Communication: Browser → anon key + JWT; Server API routes → service role via
--   NEXT_PUBLIC_SUPABASE_* + SUPABASE_SERVICE_ROLE_KEY (see docs/SUPABASE_COMPLETE_SQL_INVENTORY.md)
-- =============================================================================


-- ============================================================================
-- SECTION: Platform (profiles column, balances, verification, bot audit, RLS)
-- Source file: supabase/trading_platform_schema.sql
-- ============================================================================

-- =============================================================================
-- Nexus Pro — Supabase schema additions
-- Project URL: https://unsvovnjfvhaccjnrurf.supabase.co
-- Run this entire script once in: Dashboard → SQL Editor → New query → Run
-- Assumes public.profiles already exists (do not recreate it here).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Profiles: email verification flag (existing rows stay verified by default)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.is_verified IS
  'Set FALSE on signup until email code is verified; existing users remain TRUE.';

-- -----------------------------------------------------------------------------
-- 2) Aggregated balances per user (updated by bots via your API + service role)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0,
  current_stake NUMERIC(15, 2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_balances_user_id_key UNIQUE (user_id)
);

-- Legacy installs: CREATE TABLE IF NOT EXISTS skips DDL; indexes/policies need snake_case user_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_balances'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_balances' AND column_name = 'userId'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_balances' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.user_balances RENAME COLUMN "userId" TO user_id;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_balances' AND column_name = 'userid'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_balances' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.user_balances RENAME COLUMN userid TO user_id;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.user_balances IS
  'Running totals: bot PnL increases total_earnings and available_balance; optional stake_delta adjusts current_stake.';

CREATE INDEX IF NOT EXISTS user_balances_user_id_idx ON public.user_balances(user_id);

-- -----------------------------------------------------------------------------
-- 3) Email verification codes (15‑minute TTL enforced in application logic)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_verifications'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_verifications' AND column_name = 'userId'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_verifications' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.email_verifications RENAME COLUMN "userId" TO user_id;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_verifications' AND column_name = 'userid'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_verifications' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.email_verifications RENAME COLUMN userid TO user_id;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_verifications_user_id_idx ON public.email_verifications(user_id);
CREATE INDEX IF NOT EXISTS email_verifications_email_lower_idx ON public.email_verifications(lower(email));

-- -----------------------------------------------------------------------------
-- 4) Optional: append-only log of each bot trade (audit / reconciliation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_trade_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pnl NUMERIC(15, 2) NOT NULL,
  current_stake_delta NUMERIC(15, 2) NOT NULL DEFAULT 0,
  symbol TEXT,
  strategy TEXT,
  external_ref TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bot_trade_records'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bot_trade_records' AND column_name = 'userId'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bot_trade_records' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.bot_trade_records RENAME COLUMN "userId" TO user_id;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bot_trade_records' AND column_name = 'userid'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bot_trade_records' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.bot_trade_records RENAME COLUMN userid TO user_id;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.bot_trade_records IS
  'One row per recorded bot trade; optional external_ref dedupes retries (partial unique index below).';

CREATE INDEX IF NOT EXISTS bot_trade_records_user_created_idx
  ON public.bot_trade_records(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS bot_trade_records_external_ref_unique
  ON public.bot_trade_records(external_ref)
  WHERE external_ref IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5) Row Level Security (JWT users read own balance only; writes via service role API)
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_trade_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own balance" ON public.user_balances;
CREATE POLICY "Users can view own balance"
  ON public.user_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own trade records" ON public.bot_trade_records;
CREATE POLICY "Users can view own trade records"
  ON public.bot_trade_records
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- email_verifications / INSERT UPDATE: intended for service_role only (no policies).

-- Env for Next.js API (never expose service role to the browser):
--   NEXT_PUBLIC_SUPABASE_URL=https://unsvovnjfvhaccjnrurf.supabase.co
--   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
--   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
--   PROCESS_TRADE_SECRET=<random secret — bots send header x-trade-secret>

-- ============================================================================
-- SECTION: Auth trigger: profiles on signup (fixes duplicate profile inserts)
-- Source file: supabase/fix_profiles_registration.sql
-- ============================================================================

-- =============================================================================
-- Fix duplicate profiles_pkey during registration
--
-- Cause: BOTH (A) trigger on auth.users INSERT and (B) Next.js insert run for same id.
-- App fix: use upsert onConflict id (see app/auth/register/page.tsx).
--
-- Optional DB hardening: trigger uses ON CONFLICT DO NOTHING so duplicate inserts never error.
-- =============================================================================

-- Grants (safe to re-run)
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO service_role;

-- Trigger function: create stub profile if missing; never fail on duplicate id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, avatar_url, is_verified, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NULL,
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Optional RLS (enable after grants + policies tested)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
-- CREATE POLICY "profiles_select_own"
--   ON public.profiles FOR SELECT TO authenticated
--   USING (id = auth.uid());
--
-- DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
-- CREATE POLICY "profiles_insert_own"
--   ON public.profiles FOR INSERT TO authenticated
--   WITH CHECK (id = auth.uid());
--
-- DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
-- CREATE POLICY "profiles_update_own"
--   ON public.profiles FOR UPDATE TO authenticated
--   USING (id = auth.uid())
--   WITH CHECK (id = auth.uid());

-- =============================================================================
-- destructive_reset_optional.sql — ONLY if you intentionally wipe ALL accounts
-- WARNING: Deletes every auth user and profile. Irreversible.
-- =============================================================================
-- TRUNCATE auth.users CASCADE;  -- May be restricted on hosted Supabase; use Dashboard Users UI instead.

-- ============================================================================
-- SECTION: Blocked trade patterns (StrategyLearner RLS)
-- Source file: supabase/blocked_trade_patterns.sql
-- ============================================================================

-- Persist StrategyLearner blocked patterns per user (cross-restart).
-- Run once in Supabase SQL Editor after reviewing RLS.

CREATE TABLE IF NOT EXISTS public.blocked_trade_patterns (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  pattern_key TEXT NOT NULL,
  action TEXT NOT NULL,
  signal TEXT NOT NULL,
  win_rate DOUBLE PRECISION NOT NULL,
  total_trades INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blocked_trade_patterns_pkey PRIMARY KEY (user_id, pattern_key)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'blocked_trade_patterns'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'blocked_trade_patterns' AND column_name = 'userId'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'blocked_trade_patterns' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.blocked_trade_patterns RENAME COLUMN "userId" TO user_id;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'blocked_trade_patterns' AND column_name = 'userid'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'blocked_trade_patterns' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.blocked_trade_patterns RENAME COLUMN userid TO user_id;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS blocked_trade_patterns_user_idx
  ON public.blocked_trade_patterns (user_id);

ALTER TABLE public.blocked_trade_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_patterns_select_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_select_own"
  ON public.blocked_trade_patterns FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_patterns_insert_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_insert_own"
  ON public.blocked_trade_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_patterns_update_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_update_own"
  ON public.blocked_trade_patterns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_patterns_delete_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_delete_own"
  ON public.blocked_trade_patterns FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.blocked_trade_patterns IS
  'Strategy learner blocked patterns; replayed into PreTradeValidator on dashboard load.';

-- ============================================================================
-- SECTION: Expert / Joelin / persistence baseline (quoted public schema tables)
-- Source file: docs/phase2-supabase-migration.sql
-- ============================================================================

-- Phase 2 tables for Expert/Joelin/Auto-Trader
-- Run in Supabase SQL Editor (full baseline for a new project or full replay).
--
-- HOW TO APPLY (step-by-step, open in IDE — do not paste from chat):
--   docs/supabase-operator-guide.md  ← all-in-one manual + checklist (same docs/ folder as this file)
--
-- Incremental deltas (existing DB):
--   docs/supabase-delta-governance-simulation.sql
--   docs/supabase-delta-temporal-evolution.sql
--   docs/supabase-delta-meta-governance.sql
--   docs/supabase-delta-pluralistic-cognitive.sql
--   docs/supabase-delta-institutional-governance.sql
--   docs/supabase-delta-epistemic-calibration.sql
--   docs/supabase-delta-causal-governance.sql
-- All incremental packs in ONE paste (catch-up): docs/supabase-all-deltas-in-order.sql
--
-- Short checklist only: docs/SUPABASE_APPLY_PIPELINE.md
-- When to run what: docs/SUPABASE_RUN_LATER.md

CREATE TABLE IF NOT EXISTS "AnalysisHistory" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "timeWindow" INT NOT NULL,
  action TEXT NOT NULL,
  confidence INT NOT NULL,
  "rawConfidence" DOUBLE PRECISION,
  "calibratedConfidence" DOUBLE PRECISION,
  "confidenceExplanation" JSONB,
  reasons TEXT[],
  "entryPrice" FLOAT,
  timestamp TIMESTAMP DEFAULT NOW(),
  "tradeExecuted" BOOLEAN DEFAULT FALSE,
  "tradeResult" JSONB,
  "ttlSeconds" INT
);

-- Existing deployments: add column if table predates ttlSeconds
ALTER TABLE "AnalysisHistory" ADD COLUMN IF NOT EXISTS "ttlSeconds" INT;
ALTER TABLE "AnalysisHistory" ADD COLUMN IF NOT EXISTS "rawConfidence" DOUBLE PRECISION;
ALTER TABLE "AnalysisHistory" ADD COLUMN IF NOT EXISTS "calibratedConfidence" DOUBLE PRECISION;
ALTER TABLE "AnalysisHistory" ADD COLUMN IF NOT EXISTS "confidenceExplanation" JSONB;

CREATE TABLE IF NOT EXISTS "NotificationRecord" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence INT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  deleted BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "TradeSession" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  "totalAmount" FLOAT NOT NULL,
  "usedAmount" FLOAT DEFAULT 0,
  "startTime" TIMESTAMP DEFAULT NOW(),
  "endTime" TIMESTAMP,
  config JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS "TradeOrder" (
  id TEXT PRIMARY KEY,
  "sessionId" TEXT REFERENCES "TradeSession"(id),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  type TEXT NOT NULL,
  price FLOAT NOT NULL,
  quantity FLOAT NOT NULL,
  "quoteAmount" FLOAT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "filledAt" TIMESTAMP
);

-- Expert trade session chat / timeline (restored on refresh when service role + table exist)
CREATE TABLE IF NOT EXISTS "ExpertChatMessage" (
  id TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "TradeSession"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  data JSONB
);

CREATE INDEX IF NOT EXISTS idx_expert_chat_session ON "ExpertChatMessage" ("sessionId");
CREATE INDEX IF NOT EXISTS idx_expert_chat_ts ON "ExpertChatMessage" (timestamp);

-- Trade intelligence memory (completed lifecycle outcomes only)
CREATE TABLE IF NOT EXISTS "TradeMemory" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol TEXT NOT NULL,
  "marketRegime" TEXT NOT NULL DEFAULT 'UNKNOWN',
  decision TEXT NOT NULL,
  "rawConfidence" DOUBLE PRECISION,
  "calibratedConfidence" DOUBLE PRECISION,
  "signalStreak" INT,
  "kalmanScore" DOUBLE PRECISION,
  "liquidityScore" DOUBLE PRECISION,
  "sentimentScore" DOUBLE PRECISION,
  "raceScore" DOUBLE PRECISION,
  "entryPrice" DOUBLE PRECISION,
  "exitPrice" DOUBLE PRECISION,
  quantity DOUBLE PRECISION,
  "pnlUsd" DOUBLE PRECISION,
  "holdDurationMs" BIGINT,
  "wasWin" BOOLEAN,
  "cooldownActive" BOOLEAN,
  notes TEXT,
  "analysisId" TEXT,
  "sessionId" TEXT
);

CREATE INDEX IF NOT EXISTS idx_trade_memory_symbol ON "TradeMemory" (symbol);
CREATE INDEX IF NOT EXISTS idx_trade_memory_regime ON "TradeMemory" ("marketRegime");
CREATE INDEX IF NOT EXISTS idx_trade_memory_created_at ON "TradeMemory" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_trade_memory_was_win ON "TradeMemory" ("wasWin");

-- Runtime state authority tables (restart-safe, multi-instance-safe execution state)
CREATE TABLE IF NOT EXISTS "PositionState" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "sessionId" TEXT,
  status TEXT NOT NULL,
  quantity DOUBLE PRECISION,
  "entryPrice" DOUBLE PRECISION,
  version INT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_position_state_user_symbol ON "PositionState" ("userId", symbol);
ALTER TABLE "PositionState" ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "CooldownState" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "cooldownUntil" TIMESTAMPTZ,
  "pauseUntil" TIMESTAMPTZ,
  "lastExecutionAt" TIMESTAMPTZ,
  "tradeCountWindow" INT,
  "tradeWindowStart" TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cooldown_state_user_symbol ON "CooldownState" ("userId", symbol);
ALTER TABLE "CooldownState" ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "RiskState" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "realizedPnlUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "consecutiveLosses" INT NOT NULL DEFAULT 0,
  "tradeCount" INT NOT NULL DEFAULT 0,
  "pauseUntil" TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_state_user_day ON "RiskState" ("userId", "dayKey");
ALTER TABLE "RiskState" ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "ExecutionState" (
  id TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL,
  "lastError" TEXT,
  "reconciliationStatus" TEXT DEFAULT 'HEALTHY',
  "lastReconciledAt" TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "ExecutionState" ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE "ExecutionState" ADD COLUMN IF NOT EXISTS "reconciliationStatus" TEXT DEFAULT 'HEALTHY';
ALTER TABLE "ExecutionState" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "EngineRuntimeStateEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "sessionId" TEXT,
  "stateType" TEXT NOT NULL,
  transition TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_runtime_event_user_created ON "EngineRuntimeStateEvent" ("userId", "createdAt" DESC);

-- Lightweight concurrency primitives
CREATE TABLE IF NOT EXISTS "ExecutionLock" (
  "lockId" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "acquiredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_execution_lock_expires ON "ExecutionLock" ("expiresAt");

CREATE TABLE IF NOT EXISTS "ExecutionIdempotency" (
  "eventKey" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "sessionId" TEXT,
  status TEXT NOT NULL,
  response JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_execution_idempotency_user_created ON "ExecutionIdempotency" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ExchangeReconciliationLog" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "dbOrderId" TEXT,
  "exchangeOrderId" TEXT,
  divergence TEXT NOT NULL,
  "actionTaken" TEXT,
  "recoveryStatus" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_reconcile_log_session_created ON "ExchangeReconciliationLog" ("sessionId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "StartupRecoveryState" (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  reason TEXT,
  "lastRunAt" TIMESTAMPTZ,
  "lastCompletedAt" TIMESTAMPTZ,
  "unresolvedCount" INT NOT NULL DEFAULT 0,
  details JSONB,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "DaemonSymbolState" (
  id TEXT PRIMARY KEY,
  "daemonType" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "positionStatus" TEXT NOT NULL DEFAULT 'FLAT',
  "openSessionId" TEXT,
  "openQuantity" DOUBLE PRECISION,
  "openEntryPrice" DOUBLE PRECISION,
  "openEntryCost" DOUBLE PRECISION,
  "streakAction" TEXT,
  "streakCount" INT NOT NULL DEFAULT 0,
  "streakUpdatedAt" TIMESTAMPTZ,
  "lastExecutionAt" TIMESTAMPTZ,
  "lastEntryAt" TIMESTAMPTZ,
  "tradeCountWindow" INT NOT NULL DEFAULT 0,
  "totalLossWindow" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("daemonType", "userId", symbol)
);

CREATE TABLE IF NOT EXISTS "OrchestrationLease" (
  "leaseKey" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "heartbeatAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "EngineGovernanceState" (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'NORMAL',
  "healthState" TEXT NOT NULL DEFAULT 'HEALTHY',
  reason TEXT,
  "maxPortfolioExposureUsd" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "maxSymbolExposureUsd" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "maxActiveSessions" INT NOT NULL DEFAULT 20,
  "maxConcurrentLiquidations" INT NOT NULL DEFAULT 5,
  "maxDailyLossUsd" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "marketRegime" TEXT NOT NULL DEFAULT 'TRENDING',
  "systemicRiskState" TEXT NOT NULL DEFAULT 'NORMAL',
  "effectiveExposureMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "correlationUncertainty" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EngineGovernanceState" ADD COLUMN IF NOT EXISTS "marketRegime" TEXT NOT NULL DEFAULT 'TRENDING';
ALTER TABLE "EngineGovernanceState" ADD COLUMN IF NOT EXISTS "systemicRiskState" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "EngineGovernanceState" ADD COLUMN IF NOT EXISTS "effectiveExposureMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "EngineGovernanceState" ADD COLUMN IF NOT EXISTS "correlationUncertainty" DOUBLE PRECISION NOT NULL DEFAULT 0.2;

CREATE TABLE IF NOT EXISTS "GovernanceApprovalLog" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "workerId" TEXT NOT NULL,
  lane TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  "governanceMode" TEXT NOT NULL,
  "healthState" TEXT NOT NULL,
  "exposureSnapshot" JSONB,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_gov_approval_created ON "GovernanceApprovalLog" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_gov_approval_symbol_created ON "GovernanceApprovalLog" (symbol, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AssetCorrelationState" (
  id TEXT PRIMARY KEY,
  "baseSymbol" TEXT NOT NULL,
  "relatedSymbol" TEXT NOT NULL,
  cluster TEXT NOT NULL,
  correlation DOUBLE PRECISION NOT NULL,
  "betaWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "volatilityWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("baseSymbol", "relatedSymbol")
);
CREATE INDEX IF NOT EXISTS idx_asset_corr_base ON "AssetCorrelationState" ("baseSymbol");
CREATE INDEX IF NOT EXISTS idx_asset_corr_cluster ON "AssetCorrelationState" (cluster);

CREATE TABLE IF NOT EXISTS "LiveStructureState" (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL UNIQUE,
  "marketRegime" TEXT NOT NULL,
  "systemicRiskState" TEXT NOT NULL,
  "volatilityScore" DOUBLE PRECISION NOT NULL,
  "liquidityStressScore" DOUBLE PRECISION NOT NULL,
  "correlationScore" DOUBLE PRECISION NOT NULL,
  "regimeConfidence" DOUBLE PRECISION NOT NULL,
  "transitionFrom" TEXT,
  "transitionAt" TIMESTAMPTZ,
  details JSONB,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "MarketStructureSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope TEXT NOT NULL,
  "marketRegime" TEXT NOT NULL,
  "systemicRiskState" TEXT NOT NULL,
  "volatilityScore" DOUBLE PRECISION NOT NULL,
  "liquidityStressScore" DOUBLE PRECISION NOT NULL,
  "correlationScore" DOUBLE PRECISION NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_market_structure_scope_created ON "MarketStructureSnapshot" (scope, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "RegimePerformanceSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "marketRegime" TEXT NOT NULL,
  trades INT NOT NULL,
  "winRate" DOUBLE PRECISION NOT NULL,
  "avgPnlUsd" DOUBLE PRECISION NOT NULL,
  "avgHoldDurationMs" DOUBLE PRECISION NOT NULL,
  "confidenceReliability" DOUBLE PRECISION NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_regime_perf_user_created ON "RegimePerformanceSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "GovernanceEffectivenessSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  approvals INT NOT NULL,
  denials INT NOT NULL,
  "denialRate" DOUBLE PRECISION NOT NULL,
  "blockedWouldBeWinRate" DOUBLE PRECISION,
  "approvedLossRate" DOUBLE PRECISION,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_gov_effect_user_created ON "GovernanceEffectivenessSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ExecutionQualitySnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "avgFillLatencyMs" DOUBLE PRECISION NOT NULL,
  "avgQuotePerSecond" DOUBLE PRECISION,
  "stressPenalty" DOUBLE PRECISION NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_exec_quality_user_created ON "ExecutionQualitySnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ConfidenceAuditSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "sampleSize" INT NOT NULL,
  "highConfidenceLosses" INT NOT NULL,
  "lowConfidenceWins" INT NOT NULL,
  "reliabilityError" DOUBLE PRECISION NOT NULL,
  "byRegime" JSONB
);
CREATE INDEX IF NOT EXISTS idx_conf_audit_user_created ON "ConfidenceAuditSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "BehavioralBaseline" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "windowDays" INT NOT NULL DEFAULT 14,
  metrics JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "windowDays")
);

CREATE TABLE IF NOT EXISTS "StabilitySnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "driftLevel" TEXT NOT NULL,
  "stabilityPressure" DOUBLE PRECISION NOT NULL,
  "regimeInstabilityScore" DOUBLE PRECISION NOT NULL,
  "executionConsistencyScore" DOUBLE PRECISION NOT NULL,
  "baselineMetrics" JSONB,
  "currentMetrics" JSONB,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_stability_user_created ON "StabilitySnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "StabilityPressureHistory" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "stabilityPressure" DOUBLE PRECISION NOT NULL,
  "driftLevel" TEXT NOT NULL,
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_stab_pressure_user_created ON "StabilityPressureHistory" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "DriftEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  subsystem TEXT NOT NULL,
  "driftLevel" TEXT NOT NULL,
  "baselineValue" DOUBLE PRECISION,
  "currentValue" DOUBLE PRECISION,
  "deltaRatio" DOUBLE PRECISION,
  reason TEXT,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_drift_event_user_created ON "DriftEvent" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "DriftDetectionState" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "driftLevel" TEXT NOT NULL,
  "stabilityPressure" DOUBLE PRECISION NOT NULL,
  details JSONB,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constitutional evolution governance (proposals / checkpoints / audit — evaluation-only; no autonomous apply)
CREATE TABLE IF NOT EXISTS "AdaptationProposal" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  status TEXT NOT NULL,
  subsystem TEXT NOT NULL,
  "parameterKey" TEXT NOT NULL,
  "currentValueSnapshot" JSONB,
  "proposedValue" JSONB NOT NULL,
  "expectedImprovement" TEXT,
  evidence JSONB,
  "stabilityImpactEstimate" JSONB,
  "rollbackPlan" TEXT,
  "evaluatorConfidence" DOUBLE PRECISION,
  "evaluationVerdict" TEXT,
  "evaluationDetails" JSONB,
  "rejectionReason" TEXT,
  "reviewedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_adapt_proposal_user_created ON "AdaptationProposal" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_adapt_proposal_status ON "AdaptationProposal" ("userId", status);

CREATE TABLE IF NOT EXISTS "RollbackCheckpoint" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  label TEXT NOT NULL,
  "proposalId" TEXT,
  snapshot JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rollback_ckpt_user_created ON "RollbackCheckpoint" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EvolutionAuditEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "proposalId" TEXT,
  "eventType" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_evolution_audit_user_created ON "EvolutionAuditEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_audit_proposal ON "EvolutionAuditEvent" ("proposalId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_audit_event_type ON "EvolutionAuditEvent" ("userId", "eventType", "createdAt" DESC);

-- Sandboxed simulation / shadow execution (never mutates EngineGovernanceState or sends live orders)
CREATE TABLE IF NOT EXISTS "SandboxGovernanceProfile" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  label TEXT NOT NULL,
  "governanceOverrides" JSONB NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sandbox_profile_user_created ON "SandboxGovernanceProfile" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SimulationRun" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  "replayFrom" TIMESTAMPTZ,
  "replayTo" TIMESTAMPTZ,
  "proposalId" TEXT,
  "sandboxProfileId" TEXT,
  "baselineGovernanceFingerprint" TEXT,
  "inputSnapshot" JSONB NOT NULL,
  "shadowExecutionResult" JSONB,
  "counterfactualComparison" JSONB,
  "adaptationSimulationSummary" JSONB,
  "simulationReliability" JSONB
);
CREATE INDEX IF NOT EXISTS idx_sim_run_user_created ON "SimulationRun" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_sim_run_symbol ON "SimulationRun" ("userId", symbol, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ComparativeSimulationRun" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "suiteLabel" TEXT NOT NULL,
  "replayFrom" TIMESTAMPTZ,
  "replayTo" TIMESTAMPTZ,
  "proposalId" TEXT,
  "sandboxProfileId" TEXT,
  "baselineRealityPnlUsd" DOUBLE PRECISION NOT NULL,
  "worldsDefinition" JSONB NOT NULL,
  "perWorldResults" JSONB NOT NULL,
  "evolutionFitnessSnapshot" JSONB NOT NULL,
  "survivabilityProfile" JSONB NOT NULL,
  "crossWorldComparison" JSONB NOT NULL,
  "metaSimulationReliability" JSONB NOT NULL,
  "stressScenarioResults" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comp_sim_user_created ON "ComparativeSimulationRun" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_comp_sim_symbol ON "ComparativeSimulationRun" ("userId", symbol, "createdAt" DESC);

-- Temporal evolution — long-horizon era replay + persistence (observational; no prod mutation)
CREATE TABLE IF NOT EXISTS "TemporalEvolutionRun" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "suiteLabel" TEXT NOT NULL,
  "replayFrom" TIMESTAMPTZ,
  "replayTo" TIMESTAMPTZ,
  "proposalId" TEXT,
  "sandboxProfileId" TEXT,
  "eraSplitMode" TEXT NOT NULL,
  "eraStrideDays" INT,
  "erasDefinition" JSONB NOT NULL,
  "perEraResults" JSONB NOT NULL,
  "longHorizonFitnessSnapshot" JSONB NOT NULL,
  "evolutionPersistenceRecord" JSONB NOT NULL,
  "structuralCycleStressSummary" JSONB NOT NULL,
  "temporalSurvivabilityProfile" JSONB NOT NULL,
  "temporalReliability" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_temp_evo_user_created ON "TemporalEvolutionRun" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_temp_evo_symbol ON "TemporalEvolutionRun" ("userId", symbol, "createdAt" DESC);

-- Meta-governance supervision (adaptation-process oversight — read-mostly aggregates of audits & runs)
CREATE TABLE IF NOT EXISTS "MetaGovernanceSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "supervisoryWindowDays" INT NOT NULL,
  "metaStabilityScore" DOUBLE PRECISION NOT NULL,
  "adaptationDisciplineProfile" JSONB NOT NULL,
  "constitutionalIntegrityStatus" JSONB NOT NULL,
  "recursivePressure" JSONB NOT NULL,
  "supervisorySkepticismHealth" JSONB NOT NULL,
  "authoritySegmentation" JSONB NOT NULL,
  "rollbackHealth" JSONB NOT NULL,
  "rawSignals" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meta_snap_user_created ON "MetaGovernanceSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "MetaGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_meta_event_user_created ON "MetaGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_meta_event_snapshot ON "MetaGovernanceEvent" ("snapshotId", "createdAt" DESC);

-- Pluralistic cognitive governance (specialist council + debate artefacts — observational only)
CREATE TABLE IF NOT EXISTS "PluralisticCognitiveSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "cognitiveWindowDays" INT NOT NULL,
  "metaStabilityCorrelation" DOUBLE PRECISION NOT NULL,
  "metaSnapshotId" TEXT,
  "disagreementStabilityScore" DOUBLE PRECISION NOT NULL,
  "epistemicDiversityHealthScore" DOUBLE PRECISION NOT NULL,
  "specialistAssessments" JSONB NOT NULL,
  "governanceDebate" JSONB NOT NULL,
  "cognitiveAuthorityBalance" JSONB NOT NULL,
  "diversityDiagnostics" JSONB NOT NULL,
  "disagreementIntegrityScore" DOUBLE PRECISION NOT NULL,
  "metaGovernanceSummary" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pluralistic_snap_user_created ON "PluralisticCognitiveSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "PluralisticGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_pluralistic_event_user_created ON "PluralisticGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_pluralistic_event_snapshot ON "PluralisticGovernanceEvent" ("snapshotId", "createdAt" DESC);

-- Institutional cognitive triad (epistemic memory, opportunity balance, anti-concentration — advisory only)
CREATE TABLE IF NOT EXISTS "InstitutionalCognitiveSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "assessmentWindowDays" INT NOT NULL,
  "epistemicInstitutionalMemory" JSONB NOT NULL,
  "opportunitySurvivabilityBalance" JSONB NOT NULL,
  "antiConcentrationEquilibrium" JSONB NOT NULL,
  "epistemicMemoryIndex" DOUBLE PRECISION NOT NULL,
  "opportunityBalanceIndex" DOUBLE PRECISION NOT NULL,
  "constitutionalEquilibriumIndex" DOUBLE PRECISION NOT NULL,
  "pluralisticCouncilRef" TEXT
);
CREATE INDEX IF NOT EXISTS idx_institutional_snap_user_created ON "InstitutionalCognitiveSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "InstitutionalGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  phase TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_institutional_event_user_created ON "InstitutionalGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_event_snapshot ON "InstitutionalGovernanceEvent" ("snapshotId", "createdAt" DESC);

-- Reality-grounded epistemic calibration (institutional cognition vs execution artefacts — observational only)
CREATE TABLE IF NOT EXISTS "EpistemicCalibrationSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "calibrationWindowDays" INT NOT NULL,
  "institutionalIndicesSummary" JSONB NOT NULL,
  "executionRealitySummary" JSONB NOT NULL,
  "marketTruthCorrelation" JSONB NOT NULL,
  "realityDivergence" JSONB NOT NULL,
  "antiSelfReferentialSafeguards" JSONB NOT NULL,
  "executionGroundingState" JSONB NOT NULL,
  "epistemicCalibrationIndex" DOUBLE PRECISION NOT NULL,
  "realityGroundingScore" DOUBLE PRECISION NOT NULL,
  "institutionalHumilityScore" DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_epistemic_calibration_snap_user ON "EpistemicCalibrationSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EpistemicCalibrationEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_epistemic_calibration_event_user ON "EpistemicCalibrationEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_epistemic_calibration_event_snap ON "EpistemicCalibrationEvent" ("snapshotId", "createdAt" DESC);

-- Uncertainty-aware causal governance (probabilistic bounds — non-identified causal inference)
CREATE TABLE IF NOT EXISTS "CausalGovernanceSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "causalWindowDays" INT NOT NULL,
  "counterfactualGovernanceAnalysis" JSONB NOT NULL,
  "probabilisticTruthState" JSONB NOT NULL,
  "attributionUncertaintyState" JSONB NOT NULL,
  "antiOverfittingState" JSONB NOT NULL,
  "marketRealityCausalAlignment" JSONB NOT NULL,
  "causalDivergenceState" JSONB NOT NULL,
  "causalGovernanceIndex" DOUBLE PRECISION NOT NULL,
  "probabilisticHumilityScore" DOUBLE PRECISION NOT NULL,
  "epistemicCalibrationSummary" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_causal_snap_user_created ON "CausalGovernanceSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "CausalGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_causal_event_user ON "CausalGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_causal_event_snapshot ON "CausalGovernanceEvent" ("snapshotId", "createdAt" DESC);

-- Atomic lifecycle transaction boundaries (strict consistency groups)
CREATE OR REPLACE FUNCTION expert_commit_entry_lifecycle(
  p_session_id TEXT,
  p_user_id TEXT,
  p_symbol TEXT,
  p_session_status TEXT,
  p_used_amount DOUBLE PRECISION,
  p_end_time TIMESTAMPTZ,
  p_orders JSONB,
  p_position_status TEXT,
  p_position_qty DOUBLE PRECISION,
  p_position_entry_price DOUBLE PRECISION,
  p_execution_status TEXT,
  p_execution_last_error TEXT,
  p_last_execution_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_pos_version INT;
  v_exec_version INT;
  v_cool_version INT;
BEGIN
  -- STRICT: order + session + execution/position/cooldown must commit together.
  INSERT INTO "TradeOrder" (id, "sessionId", "userId", symbol, "orderId", type, price, quantity, "quoteAmount", status, "createdAt", "filledAt")
  SELECT
    (x->>'id')::TEXT,
    (x->>'sessionId')::TEXT,
    (x->>'userId')::TEXT,
    (x->>'symbol')::TEXT,
    (x->>'orderId')::TEXT,
    (x->>'type')::TEXT,
    COALESCE((x->>'price')::DOUBLE PRECISION, 0),
    COALESCE((x->>'quantity')::DOUBLE PRECISION, 0),
    COALESCE((x->>'quoteAmount')::DOUBLE PRECISION, 0),
    (x->>'status')::TEXT,
    COALESCE((x->>'createdAt')::TIMESTAMPTZ, NOW()),
    CASE WHEN (x->>'filledAt') IS NULL OR (x->>'filledAt') = '' THEN NULL ELSE (x->>'filledAt')::TIMESTAMPTZ END
  FROM jsonb_array_elements(COALESCE(p_orders, '[]'::jsonb)) AS x
  ON CONFLICT (id) DO NOTHING;

  UPDATE "TradeSession"
  SET
    status = p_session_status,
    "usedAmount" = p_used_amount,
    "endTime" = p_end_time
  WHERE id = p_session_id;

  SELECT version INTO v_pos_version FROM "PositionState" WHERE "userId" = p_user_id AND symbol = p_symbol;
  IF v_pos_version IS NULL THEN
    INSERT INTO "PositionState" (id, "userId", symbol, "sessionId", status, quantity, "entryPrice", version)
    VALUES (concat('pos_', gen_random_uuid()::TEXT), p_user_id, p_symbol, p_session_id, p_position_status, p_position_qty, p_position_entry_price, 1);
  ELSE
    UPDATE "PositionState"
    SET
      "sessionId" = p_session_id,
      status = p_position_status,
      quantity = p_position_qty,
      "entryPrice" = p_position_entry_price,
      version = v_pos_version + 1,
      "updatedAt" = NOW()
    WHERE "userId" = p_user_id AND symbol = p_symbol AND version = v_pos_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STATE_CONFLICT: PositionState version conflict';
    END IF;
  END IF;

  SELECT version INTO v_exec_version FROM "ExecutionState" WHERE "sessionId" = p_session_id;
  IF v_exec_version IS NULL THEN
    INSERT INTO "ExecutionState" (id, "sessionId", "userId", symbol, status, "lastError", version)
    VALUES (concat('exec_', gen_random_uuid()::TEXT), p_session_id, p_user_id, p_symbol, p_execution_status, p_execution_last_error, 1);
  ELSE
    UPDATE "ExecutionState"
    SET
      status = p_execution_status,
      "lastError" = p_execution_last_error,
      version = v_exec_version + 1,
      "updatedAt" = NOW()
    WHERE "sessionId" = p_session_id AND version = v_exec_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STATE_CONFLICT: ExecutionState version conflict';
    END IF;
  END IF;

  SELECT version INTO v_cool_version FROM "CooldownState" WHERE "userId" = p_user_id AND symbol = p_symbol;
  IF v_cool_version IS NULL THEN
    INSERT INTO "CooldownState" (id, "userId", symbol, "lastExecutionAt", version)
    VALUES (concat('cool_', gen_random_uuid()::TEXT), p_user_id, p_symbol, p_last_execution_at, 1);
  ELSE
    UPDATE "CooldownState"
    SET
      "lastExecutionAt" = p_last_execution_at,
      version = v_cool_version + 1,
      "updatedAt" = NOW()
    WHERE "userId" = p_user_id AND symbol = p_symbol AND version = v_cool_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STATE_CONFLICT: CooldownState version conflict';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION expert_commit_liquidation_lifecycle(
  p_session_id TEXT,
  p_user_id TEXT,
  p_symbol TEXT,
  p_sell_order JSONB,
  p_session_status TEXT,
  p_end_time TIMESTAMPTZ,
  p_execution_status TEXT,
  p_execution_last_error TEXT,
  p_mark_flat BOOLEAN,
  p_last_execution_at TIMESTAMPTZ,
  p_pnl_usd DOUBLE PRECISION,
  p_trade_memory JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_pos_version INT;
  v_exec_version INT;
  v_cool_version INT;
  v_risk_version INT;
  v_day_key TEXT;
  v_prev_pnl DOUBLE PRECISION;
  v_prev_losses INT;
  v_prev_trades INT;
BEGIN
  -- STRICT: liquidation order + session + execution + position + risk + trade memory
  IF p_sell_order IS NOT NULL THEN
    INSERT INTO "TradeOrder" (id, "sessionId", "userId", symbol, "orderId", type, price, quantity, "quoteAmount", status, "createdAt", "filledAt")
    VALUES (
      (p_sell_order->>'id')::TEXT,
      (p_sell_order->>'sessionId')::TEXT,
      (p_sell_order->>'userId')::TEXT,
      (p_sell_order->>'symbol')::TEXT,
      (p_sell_order->>'orderId')::TEXT,
      (p_sell_order->>'type')::TEXT,
      COALESCE((p_sell_order->>'price')::DOUBLE PRECISION, 0),
      COALESCE((p_sell_order->>'quantity')::DOUBLE PRECISION, 0),
      COALESCE((p_sell_order->>'quoteAmount')::DOUBLE PRECISION, 0),
      (p_sell_order->>'status')::TEXT,
      COALESCE((p_sell_order->>'createdAt')::TIMESTAMPTZ, NOW()),
      CASE WHEN (p_sell_order->>'filledAt') IS NULL OR (p_sell_order->>'filledAt') = '' THEN NULL ELSE (p_sell_order->>'filledAt')::TIMESTAMPTZ END
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE "TradeSession"
  SET status = p_session_status, "endTime" = p_end_time
  WHERE id = p_session_id;

  SELECT version INTO v_exec_version FROM "ExecutionState" WHERE "sessionId" = p_session_id;
  IF v_exec_version IS NULL THEN
    INSERT INTO "ExecutionState" (id, "sessionId", "userId", symbol, status, "lastError", version)
    VALUES (concat('exec_', gen_random_uuid()::TEXT), p_session_id, p_user_id, p_symbol, p_execution_status, p_execution_last_error, 1);
  ELSE
    UPDATE "ExecutionState"
    SET status = p_execution_status, "lastError" = p_execution_last_error, version = v_exec_version + 1, "updatedAt" = NOW()
    WHERE "sessionId" = p_session_id AND version = v_exec_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STATE_CONFLICT: ExecutionState version conflict';
    END IF;
  END IF;

  IF p_mark_flat THEN
    SELECT version INTO v_pos_version FROM "PositionState" WHERE "userId" = p_user_id AND symbol = p_symbol;
    IF v_pos_version IS NULL THEN
      INSERT INTO "PositionState" (id, "userId", symbol, "sessionId", status, quantity, "entryPrice", version)
      VALUES (concat('pos_', gen_random_uuid()::TEXT), p_user_id, p_symbol, p_session_id, 'FLAT', 0, NULL, 1);
    ELSE
      UPDATE "PositionState"
      SET "sessionId" = p_session_id, status = 'FLAT', quantity = 0, "entryPrice" = NULL, version = v_pos_version + 1, "updatedAt" = NOW()
      WHERE "userId" = p_user_id AND symbol = p_symbol AND version = v_pos_version;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'STATE_CONFLICT: PositionState version conflict';
      END IF;
    END IF;
  END IF;

  SELECT version INTO v_cool_version FROM "CooldownState" WHERE "userId" = p_user_id AND symbol = p_symbol;
  IF v_cool_version IS NULL THEN
    INSERT INTO "CooldownState" (id, "userId", symbol, "lastExecutionAt", version)
    VALUES (concat('cool_', gen_random_uuid()::TEXT), p_user_id, p_symbol, p_last_execution_at, 1);
  ELSE
    UPDATE "CooldownState"
    SET "lastExecutionAt" = p_last_execution_at, version = v_cool_version + 1, "updatedAt" = NOW()
    WHERE "userId" = p_user_id AND symbol = p_symbol AND version = v_cool_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STATE_CONFLICT: CooldownState version conflict';
    END IF;
  END IF;

  IF p_pnl_usd IS NOT NULL THEN
    v_day_key := to_char((NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
    SELECT version, COALESCE("realizedPnlUsd", 0), COALESCE("consecutiveLosses", 0), COALESCE("tradeCount", 0)
      INTO v_risk_version, v_prev_pnl, v_prev_losses, v_prev_trades
    FROM "RiskState"
    WHERE "userId" = p_user_id AND "dayKey" = v_day_key;

    IF v_risk_version IS NULL THEN
      INSERT INTO "RiskState" (id, "userId", "dayKey", "realizedPnlUsd", "consecutiveLosses", "tradeCount", version)
      VALUES (
        concat('risk_', gen_random_uuid()::TEXT),
        p_user_id,
        v_day_key,
        p_pnl_usd,
        CASE WHEN p_pnl_usd < 0 THEN 1 ELSE 0 END,
        1,
        1
      );
    ELSE
      UPDATE "RiskState"
      SET
        "realizedPnlUsd" = v_prev_pnl + p_pnl_usd,
        "consecutiveLosses" = CASE WHEN p_pnl_usd < 0 THEN v_prev_losses + 1 ELSE 0 END,
        "tradeCount" = v_prev_trades + 1,
        version = v_risk_version + 1,
        "updatedAt" = NOW()
      WHERE "userId" = p_user_id AND "dayKey" = v_day_key AND version = v_risk_version;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'STATE_CONFLICT: RiskState version conflict';
      END IF;
    END IF;
  END IF;

  IF p_trade_memory IS NOT NULL THEN
    INSERT INTO "TradeMemory" (
      id, symbol, "marketRegime", decision, "rawConfidence", "calibratedConfidence",
      "kalmanScore", "liquidityScore", "sentimentScore", "raceScore",
      "entryPrice", "exitPrice", quantity, "pnlUsd", "holdDurationMs", "wasWin",
      "cooldownActive", notes, "analysisId", "sessionId"
    ) VALUES (
      COALESCE((p_trade_memory->>'id')::TEXT, concat('tm_', gen_random_uuid()::TEXT)),
      (p_trade_memory->>'symbol')::TEXT,
      COALESCE((p_trade_memory->>'marketRegime')::TEXT, 'UNKNOWN'),
      (p_trade_memory->>'decision')::TEXT,
      (p_trade_memory->>'rawConfidence')::DOUBLE PRECISION,
      (p_trade_memory->>'calibratedConfidence')::DOUBLE PRECISION,
      (p_trade_memory->>'kalmanScore')::DOUBLE PRECISION,
      (p_trade_memory->>'liquidityScore')::DOUBLE PRECISION,
      (p_trade_memory->>'sentimentScore')::DOUBLE PRECISION,
      (p_trade_memory->>'raceScore')::DOUBLE PRECISION,
      (p_trade_memory->>'entryPrice')::DOUBLE PRECISION,
      (p_trade_memory->>'exitPrice')::DOUBLE PRECISION,
      (p_trade_memory->>'quantity')::DOUBLE PRECISION,
      (p_trade_memory->>'pnlUsd')::DOUBLE PRECISION,
      (p_trade_memory->>'holdDurationMs')::BIGINT,
      (p_trade_memory->>'wasWin')::BOOLEAN,
      (p_trade_memory->>'cooldownActive')::BOOLEAN,
      (p_trade_memory->>'notes')::TEXT,
      (p_trade_memory->>'analysisId')::TEXT,
      (p_trade_memory->>'sessionId')::TEXT
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

-- ============================================================================
-- SECTION: Incremental catch-up + profiles JSONB operational columns ALL-IN-ONE
-- Source file: docs/supabase-all-deltas-in-order.sql
-- ============================================================================

-- =============================================================================
-- SUPABASE — ALL INCREMENTAL DELTA DDL IN ONE FILE (SAFE TO RUN LATE / RE-RUN)
-- =============================================================================
--
-- Use when:
--   • You already have older Phase 2 tables and are NOT sure which small deltas
--     were applied, OR you want one paste instead of four separate files.
--
-- Do NOT use when:
--   • Brand-new empty database → run ONLY `docs/phase2-supabase-migration.sql`
--     (full baseline already includes everything below).
--
-- Properties:
--   • Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only.
--   • Order matters only for readability; each block is independent.
--
-- Canonical pieces (keep in sync when schema changes):
--   • docs/supabase-delta-governance-simulation.sql
--   • docs/supabase-delta-temporal-evolution.sql
--   • docs/supabase-delta-meta-governance.sql
--   • docs/supabase-delta-pluralistic-cognitive.sql
--   • docs/supabase-delta-institutional-governance.sql
--   • docs/supabase-delta-epistemic-calibration.sql
--   • docs/supabase-delta-causal-governance.sql
--   • docs/supabase-delta-profiles-nexus-exchanges.sql
--   • docs/supabase-delta-profiles-operational-workspace.sql
--   • docs/supabase-delta-profiles-operational-preferences.sql
--
-- After new features: append new sections HERE and add tables to verification.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) Governance + sandbox + comparative (AdaptationProposal … ComparativeSimulationRun)
-- ---------------------------------------------------------------------------

-- Incremental DDL: constitutional evolution governance + sandbox + multi-world comparative runs
-- Safe for existing deployments: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only.
-- Run in Supabase SQL Editor after Phase 2 core tables exist (depends on Auth users ids only — no FK to other Phase2 tables required).
--
-- Canonical copy lives inside docs/phase2-supabase-migration.sql — keep BOTH files in sync when schema changes.

-- Constitutional evolution governance (proposals / checkpoints / audit — evaluation-only; no autonomous apply)
CREATE TABLE IF NOT EXISTS "AdaptationProposal" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  status TEXT NOT NULL,
  subsystem TEXT NOT NULL,
  "parameterKey" TEXT NOT NULL,
  "currentValueSnapshot" JSONB,
  "proposedValue" JSONB NOT NULL,
  "expectedImprovement" TEXT,
  evidence JSONB,
  "stabilityImpactEstimate" JSONB,
  "rollbackPlan" TEXT,
  "evaluatorConfidence" DOUBLE PRECISION,
  "evaluationVerdict" TEXT,
  "evaluationDetails" JSONB,
  "rejectionReason" TEXT,
  "reviewedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_adapt_proposal_user_created ON "AdaptationProposal" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_adapt_proposal_status ON "AdaptationProposal" ("userId", status);

CREATE TABLE IF NOT EXISTS "RollbackCheckpoint" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  label TEXT NOT NULL,
  "proposalId" TEXT,
  snapshot JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rollback_ckpt_user_created ON "RollbackCheckpoint" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EvolutionAuditEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "proposalId" TEXT,
  "eventType" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_evolution_audit_user_created ON "EvolutionAuditEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_audit_proposal ON "EvolutionAuditEvent" ("proposalId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_audit_event_type ON "EvolutionAuditEvent" ("userId", "eventType", "createdAt" DESC);

-- Sandboxed simulation / shadow execution (never mutates EngineGovernanceState or sends live orders)
CREATE TABLE IF NOT EXISTS "SandboxGovernanceProfile" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  label TEXT NOT NULL,
  "governanceOverrides" JSONB NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sandbox_profile_user_created ON "SandboxGovernanceProfile" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SimulationRun" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  "replayFrom" TIMESTAMPTZ,
  "replayTo" TIMESTAMPTZ,
  "proposalId" TEXT,
  "sandboxProfileId" TEXT,
  "baselineGovernanceFingerprint" TEXT,
  "inputSnapshot" JSONB NOT NULL,
  "shadowExecutionResult" JSONB,
  "counterfactualComparison" JSONB,
  "adaptationSimulationSummary" JSONB,
  "simulationReliability" JSONB
);
CREATE INDEX IF NOT EXISTS idx_sim_run_user_created ON "SimulationRun" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_sim_run_symbol ON "SimulationRun" ("userId", symbol, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ComparativeSimulationRun" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "suiteLabel" TEXT NOT NULL,
  "replayFrom" TIMESTAMPTZ,
  "replayTo" TIMESTAMPTZ,
  "proposalId" TEXT,
  "sandboxProfileId" TEXT,
  "baselineRealityPnlUsd" DOUBLE PRECISION NOT NULL,
  "worldsDefinition" JSONB NOT NULL,
  "perWorldResults" JSONB NOT NULL,
  "evolutionFitnessSnapshot" JSONB NOT NULL,
  "survivabilityProfile" JSONB NOT NULL,
  "crossWorldComparison" JSONB NOT NULL,
  "metaSimulationReliability" JSONB NOT NULL,
  "stressScenarioResults" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comp_sim_user_created ON "ComparativeSimulationRun" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_comp_sim_symbol ON "ComparativeSimulationRun" ("userId", symbol, "createdAt" DESC);


-- ---------------------------------------------------------------------------
-- 2) Temporal evolution (TemporalEvolutionRun)
-- ---------------------------------------------------------------------------

-- Incremental DDL: long-horizon temporal evolution evaluation
-- Mirrors docs/phase2-supabase-migration.sql — keep in sync.

CREATE TABLE IF NOT EXISTS "TemporalEvolutionRun" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  "suiteLabel" TEXT NOT NULL,
  "replayFrom" TIMESTAMPTZ,
  "replayTo" TIMESTAMPTZ,
  "proposalId" TEXT,
  "sandboxProfileId" TEXT,
  "eraSplitMode" TEXT NOT NULL,
  "eraStrideDays" INT,
  "erasDefinition" JSONB NOT NULL,
  "perEraResults" JSONB NOT NULL,
  "longHorizonFitnessSnapshot" JSONB NOT NULL,
  "evolutionPersistenceRecord" JSONB NOT NULL,
  "structuralCycleStressSummary" JSONB NOT NULL,
  "temporalSurvivabilityProfile" JSONB NOT NULL,
  "temporalReliability" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_temp_evo_user_created ON "TemporalEvolutionRun" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_temp_evo_symbol ON "TemporalEvolutionRun" ("userId", symbol, "createdAt" DESC);


-- ---------------------------------------------------------------------------
-- 3) Meta-governance (MetaGovernanceSnapshot, MetaGovernanceEvent)
-- ---------------------------------------------------------------------------

-- Incremental DDL: meta-governance supervision (MetaGovernanceSnapshot, MetaGovernanceEvent)
-- Keep in sync with docs/phase2-supabase-migration.sql

CREATE TABLE IF NOT EXISTS "MetaGovernanceSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "supervisoryWindowDays" INT NOT NULL,
  "metaStabilityScore" DOUBLE PRECISION NOT NULL,
  "adaptationDisciplineProfile" JSONB NOT NULL,
  "constitutionalIntegrityStatus" JSONB NOT NULL,
  "recursivePressure" JSONB NOT NULL,
  "supervisorySkepticismHealth" JSONB NOT NULL,
  "authoritySegmentation" JSONB NOT NULL,
  "rollbackHealth" JSONB NOT NULL,
  "rawSignals" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meta_snap_user_created ON "MetaGovernanceSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "MetaGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_meta_event_user_created ON "MetaGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_meta_event_snapshot ON "MetaGovernanceEvent" ("snapshotId", "createdAt" DESC);


-- ---------------------------------------------------------------------------
-- 4) Pluralistic cognitive (PluralisticCognitiveSnapshot, PluralisticGovernanceEvent)
-- ---------------------------------------------------------------------------

-- Incremental DDL: pluralistic cognitive governance (PluralisticCognitiveSnapshot, PluralisticGovernanceEvent)
-- Keep in sync with docs/phase2-supabase-migration.sql

CREATE TABLE IF NOT EXISTS "PluralisticCognitiveSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "cognitiveWindowDays" INT NOT NULL,
  "metaStabilityCorrelation" DOUBLE PRECISION NOT NULL,
  "metaSnapshotId" TEXT,
  "disagreementStabilityScore" DOUBLE PRECISION NOT NULL,
  "epistemicDiversityHealthScore" DOUBLE PRECISION NOT NULL,
  "specialistAssessments" JSONB NOT NULL,
  "governanceDebate" JSONB NOT NULL,
  "cognitiveAuthorityBalance" JSONB NOT NULL,
  "diversityDiagnostics" JSONB NOT NULL,
  "disagreementIntegrityScore" DOUBLE PRECISION NOT NULL,
  "metaGovernanceSummary" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pluralistic_snap_user_created ON "PluralisticCognitiveSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "PluralisticGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_pluralistic_event_user_created ON "PluralisticGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_pluralistic_event_snapshot ON "PluralisticGovernanceEvent" ("snapshotId", "createdAt" DESC);


-- ---------------------------------------------------------------------------
-- 5) Institutional cognitive triad (InstitutionalCognitiveSnapshot, InstitutionalGovernanceEvent)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "InstitutionalCognitiveSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "assessmentWindowDays" INT NOT NULL,
  "epistemicInstitutionalMemory" JSONB NOT NULL,
  "opportunitySurvivabilityBalance" JSONB NOT NULL,
  "antiConcentrationEquilibrium" JSONB NOT NULL,
  "epistemicMemoryIndex" DOUBLE PRECISION NOT NULL,
  "opportunityBalanceIndex" DOUBLE PRECISION NOT NULL,
  "constitutionalEquilibriumIndex" DOUBLE PRECISION NOT NULL,
  "pluralisticCouncilRef" TEXT
);
CREATE INDEX IF NOT EXISTS idx_institutional_snap_user_created ON "InstitutionalCognitiveSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "InstitutionalGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  phase TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_institutional_event_user_created ON "InstitutionalGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_event_snapshot ON "InstitutionalGovernanceEvent" ("snapshotId", "createdAt" DESC);


-- ---------------------------------------------------------------------------
-- 6) Epistemic calibration (EpistemicCalibrationSnapshot, EpistemicCalibrationEvent)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "EpistemicCalibrationSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "calibrationWindowDays" INT NOT NULL,
  "institutionalIndicesSummary" JSONB NOT NULL,
  "executionRealitySummary" JSONB NOT NULL,
  "marketTruthCorrelation" JSONB NOT NULL,
  "realityDivergence" JSONB NOT NULL,
  "antiSelfReferentialSafeguards" JSONB NOT NULL,
  "executionGroundingState" JSONB NOT NULL,
  "epistemicCalibrationIndex" DOUBLE PRECISION NOT NULL,
  "realityGroundingScore" DOUBLE PRECISION NOT NULL,
  "institutionalHumilityScore" DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_epistemic_calibration_snap_user ON "EpistemicCalibrationSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EpistemicCalibrationEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_epistemic_calibration_event_user ON "EpistemicCalibrationEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_epistemic_calibration_event_snap ON "EpistemicCalibrationEvent" ("snapshotId", "createdAt" DESC);


-- ---------------------------------------------------------------------------
-- 7) Causal governance uncertainty (CausalGovernanceSnapshot, CausalGovernanceEvent)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CausalGovernanceSnapshot" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "causalWindowDays" INT NOT NULL,
  "counterfactualGovernanceAnalysis" JSONB NOT NULL,
  "probabilisticTruthState" JSONB NOT NULL,
  "attributionUncertaintyState" JSONB NOT NULL,
  "antiOverfittingState" JSONB NOT NULL,
  "marketRealityCausalAlignment" JSONB NOT NULL,
  "causalDivergenceState" JSONB NOT NULL,
  "causalGovernanceIndex" DOUBLE PRECISION NOT NULL,
  "probabilisticHumilityScore" DOUBLE PRECISION NOT NULL,
  "epistemicCalibrationSummary" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_causal_snap_user_created ON "CausalGovernanceSnapshot" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "CausalGovernanceEvent" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId" TEXT NOT NULL,
  "snapshotId" TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_causal_event_user ON "CausalGovernanceEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_causal_event_snapshot ON "CausalGovernanceEvent" ("snapshotId", "createdAt" DESC);


-- ---------------------------------------------------------------------------
-- Profiles: canonical exchange payloads (cross-device operational restore)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nexus_exchanges JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.nexus_exchanges IS
  'Canonical stored exchange connection payload (same shape as client nexus_exchanges).';

CREATE INDEX IF NOT EXISTS profiles_nexus_exchanges_not_null
  ON public.profiles (id)
  WHERE nexus_exchanges IS NOT NULL;


-- ---------------------------------------------------------------------------
-- Profiles: operational workspace snapshot (command-center parity across devices)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS operational_workspace JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.operational_workspace IS
  'Dashboard/command-center JSON (v=2 activity snapshot). Server-authoritative cross-device restore.';

CREATE INDEX IF NOT EXISTS profiles_operational_workspace_not_null
  ON public.profiles (id)
  WHERE operational_workspace IS NOT NULL;


-- ---------------------------------------------------------------------------
-- Profiles: operational_preferences (notifications UI + chrome JSON)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS operational_preferences JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.operational_preferences IS
  '{ "v": 1, "notifications": { inbox, history }, "uiChrome": {} } — merged via app API.';

CREATE INDEX IF NOT EXISTS profiles_operational_preferences_not_null
  ON public.profiles (id)
  WHERE operational_preferences IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Profiles: nexus_exchange_balances_snapshot (USD totals for bots / bootstrap)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nexus_exchange_balances_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.nexus_exchange_balances_snapshot IS
  'Versioned JSON { v:1, updatedAt, totalUsd, exchanges[] } — no API secrets; see POST /api/user/exchange-balances-snapshot.';

CREATE INDEX IF NOT EXISTS profiles_exchange_bal_snap_not_null
  ON public.profiles (id)
  WHERE nexus_exchange_balances_snapshot IS NOT NULL;


-- ---------------------------------------------------------------------------
-- VERIFICATION — expect 17 rows with present = true (full governance extension stack incl. causal)
-- ---------------------------------------------------------------------------

SELECT t.tablename,
       EXISTS (
         SELECT 1
         FROM information_schema.tables s
         WHERE s.table_schema = 'public'
           AND s.table_name = t.tablename
       ) AS present
FROM (VALUES
  ('AdaptationProposal'),
  ('RollbackCheckpoint'),
  ('EvolutionAuditEvent'),
  ('SandboxGovernanceProfile'),
  ('SimulationRun'),
  ('ComparativeSimulationRun'),
  ('TemporalEvolutionRun'),
  ('MetaGovernanceSnapshot'),
  ('MetaGovernanceEvent'),
  ('PluralisticCognitiveSnapshot'),
  ('PluralisticGovernanceEvent'),
  ('InstitutionalCognitiveSnapshot'),
  ('InstitutionalGovernanceEvent'),
  ('EpistemicCalibrationSnapshot'),
  ('EpistemicCalibrationEvent'),
  ('CausalGovernanceSnapshot'),
  ('CausalGovernanceEvent')
) AS t(tablename)
ORDER BY t.tablename;

-- END OF MASTER BUNDLE

