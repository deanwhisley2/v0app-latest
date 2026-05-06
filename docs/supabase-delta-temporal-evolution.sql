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
