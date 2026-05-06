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
