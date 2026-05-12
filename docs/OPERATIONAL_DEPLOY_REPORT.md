# Operational production deploy — 2026-05-12

## 1. Migration applied (production Supabase)

| Item | Status |
|------|--------|
| `operational_realtime_rls_treasury_ssot_support` | **PASS** — applied via Supabase MCP `apply_migration` |
| `public.auth_is_level5()` | **PASS** — exists |
| `public.operational_support_threads` / `operational_support_messages` | **PASS** — exist |
| Realtime publication | **PASS** — `operational_support_threads`, `operational_support_messages`, `retailer_fund_requests` (and other migration tables) in `supabase_realtime` |

## 2. Production tables verified (sample)

- `to_regclass('public.operational_support_threads')` → non-null
- `pg_publication_tables` includes operational support + fund request tables

## 3. Realtime

- RLS uses `profiles.trading_user_level` via `auth_is_level5()` (not JWT metadata).
- Client hook: `hooks/use-operational-realtime.ts` (admin / retailer_desk / trading_user scopes).
- **Live domain browser test** of websocket delivery was **not** executed in this environment (no logged-in session). Re-verify on `nexuspro.it.com` with L5 + retailer + end-user accounts.

## 4. RLS

- Policies from migration: retailer fund requests, withdrawals, treasury (L5), unified_ledger TREASURY lines, CBE, retailer applications, support threads/messages.
- **Cross-user leakage**: must be re-checked under real JWTs (L1 cannot SELECT L2 rows, etc.).

## 5. Code shipped (this commit)

- `lib/support-thread-notifications.ts` — L5 queue + user reply notifications (`user_account_notifications` upsert).
- `lib/nexus-notification-nav.ts` — `support_thread` deep link.
- API: admin/user support routes call notification helpers; `PATCH` `.../support-threads/[threadId]/read` (L5 mark read).
- `AdminSupportChatPanel` — thread list, history, reply, Realtime `refreshTick`.
- `UserSupportDeskPanel` — end-user support tab with Realtime.
- `app/dashboard/page.tsx` — `?supportThread=<uuid>` on load, notification nav to wallet + focus thread.
- `WalletScreen` / `AdminOperationalAssets` — pass-through focus + consume callback.

## 6. Treasury SSOT

- Unchanged in this slice: **`treasury_balances` / `MAIN_TREASURY`** + `update_treasury_usd` + `unified_ledger` before/after columns (from same migration).
- `admin_treasury_pool` deprecated + one-time merge (migration).

## 7. VPS / PM2

| Check | Result |
|-------|--------|
| `bash scripts/deploy-vps-git-archive.sh` | **PASS** (2026-05-12) — archive upload, `npm ci`, `next build`, PM2 `nexus` restarted (`online`) |
| PM2 | **PASS** — `nexus` relaunched after legacy duplicate removal per `deploy.sh` |

## 8. Live domain (nexuspro.it.com)

| Test | Result |
|------|--------|
| HTTPS / app shell | **NOT RE-RUN** in this session (use browser + real auth) |
| Admin → Human support → thread + reply | **PENDING** manual |
| User → Support tab → thread + notification tap | **PENDING** manual |

## 9. PASS/FAIL matrix (required acceptance)

| # | Test | Result |
|---|------|--------|
| 1 | Migration applied successfully | **PASS** (remote via MCP) |
| 2 | Realtime on live domain | **PENDING** (manual) |
| 3 | Admin queues live | **PENDING** (manual) |
| 4 | Retailer queues live | **PENDING** (manual) |
| 5 | No cross-role leakage | **PENDING** (manual + SQL audit) |
| 6 | Support threads persist | **PASS** (schema + APIs) |
| 7 | Admin support UI operational | **PASS** (code + build) — **PENDING** smoke on prod |
| 8 | Treasury SSOT | **PASS** (migration + prior rules) |
| 9 | VPS/runtime healthy | **PASS** (deploy script + PM2 online) |
| 10 | Deployment stable | **PASS** (build on VPS succeeded; monitor uptime) |

## 10. Known remaining risks

