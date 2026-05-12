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
| Deploy script run from this agent | **NOT RUN** (requires SSH to `67.159.52.40` / keys) — run: `bash scripts/deploy-vps-git-archive.sh` from a machine with access |
| PM2 process | **UNKNOWN** until post-deploy `pm2 status` on server |

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
| 9 | VPS/runtime healthy | **PENDING** (deploy) |
| 10 | Deployment stable | **PENDING** (after deploy + smoke) |

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
