# Supabase operator guide (all-in-one)

**You are in `docs/` — this file lives next to:**

- `phase2-supabase-migration.sql` (full DDL)
- `supabase-delta-governance-simulation.sql`
- `supabase-delta-temporal-evolution.sql`

Open this Markdown in your editor (same as the SQL file — no copying from chat needed).

---

## Part 1 — Step-by-step manual Supabase runbook

### Supabase manual setup — step by step (do not skip)

This is the **operator runbook** for anything that must be done **in the Supabase dashboard** (not in your terminal). Follow the steps **in order**. If a step fails, **stop** and read **Troubleshooting** before continuing.

---

### Before you touch SQL (checklist)

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

### Choose your path (decision tree)

Answer **one** question:

**A. Is this a brand-new database (or you are OK re-applying the full Phase 2 baseline)?**  
→ Use **Path A: Full migration** (one big file).

**B. Did you already run an older Expert “Phase 2” SQL dump before governance/sandbox/multi-world/temporal existed?**  
→ Use **Path B: Incremental deltas** (two smaller files **in order**).

If you are unsure, use **Path A** on a **staging** project first; when it verifies clean, repeat on production.

---

### Path A — Full migration (recommended for clean projects)

**Goal:** Create **all** Phase 2–related tables, including governance, sandbox, comparative, temporal, lifecycle RPCs, etc.

#### Step A1 — Open SQL Editor

1. Log in at https://supabase.com/dashboard  
2. Click your **correct project**.  
3. Left sidebar → **SQL Editor**.  
4. Click **New query** (empty editor).

#### Step A2 — Open the migration file in this repo

1. In your IDE/file manager, open: **`docs/phase2-supabase-migration.sql`** (same folder as this guide).  
2. **Select all** (`Ctrl+A` / `Cmd+A`).  
3. **Copy** (`Ctrl+C` / `Cmd+C`).

#### Step A3 — Paste and run once

1. Click in the Supabase SQL Editor empty query.  
2. **Paste** the entire file.  
3. Click **Run** (or `Ctrl+Enter` / `Cmd+Enter`).  
4. Wait until it **finishes without error**.

**Expected:** “Success” / “No rows returned” for DDL.  
**Not OK:** Red error → see **Troubleshooting**.

#### Step A4 — Verify tables exist

1. SQL Editor → **New query**.  
2. Paste **exactly** this and **Run**:

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

**Expected:** Every row `present = true`.

---

### Path B — Incremental (existing DB already had Phase 2 “core”)

Use only if you **know** older tables (`TradeSession`, `EngineGovernanceState`, drift tables, etc.) already exist.

#### Step B1 — Governance + sandbox + comparative

1. SQL Editor → **New query**.  
2. Copy **all** of **`docs/supabase-delta-governance-simulation.sql`** → paste → **Run**.

#### Step B2 — Temporal evolution

1. **New query**.  
2. Copy **all** of **`docs/supabase-delta-temporal-evolution.sql`** → paste → **Run**.

#### Step B3 — Meta-governance supervision

1. **New query**.  
2. Copy **all** of **`docs/supabase-delta-meta-governance.sql`** → paste → **Run**.

#### Step B4 — Pluralistic cognitive governance

1. **New query**.  
2. Copy **all** of **`docs/supabase-delta-pluralistic-cognitive.sql`** → paste → **Run**.

#### Step B5 — Institutional cognitive triad

1. **New query**.  
2. Copy **all** of **`docs/supabase-delta-institutional-governance.sql`** → paste → **Run**.

#### Step B6 — Epistemic calibration (market-truth alignment)

1. **New query**.  
2. Copy **all** of **`docs/supabase-delta-epistemic-calibration.sql`** → paste → **Run**.

#### Step B7 — Causal governance (uncertainty-aware probabilistic framing)

1. **New query**.  
2. Copy **all** of **`docs/supabase-delta-causal-governance.sql`** → paste → **Run**.

#### Step B8 — Verify

Run the **same** seventeen-table verification query as Step A4. All **`present`** = **`true`**.

---

