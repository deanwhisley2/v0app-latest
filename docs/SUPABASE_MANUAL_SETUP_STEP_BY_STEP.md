# Supabase manual setup — step by step (do not skip)

**Prefer the single bundled guide:** [`supabase-operator-guide.md`](./supabase-operator-guide.md) (same folder — Part 1 + Part 2 together).

---

This is the **operator runbook** for anything that must be done **in the Supabase dashboard** (not in your terminal). Follow the steps **in order**. If a step fails, **stop** and read **Troubleshooting** before continuing.

---

## Before you touch SQL (checklist)

1. **Confirm you are in the correct Supabase project**  
   - Dashboard URL looks like: `https://supabase.com/dashboard/project/<project-ref>`  
   - The **project ref** must match the app’s `NEXT_PUBLIC_SUPABASE_URL` (same host).

2. **Confirm you have rights**  
   - You need access to **SQL Editor** (Owner / Admin on the org is typical).

3. **Back up if this is production**  
   - Supabase → **Settings → Database** → use your provider’s backup/snapshot policy, or export critical tables first.  
   - The scripts here use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` — they are **not** full destructive resets, but mistakes still happen if you paste the wrong thing.

4. **App environment** (after SQL succeeds)  
   - In `.env.local` (or your host’s env), you must have at least:  
     - `NEXT_PUBLIC_SUPABASE_URL`  
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
     - `SUPABASE_SERVICE_ROLE_KEY` (server-only; Expert/daemon DB writes use this via `createAdminClient`)  
   - See `.env.local.example` in the repo.

---

## Choose your path (decision tree)

Answer **one** question:

**A. Is this a brand-new database (or you are OK re-applying the full Phase 2 baseline)?**  
→ Use **Path A: Full migration** (one big file).

**B. Did you already run an older Expert “Phase 2” SQL dump before governance/sandbox/multi-world/temporal/meta-governance existed?**  
→ Use **Path B: Incremental deltas** (smaller files **in order**, as listed under Path B).

If you are unsure, use **Path A** on a **staging** project first; when it verifies clean, repeat on production.

---

## Path A — Full migration (recommended for clean projects)

**Goal:** Create **all** Phase 2–related tables, including governance, sandbox, comparative, temporal, lifecycle RPCs, etc.

### Step A1 — Open SQL Editor

1. Log in at [Supabase Dashboard](https://supabase.com/dashboard).
2. Click your **correct project**.
3. Left sidebar → **SQL Editor**.
4. Click **New query** (empty editor).

### Step A2 — Open the migration file on your machine

1. On your laptop/server where the repo lives, open:  
   `docs/phase2-supabase-migration.sql`
2. **Select all** contents (`Ctrl+A` / `Cmd+A`).
3. **Copy** (`Ctrl+C` / `Cmd+C`).

### Step A3 — Paste and run once

1. Click in the Supabase SQL Editor empty query.
2. **Paste** the entire file (one paste is fine; file is long).
3. Click **Run** (or `Ctrl+Enter` / `Cmd+Enter`).
4. Wait until the run **finishes without error** in the results panel.

**Expected:** Message like “Success” / “No rows returned” for DDL blocks.  
**Not OK:** Red error text mentioning syntax error or permission denied — see **Troubleshooting**.

### Step A4 — Verify tables exist

1. Still in **SQL Editor**, **New query**.
2. Paste **exactly** this block and **Run**:

```sql
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
```

3. Check the result grid:

**Expected:** Every row shows `present = true`.

If **any** row is `false`, that table was **not** created — either the migration did not finish, you ran in the **wrong project**, or an earlier error aborted part of the script (PostgreSQL runs a **single submitted batch** until first error depending on semantics — if in doubt, re-run after fixing errors).

---

## Path B — Incremental (existing DB already had Phase 2 “core”)

Use this only if you **know** older tables (e.g. `TradeSession`, `EngineGovernanceState`, drift tables) already exist.

### Step B1 — Governance + sandbox + comparative pack

1. **SQL Editor** → **New query**.
2. Open locally: `docs/supabase-delta-governance-simulation.sql`
3. Copy **entire** file → paste → **Run**.
4. **Success** → continue.

### Step B2 — Temporal evolution pack

1. **SQL Editor** → **New query**.
2. Open locally: `docs/supabase-delta-temporal-evolution.sql`
3. Copy **entire** file → paste → **Run**.
4. **Success** → continue.

### Step B3 — Meta-governance supervision pack

1. **SQL Editor** → **New query**.
2. Open locally: `docs/supabase-delta-meta-governance.sql`
3. Copy **entire** file → paste → **Run**.
4. **Success** → continue.

### Step B4 — Pluralistic cognitive governance pack

1. **SQL Editor** → **New query**.
2. Open locally: `docs/supabase-delta-pluralistic-cognitive.sql`
3. Copy **entire** file → paste → **Run**.
4. **Success** → continue.

### Step B5 — Institutional cognitive triad pack

1. **SQL Editor** → **New query**.
2. Open locally: `docs/supabase-delta-institutional-governance.sql`
3. Copy **entire** file → paste → **Run**.
4. **Success** → continue.

### Step B6 — Epistemic calibration pack

1. **SQL Editor** → **New query**.
2. Open locally: `docs/supabase-delta-epistemic-calibration.sql`
3. Copy **entire** file → paste → **Run**.
4. **Success** → continue.

### Step B7 — Causal governance pack

1. **SQL Editor** → **New query**.
2. Open locally: `docs/supabase-delta-causal-governance.sql`
3. Copy **entire** file → paste → **Run**.
4. **Success** → continue.

### Step B8 — Verify (same query as Step A4)

Run the **same** seventeen-table verification `SELECT …` from Step A4. All **`present`** must be **`true`**.

---

## After SQL: quick app sanity checks (optional but useful)

These do **not** replace SQL verification; they catch **wrong env** problems.

1. Restart your Next.js server after changing `.env.local`.
2. Signed in as a user that owns Expert sessions/trades:
   - Call a read-only Expert route that hits new tables only if used (e.g. evolution list is empty OK).  
   - Or create a sandbox profile once from your UI/API **after** tables exist — if the table is missing, you’ll see a `42P01` / “relation does not exist” style error in server logs.

---

## Troubleshooting (read before retrying blindly)

### “relation … does not exist” in app logs after deploy

**Cause:** SQL was never run on **this** Supabase project, or run on a **different** project than your env URL.

**Fix:** Re-check **Before you touch SQL** checklist; run Path A **or** Path B verification query until all seventeen governance-stack tables are present (see count query below).

### Error on `CREATE POLICY` or permission denied

These migration files focus on tables/indexes/functions. If you added custom RLS, service role inserts may still work, but anon might not — Expert server paths typically use **service role** for writes.

### “syntax error at or near …” after paste

**Cause:** Paste was truncated, or two statements merged without semicolons because of a bad partial copy.

**Fix:** Paste the **whole** file again from the repo **without** editing. Do not paste from chat/email (line breaks corrupt easily).

### You ran migrations on staging but production still breaks

**Cause:** Env vars on production point to **another** Supabase URL.

**Fix:** Compare production `NEXT_PUBLIC_SUPABASE_URL` project ref with the dashboard URL where you ran SQL.

---

## What you must NOT do manually

1. Do **not** drop `public.*` tables in production unless you have a documented recovery path.
2. Do **not** paste random SQL found online alongside these files in the **same run** unless you understand it — keep one migration “unit” per run.
3. Do **not** commit `SUPABASE_SERVICE_ROLE_KEY` or paste it into GitHub Issues / chat logs.

---

## Single source of truth in the repo

| Situation | File to run manually in Supabase |
|-----------|----------------------------------|
| Full baseline | `docs/phase2-supabase-migration.sql` |
| Only governance/simulation/multi-world comparative tables | `docs/supabase-delta-governance-simulation.sql` |
| Only temporal evolution table | `docs/supabase-delta-temporal-evolution.sql` |
| Meta-governance supervision | `docs/supabase-delta-meta-governance.sql` |
| Pluralistic cognitive governance | `docs/supabase-delta-pluralistic-cognitive.sql` |
| Institutional triad | `docs/supabase-delta-institutional-governance.sql` |
| Epistemic calibration | `docs/supabase-delta-epistemic-calibration.sql` |
| Causal governance | `docs/supabase-delta-causal-governance.sql` |
| All incremental packs at once | `docs/supabase-all-deltas-in-order.sql` |

Policy reference (shorter checklist): `docs/SUPABASE_APPLY_PIPELINE.md`  
Companion to this guide.

---

### Quick copy: verification-only query

If you ever want to **only** verify without re-running migrations:

```sql
SELECT COUNT(*) FILTER (WHERE table_name IN (
  'AdaptationProposal','RollbackCheckpoint','EvolutionAuditEvent',
  'SandboxGovernanceProfile','SimulationRun','ComparativeSimulationRun','TemporalEvolutionRun',
  'MetaGovernanceSnapshot','MetaGovernanceEvent',
  'PluralisticCognitiveSnapshot','PluralisticGovernanceEvent',
  'InstitutionalCognitiveSnapshot','InstitutionalGovernanceEvent',
  'EpistemicCalibrationSnapshot','EpistemicCalibrationEvent',
  'CausalGovernanceSnapshot','CausalGovernanceEvent'
)) AS governance_simulation_tables_present
FROM information_schema.tables
WHERE table_schema = 'public';
```

**Expected:** `17`.
