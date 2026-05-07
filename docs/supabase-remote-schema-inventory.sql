-- =============================================================================
-- REMOTE SCHEMA INVENTORY — run in Supabase Dashboard → SQL Editor
-- =============================================================================
--
-- IMPORTANT: Highlight from WITH or SELECT down to semicolon — do not paste headings
--   as naked SQL or you get ERROR 42601 near "QUERY".
--
-- Goal: Export what exists in public schema to compare against this repo DDL.
-- Run ONE statement at a time (each SELECT block below is separate).
--
-- Permissions: pg_catalog / information_schema (read-only catalogs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- QUERY 1 of 7 — expected bundle tables vs present?
-- -----------------------------------------------------------------------------
WITH expected (relname) AS (
  VALUES
    -- Platform / auth-adjacent (snake_case)
    ('profiles'),
    ('user_balances'),
    ('email_verifications'),
    ('bot_trade_records'),
    ('blocked_trade_patterns'),
    -- Phase 2 Expert / persistence (quoted names → pg_class.relname as below)
    ('AnalysisHistory'),
    ('NotificationRecord'),
    ('TradeSession'),
    ('TradeOrder'),
    ('ExpertChatMessage'),
    ('TradeMemory'),
    ('PositionState'),
    ('CooldownState'),
    ('RiskState'),
    ('ExecutionState'),
    ('EngineRuntimeStateEvent'),
    ('ExecutionLock'),
    ('ExecutionIdempotency'),
    ('ExchangeReconciliationLog'),
    ('StartupRecoveryState'),
    ('DaemonSymbolState'),
    ('OrchestrationLease'),
    ('EngineGovernanceState'),
    ('GovernanceApprovalLog'),
    ('AssetCorrelationState'),
    ('LiveStructureState'),
    ('MarketStructureSnapshot'),
    ('RegimePerformanceSnapshot'),
    ('GovernanceEffectivenessSnapshot'),
    ('ExecutionQualitySnapshot'),
    ('ConfidenceAuditSnapshot'),
    ('BehavioralBaseline'),
    ('StabilitySnapshot'),
    ('StabilityPressureHistory'),
    ('DriftEvent'),
    ('DriftDetectionState'),
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
)
SELECT
  e.relname AS expected_table,
  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = e.relname
  ) AS present
FROM expected e
ORDER BY present ASC, e.relname ASC;

-- -----------------------------------------------------------------------------
-- QUERY 2 — Full “code sheet”: every public base table + column + type
-- -----------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS pg_type,
  (a.attnotnull) AS not_null
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

-- -----------------------------------------------------------------------------
-- QUERY 3 — Focus: user-scoping columns on platform tables (user_id vs "userId")
-- -----------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS pg_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'user_balances',
    'email_verifications',
    'bot_trade_records',
    'blocked_trade_patterns',
    'profiles'
  )
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND (
    a.attname IN ('user_id', 'userid', 'userId', 'id')
    OR lower(a.attname) LIKE '%user%'
  )
ORDER BY c.relname, a.attnum;

-- -----------------------------------------------------------------------------
-- QUERY 4a — Which public tables have RLS on?
-- -----------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_force
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- -----------------------------------------------------------------------------
-- QUERY 4b — Policy text (often shows user_id misuse)
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual::text AS using_expr,
  with_check::text AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- QUERY 5 — profiles row shape sample (confirm JSONB columns; no secrets)
-- -----------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- -----------------------------------------------------------------------------
-- QUERY 6 — Functions in public touching Phase 2 (optional noise check)
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;
