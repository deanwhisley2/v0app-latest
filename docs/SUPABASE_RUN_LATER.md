# Supabase SQL — what to run (single place)

You only need to remember **two** files:

| Situation | Run this file in Supabase SQL Editor |
|-----------|--------------------------------------|
| **New / empty database** (full baseline) | `docs/phase2-supabase-migration.sql` — once, whole file |
| **Existing database** — you may have missed some smaller migrations, or you want one paste that catches up | `docs/supabase-all-deltas-in-order.sql` — once (safe to re-run) |

The combined file is **idempotent** (`IF NOT EXISTS`). It does **not** replace the full migration for a brand-new DB; for that, the full file still wins.

**After you run:** use the verification query at the **bottom** of `supabase-all-deltas-in-order.sql` (or in `SUPABASE_APPLY_PIPELINE.md`). You want **17** governance-related tables with `present = true`.

**When we add new tables later:** we append another section to `supabase-all-deltas-in-order.sql` and update the verification list. The small `supabase-delta-*.sql` files stay as copy-paste slices for people who prefer step-by-step.

Short checklist (same content, different format): `docs/SUPABASE_APPLY_PIPELINE.md`