### After SQL — optional app checks

1. Restart Next.js after changing `.env.local`.  
2. If tables are missing, logs often show “relation … does not exist” (`42P01`).

---

### Troubleshooting

- **relation does not exist** — SQL not applied on **this** project, or wrong `NEXT_PUBLIC_SUPABASE_URL`. Run verification query.  
- **syntax error** — paste full file again from repo only; avoid partial paste from chat.  
- **Staging works, production breaks** — production env points at a **different** Supabase project ref.

---

### Do not do

1. Drop `public.*` tables in production without recovery plan.  
2. Mix unrelated random SQL into the same run.  
3. Commit or leak `SUPABASE_SERVICE_ROLE_KEY`.

---

### Verification shortcut (COUNT = 17)

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

---

## Part 2 — Apply pipeline checklist (maintainer summary)

Same content as **`SUPABASE_APPLY_PIPELINE.md`** for reference.

### What must exist in Postgres (governance / simulation / temporal addon)

| Table | Purpose |
|-------|---------|
| `AdaptationProposal` | Proposal lifecycle (evaluation-only) |
| `RollbackCheckpoint` | Checkpoints JSON |
| `EvolutionAuditEvent` | Audit trail |
| `SandboxGovernanceProfile` | Sandbox governance templates |
| `SimulationRun` | Single-world shadow replay |
| `ComparativeSimulationRun` | Multi-world fitness |
| `TemporalEvolutionRun` | Long-horizon temporal runs |
| `MetaGovernanceSnapshot` | Meta-supervisory assessments |
| `MetaGovernanceEvent` | Recursive-pressure / supervisory events |
| `PluralisticCognitiveSnapshot` | Specialist council / diversity metrics |
| `PluralisticGovernanceEvent` | Pluralistic advisory events |
| `InstitutionalCognitiveSnapshot` | Institutional triad assessments |
| `InstitutionalGovernanceEvent` | Triad threshold events |
| `EpistemicCalibrationSnapshot` | Institutional vs execution alignment |
| `EpistemicCalibrationEvent` | Divergence advisory events |
| `CausalGovernanceSnapshot` | Probabilistic causal framing + counterfactual stress |
| `CausalGovernanceEvent` | Causal-divergence / attribution advisory |

Incremental SQL packs: **`supabase-delta-pluralistic-cognitive.sql`**, **`supabase-delta-institutional-governance.sql`**, **`supabase-delta-epistemic-calibration.sql`**, **`supabase-delta-causal-governance.sql`**, or all-in-one **`supabase-all-deltas-in-order.sql`**.

### Apply strategy summary

| Situation | Run in Supabase |
|-----------|----------------|
| New / full baseline | **`phase2-supabase-migration.sql`** (entire file) |
| Only governance+sandbox+comparative | **`supabase-delta-governance-simulation.sql`** |
| Added after that, temporal only | **`supabase-delta-temporal-evolution.sql`** |
| Meta-governance supervision | **`supabase-delta-meta-governance.sql`** |
| Pluralistic cognitive governance | **`supabase-delta-pluralistic-cognitive.sql`** |
| Institutional triad | **`supabase-delta-institutional-governance.sql`** |
| Epistemic calibration | **`supabase-delta-epistemic-calibration.sql`** |
| Causal governance | **`supabase-delta-causal-governance.sql`** |

### Maintainer rule after code changes

1. Update **`prisma/schema.prisma`** where applicable.  
2. Update **`phase2-supabase-migration.sql`**.  
3. Update the matching **`supabase-delta-*.sql`**.  
4. Extend verification in Part 1 if new tables ship.

### RLS / service role

Expert/daemon writes use **`createAdminClient()`** (service role). If you tighten RLS, preserve service-role access paths.

---

## Split copies (same content as this file)

- `SUPABASE_MANUAL_SETUP_STEP_BY_STEP.md` — Part 1 only  
- `SUPABASE_APPLY_PIPELINE.md` — Part 2 shorter form  

Prefer **this file** (`supabase-operator-guide.md`) when you want one scrollable reference beside the SQL migration.
