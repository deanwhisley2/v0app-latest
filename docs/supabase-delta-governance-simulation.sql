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
