-- Incremental DDL: epistemic calibration (EpistemicCalibrationSnapshot, EpistemicCalibrationEvent)
-- Keep in sync with docs/phase2-supabase-migration.sql

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
