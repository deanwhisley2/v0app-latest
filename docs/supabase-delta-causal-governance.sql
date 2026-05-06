-- Incremental DDL: causal governance (CausalGovernanceSnapshot, CausalGovernanceEvent)
-- Keep in sync with docs/phase2-supabase-migration.sql

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
