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
