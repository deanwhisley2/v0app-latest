# Supabase apply pipeline — keep the app and database aligned

**Hands-on operators (one file in `docs/` next to the SQL):** [`docs/supabase-operator-guide.md`](./supabase-operator-guide.md)  
Step-by-step only: [`docs/SUPABASE_MANUAL_SETUP_STEP_BY_STEP.md`](./SUPABASE_MANUAL_SETUP_STEP_BY_STEP.md)

**One place to run all catch-up SQL (missed deltas):** paste **`docs/supabase-all-deltas-in-order.sql`** once in SQL Editor — idempotent, includes verification. Read **`docs/SUPABASE_RUN_LATER.md`** for when to use that vs the full migration.

This project uses **Supabase Postgres** via the JS client (`lib/supabaseAdmin.ts`, route handlers). Prisma **`schema.prisma`** documents the intended shape; **`docs/phase2-supabase-migration.sql`** is the authoritative DDL baseline for Expert / trading-related tables.

## What today’s stabilization phases added (must exist in Postgres)

These tables power **constitutional evolution**, **sandbox / shadow replay**, **multi-world comparative**, and **temporal long-horizon** APIs. Without them, inserts return `42P01` (undefined table) or similar.

| Table | Purpose |
|-------|---------|
| `AdaptationProposal` | Proposal lifecycle (evaluation-only in product rules) |
| `RollbackCheckpoint` | Governance/evolution checkpoints (snapshots JSON) |
| `EvolutionAuditEvent` | Audit trail (`SANDBOX_*`, `MULTI_WORLD_*`, `TEMPORAL_*`, proposal events, …) |
| `SandboxGovernanceProfile` | Saved governance override templates for sandbox |
| `SimulationRun` | Single-world shadow replay results |
| `ComparativeSimulationRun` | Multi-world fitness / survivability aggregates |
| `TemporalEvolutionRun` | Era-sliced temporal evolution / long-horizon fitness history |
| `MetaGovernanceSnapshot` | Meta-supervision assessment history |
| `MetaGovernanceEvent` | WARN/ALERT supervisory events (recursive pressure, etc.) |
| `PluralisticCognitiveSnapshot` | Specialist council + debate + diversity metrics (observational) |
| `PluralisticGovernanceEvent` | Cognitive diversity / adversarial advisory events |
| `InstitutionalCognitiveSnapshot` | Triad advisory memory / opportunity / equilibrium |
| `InstitutionalGovernanceEvent` | Triad threshold events (WARN/INFO) |
| `EpistemicCalibrationSnapshot` | Institutional vs execution alignment history |
| `EpistemicCalibrationEvent` | Divergence / self-referential advisory events |

Supporting intelligence tables used by the same code paths (`DriftDetectionState`, `ConfidenceAuditSnapshot`, `TradeMemory`, …) live **earlier** in `phase2-supabase-migration.sql` and must already exist.

## Apply strategy

### A. New Supabase project (or full reset)

Run the **entire** file:

`docs/phase2-supabase-migration.sql`

Execute in **Supabase Dashboard → SQL Editor** (or CI migration runner against the project). It is idempotent for many objects (`CREATE TABLE IF NOT EXISTS`, etc.).

### B. Existing project that already ran an older Phase 2 dump

Apply only the governance + simulation addon (same DDL as embedded in full file):

`docs/supabase-delta-governance-simulation.sql`

If you already applied that migration but **before** temporal evolution shipped, also run:

`docs/supabase-delta-temporal-evolution.sql`

If you applied before **meta-governance** supervision shipped, also run:

`docs/supabase-delta-meta-governance.sql`

If you applied before **pluralistic cognitive** governance shipped, also run:

`docs/supabase-delta-pluralistic-cognitive.sql`

If you applied before **institutional triad** tables shipped, also run:

`docs/supabase-delta-institutional-governance.sql`

If you applied before **epistemic calibration** (market-truth alignment) shipped, also run:

`docs/supabase-delta-epistemic-calibration.sql`

If you applied before **causal governance** (uncertainty-aware probabilistic framing) shipped, also run:

`docs/supabase-delta-causal-governance.sql`

Then run the verification query below.

### C. After every code change that adds a Supabase-backed feature

Before closing out the task:

1. Update **`prisma/schema.prisma`** if the model is mirrored there.
2. Append or alter **`docs/phase2-supabase-migration.sql`** (full baseline).
3. Mirror the change into the appropriate **`docs/supabase-delta-*.sql`** snapshot (governance/simulation vs temporal evolution, etc.).
4. Document new tables/indexes briefly in **this file** under “Verification”.

## Verification (run after apply)

Expect **17 rows** returned with `present = true` after governance + sandbox + comparative + temporal + meta-governance + pluralistic cognitive + institutional triad + epistemic calibration + causal governance addons:

```sql
SELECT t.tablename,
       EXISTS (
         SELECT 1 FROM information_schema.tables s
         WHERE s.table_schema = 'public' AND s.table_name = t.tablename
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
) AS t(tablename);
```

Optional smoke inserts (adjust `user_id` to a real `auth.users.id` UUID in your env):

```sql
-- Requires a valid user UUID that your app tests with
SELECT id FROM auth.users LIMIT 1;
```

Then verify each API route that touches these tables responds without `DB_WRITE_FAILED` / undefined relation errors.

## RLS / service role

Daemon and Expert mutation paths typically use **`createAdminClient()`** (service role). If you tighten **Row Level Security** on these tables later, mirror policies so service role retains required access and optional per-user scoped reads remain correct.

## Rule for implementations (outside the terminal)

**Any pipeline that persists to Supabase needs SQL merged and applied (or pasted in SQL Editor by the operator) before the feature is considered done.** Leaving DDL only in chat or Prisma without running migration is how production quietly diverges from code.
