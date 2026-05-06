-- Incremental DDL: institutional cognitive triad (InstitutionalCognitiveSnapshot, InstitutionalGovernanceEvent)
-- Keep in sync with docs/phase2-supabase-migration.sql

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