1. **Notification upsert** failures are logged but do not fail the primary support message write — ops should monitor logs.
2. **L5 admin list** for queue notifications uses `profiles.trading_user_level = 5` (up to 500 rows); rare edge: profile missing for an auth user.
3. **45s polling** fallback remains on operational panels until Realtime proven primary in prod.
4. **VPS deploy** must be run to align runtime with DB + Git.

## 11. Rollback

1. **Database**: restore snapshot or craft inverse migration (drop support tables, revert policies, revert `update_treasury_usd`, remove publication entries). Prefer snapshot for speed.
2. **App**: revert commit introducing support UI + notifications; redeploy.
3. **Env**: no new env vars required for this slice.

## 12. Operator checklist (complete the lifecycle)

1. `git pull && npm ci && npm run build` on VPS (or use `scripts/deploy-vps-git-archive.sh`).
2. `pm2 restart nexus` (or your ecosystem name).
3. Smoke: L5 login → Wallet → Human support → thread list.
4. Smoke: user notification tap → wallet → Support tab opens thread.
5. Confirm Supabase Dashboard → Realtime → tables published.

---

## 13. L5 dual settlement modes (`l5_funding_settlement_modes`) — 2026-05-12

### Migration (production Supabase)

| Item | Status |
|------|--------|
| `retailer_fund_requests`: `l5_settlement_mode`, `l5_override_note`, `approved_by_admin_for_retailer` + check constraint | **PASS** — applied via Supabase MCP `apply_migration` (`l5_funding_settlement_modes`) |

Repo migration file: `supabase/migrations/20260521120000_l5_funding_settlement_modes.sql`.

### Code shipped (this slice)

- `app/api/admin/retailer-funding/route.ts` — `approvalMode` required for `local_mobile` approve: `treasury_pool` vs `retailer_retail_balance`; **no automatic fallback** between rails on failure.
- `lib/server/l5-funding-settlement.ts`, `lib/server/l5-funding-notify.ts`
- `lib/formatting/ledger-operational-trace.ts` — settlement mode, funding source, acting authority, debited/credited accounts, book entry line.
- `components/dashboard/wallet-operational-panel.tsx` — **visually distinct** amber “retailer liquidity” vs sky “company treasury” approve actions.
- `app/api/user/financial-events/route.ts` — returns `metadata` for end-user ledger trace on dashboard.

### VPS / PM2

| Check | Result |
|-------|--------|
| `bash scripts/deploy-vps-git-archive.sh` (after commit `d61dd73`) | **PASS** — `npm ci`, `next build`, PM2 `nexus` restarted **online** on default `REMOTE_HOST` |

### Live domain

| Check | Result |
|-------|--------|
| `GET https://nexuspro.it.com/api/health` | **PASS** — HTTP 200 (`{"ok":true}` at time of check) |
| Runtime includes L5 settlement commit | **PASS** — deploy script ran after push |
| TEST 1 retailer override (live balances + treasury unchanged) | **PENDING** — real accounts |
| TEST 2 treasury mode (MAIN_TREASURY debit; retailer retail unchanged) | **PENDING** |
| TEST 3 insufficient retailer retail → 400, no movements | **PENDING** |

### PASS/FAIL matrix (L5 liquidity ownership)

| # | Test | Result |
|---|------|--------|
| 1 | Migration applied on production DB | **PASS** |
| 2 | Retailer override: retail debits; treasury unchanged | **PENDING** (live) |
| 3 | Treasury mode: MAIN_TREASURY debits; retailer retail unchanged | **PENDING** (live) |
| 4 | Insufficient retail: override fails; no partial credit; no treasury fallback | **PASS** (code) / **PENDING** (live) |
| 5 | Ledger rows carry classification + accounts (`metadata`) | **PASS** (API + UI) |
| 6 | Notifications (customer + retailer on override) | **PASS** (code) / **PENDING** (live inbox) |
| 7 | Strict explicit rails (no auto fallback) | **PASS** |

### Known risks

1. **Financial live tests (TEST 1–3)** were not executed with signed-in production accounts in this session — operator should run balance-before/after checks on retailer, customer, and `treasury_balances` (MAIN_TREASURY).
2. **Operational mis-click**: mitigated by labeled rails, warning copy, and a **browser confirm** on treasury approval (debiting MAIN_TREASURY).

