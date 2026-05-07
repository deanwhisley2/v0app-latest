# Supabase SQL & communication — complete project inventory

Use this when you want **one orderly pass** over every database artifact shipped in the repo.

## One-shot apply (recommended)

From the repo root:

```bash
bash scripts/build-supabase-master-bundle.sh
```

Then in **Supabase Dashboard → SQL Editor → New query** paste **`docs/supabase-master-bundle.sql`** and **Run**.

What the bundle contains (order matters):

| # | Path | Purpose |
|---|------|--------|
| 1 | `supabase/trading_platform_schema.sql` | `profiles.is_verified`, `user_balances`, `email_verifications`, `bot_trade_records`, RLS for balances/records |
| 2 | `supabase/fix_profiles_registration.sql` | Grants + `handle_new_user` trigger on `auth.users` (safe profile row on signup) |
| 3 | `supabase/blocked_trade_patterns.sql` | `blocked_trade_patterns` + RLS |
| 4 | `docs/phase2-supabase-migration.sql` | Full Expert / trading / governance **quoted** tables (`TradeSession`, `AnalysisHistory`, `SimulationRun`, …) |
| 5 | `docs/supabase-all-deltas-in-order.sql` | Idempotent governance extension replay **plus** `profiles` columns (`nexus_exchanges`, `operational_workspace`, `operational_preferences`, **`nexus_exchange_balances_snapshot`**); ends with verification `SELECT` |

**Note:** Step 5 duplicates some DDL already present in step 4 (`CREATE TABLE IF NOT EXISTS` only). Keeping both ensures older projects that skipped part of Phase 2 still pick up **`ALTER TABLE profiles …`** columns that Phase 2 does **not** include.

### Not separately bundled (already covered)

- `docs/supabase-delta-*.sql` — each slice is **copied inside** `supabase-all-deltas-in-order.sql` (maintain deltas there first).
- `docs/supabase-delta-profiles-*.sql` — same; included via `supabase-all-deltas-in-order.sql`.
- `supabase/email_balance_verification.sql` — points at `trading_platform_schema.sql` only (no extra SQL).

## Standalone deltas (manual one-offs)

Apply only when you deliberately want a slice without the mega catch-up:

- `docs/supabase-delta-governance-simulation.sql`
- `docs/supabase-delta-temporal-evolution.sql`
- `docs/supabase-delta-meta-governance.sql`
- `docs/supabase-delta-pluralistic-cognitive.sql`
- `docs/supabase-delta-institutional-governance.sql`
- `docs/supabase-delta-epistemic-calibration.sql`
- `docs/supabase-delta-causal-governance.sql`
- `docs/supabase-delta-profiles-nexus-exchanges.sql`
- `docs/supabase-delta-profiles-operational-workspace.sql`
- `docs/supabase-delta-profiles-operational-preferences.sql`
- `docs/supabase-delta-profiles-exchange-balances-snapshot.sql`
- `docs/supabase-delta-replace-blocked-trade-patterns-legacy-shape.sql` — **one-time** fix if `blocked_trade_patterns` is wrong shape (`id`/`pattern` instead of `user_id`/`pattern_key`); see *Troubleshooting*

## App ↔ Supabase ↔ browser (runtime)

These are **not** SQL Editor steps; without them APIs return 401/500:

| Direction | Mechanism |
|-----------|-----------|
| Browser → Supabase Auth | `@supabase/ssr`-style cookie session (`middleware.ts`, `lib/supabaseClient.ts`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Browser → your API | `Authorization: Bearer <access_token>` on routes that use `getUserFromBearer` (`lib/auth-api.ts`) |
| Server → Postgres (bypass RLS) | `createAdminClient()` → `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` (`lib/supabaseAdmin.ts`) |
| Server → user-scoped session | `createRouteHandlerSupabaseClient()` (`lib/supabase/route-handler.ts`) — cookies + anon key |

See also: `.env.local.example`.

## Related operator docs

- `docs/supabase-operator-guide.md` — extended checklist  
- `docs/SUPABASE_APPLY_PIPELINE.md` — short pipeline  
- `docs/supabase-remote-schema-inventory.sql` — run in SQL Editor to export live `public` tables/columns, RLS policies, and a present/missing checklist vs this repo  

## Troubleshooting (SQL Editor)

- **`42703 column "user_id" does not exist`** — Typical causes:
  1. **Supabase UI “Run and enable RLS”** injects policies on `user_id` while Phase‑2 tables use **`"userId"`**. **Fix:** run the bundle with **Run without RLS**.
  2. **Stale table shape:** `CREATE TABLE IF NOT EXISTS` does not rewrite existing rows; if `public.user_balances` (or `bot_trade_records`, `email_verifications`, `blocked_trade_patterns`) was created earlier with **`"userId"`** or **`userid`**, indexes/policies on **`user_id`** fail. **`supabase/trading_platform_schema.sql`** and **`supabase/blocked_trade_patterns.sql`** now include idempotent **`RENAME COLUMN … TO user_id`** repair blocks; re-run the bundle (or regenerate `docs/supabase-master-bundle.sql` and paste).
  3. **Still failing:** Inspect columns:

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'user_balances', 'bot_trade_records', 'email_verifications',
    'blocked_trade_patterns'
  )
ORDER BY 1, 2;
```

If **`blocked_trade_patterns`** has columns like **`id`**, **`pattern`**, **`sample_size`** (and no **`user_id`**), you have a **legacy unrelated table** occupying that name. **`CREATE TABLE IF NOT EXISTS` never replaces it.** Run **`docs/supabase-delta-replace-blocked-trade-patterns-legacy-shape.sql`** once (drops that table — data loss on blocked patterns only), then re-apply the bundle or `supabase/blocked_trade_patterns.sql`.

If none of those names include `user_id`, you likely have a one-off legacy table (drop/recreate after backup, or add `ALTER TABLE … ADD COLUMN user_id UUID REFERENCES auth.users(id)` and backfill manually).

## Rollback

There is **no single “Undo”** for this bundle. Prefer applying on a staging project first. Individual drops (e.g. `DROP TABLE …`) must be authored case-by-case against data you are willing to lose.
