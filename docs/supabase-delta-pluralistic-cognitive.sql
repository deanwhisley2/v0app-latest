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