---

## 14. Live financial verification loop (operator-run — institutional proof)

**Rule:** Every production financial test records **before balances**, **action**, **after balances**, **ledger row(s)**, **notifications**, and **settlement mode** on the fund request. Paste evidence into the tables below when TEST 1–3 are complete.

### TEST 1 — Retailer override rail (`retailer_retail_balance`)

| Field | Evidence |
|-------|----------|
| Request ID | |
| BEFORE — retailer `user_balances.retail_balance` | |
| BEFORE — customer `user_balances.available_balance` | |
| BEFORE — `treasury_balances.amount` where `wallet_type = MAIN_TREASURY` | |
| ACTION | Admin → Approve **via retailer liquidity** |
| AFTER — retailer retail_balance (must decrease by request amount) | |
| AFTER — customer available (must increase by amount) | |
| AFTER — MAIN_TREASURY (must match BEFORE) | |
| Row `l5_settlement_mode` | Expected: `retailer_retail_balance` |
| Ledger `metadata.approvalClassification` | Expected: `RETAILER_OVERRIDE_APPROVAL` |
| Notifications | Customer inbox + retailer inbox (override debit) |
| Result | **PASS / FAIL** |

### TEST 2 — Treasury rail (`treasury_pool`)

| Field | Evidence |
|-------|----------|
| Request ID | |
| BEFORE — MAIN_TREASURY | |
| BEFORE — retailer retail_balance | |
| BEFORE — customer available | |
| ACTION | Admin → Approve **via company treasury** (after confirm dialog) |
| AFTER — MAIN_TREASURY (must decrease) | |
| AFTER — retailer retail (must match BEFORE) | |
| AFTER — customer available (must increase) | |
| Ledger `metadata.approvalClassification` | Expected: `TREASURY_FUNDED_APPROVAL` |
| Result | **PASS / FAIL** |

### TEST 3 — Insufficient retailer liquidity (safety)

| Field | Evidence |
|-------|----------|
| Setup | Retail `retail_balance` **&lt;** request amount |
| ACTION | Approve **via retailer liquidity** |
| HTTP status | Expected: **400** |
| Retailer / customer / treasury balances | Expected: **unchanged** from BEFORE |
| Result | **PASS / FAIL** |

### PASS/FAIL matrix (production evidence — fill when complete)

| # | Test | Production result |
|---|------|-------------------|
| 1 | Retailer rail — balances + treasury untouched | **TBD** |
| 2 | Treasury rail — MAIN_TREASURY debit only | **TBD** |
| 3 | Insufficient retail — hard fail, no mutations | **TBD** |

### Ledger integrity checks (SQL — run in Supabase SQL editor or MCP)

Duplicate / anomaly scans (adjust time window):

```sql
-- Recent L5 funding admin events for one user (replace :uid)
select id, created_at, event_type, gross_amount, balance_source, balance_destination,
       metadata->>'approvalClassification' as classification,
       metadata->>'approvalMode' as mode,
       transaction_ref
from public.container_balance_events
where user_id = ':uid'
  and event_type like 'funding_request_admin_%'
  and created_at > now() - interval '7 days'
order by created_at desc;
```

```sql
-- Duplicate-looking refs (same transaction_ref, multiple rows)
select transaction_ref, count(*) as n
from public.container_balance_events
where created_at > now() - interval '30 days'
  and transaction_ref is not null
group by transaction_ref
having count(*) > 1
order by n desc;
```

```sql
-- Fund requests: settlement mode vs approval flag consistency (recent)
select id, status, l5_settlement_mode, approved_by_admin_for_retailer, amount, updated_at
from public.retailer_fund_requests
where l5_settlement_mode is not null
  and updated_at > now() - interval '30 days'
order by updated_at desc;
```

Treasury pool SSOT: compare **`treasury_balances`** (`MAIN_TREASURY`) before/after TEST 2; unified ledger lines (if used in your deployment) should align with `update_treasury_usd` audit expectations — reconcile any unexpected MAIN_TREASURY movement outside documented treasury approvals.
