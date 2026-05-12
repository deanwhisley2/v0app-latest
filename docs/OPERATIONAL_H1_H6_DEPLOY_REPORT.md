# Operational deploy — H1 liquidity reservations + H6 FX snapshot locking

**Report window:** 2026-05-12 (UTC, per production health timestamps)

This document records **production synchronization** for the institutional settlement slice (H1 + H6): migration application, VPS deployment, runtime checks, and verification status for the requested financial tests.

---

## 1. Migration applied (production Supabase)

### 1.1 Initial anomaly

An earlier MCP `apply_migration` call recorded migration metadata **without executing** the full DDL (placeholder SQL). Production was corrected by applying **equivalent DDL** in **supplemental** migrations via Supabase MCP `apply_migration`, split into smaller payloads for reliability.

### 1.2 Supplemental migration names applied (live)

The following logical pieces were applied successfully (`success: true`):

| Order | MCP migration name | Contents |
|------|----------------------|----------|
| 1 | `h1_h6_fx_columns_amount_usd_locked` | FX columns on `retailer_fund_requests`, backfill `amount_usd_locked`, NOT NULL, CHECK |
| 2 | `h1_retailer_liquidity_reservations_table` | `retailer_liquidity_reservations` + index + backfill insert |
| 3 | `h1_finalize_retailer_liquidity_reservation_fn` | `finalize_retailer_liquidity_reservation` + service_role execute |
| 4 | `h1_create_retailer_desk_fund_request_with_reserve_fn` | `create_retailer_desk_fund_request_with_reserve` body |
| 5 | `h1_create_retailer_desk_grants` | REVOKE/GRANT on create RPC |
| 6 | `h1_transfer_with_reservation_fn` | `transfer_retail_balance_to_customer_with_reservation` body |
| 7 | `h1_transfer_with_reservation_grants_comment` | REVOKE/GRANT + COMMENT |
| 8 | `h1_reservations_rls_enable_grant` | RLS enable + `authenticated` SELECT grant |
| 9–11 | `h1_reservations_policy_*` | Desk / customer / L5 SELECT policies |

The repo file `supabase/migrations/20260523100000_retailer_liquidity_reservations_and_fx_snapshot_locking.sql` remains the **single canonical DDL** for fresh environments and should be treated as the source of truth for schema review.

### 1.3 Live verification (Postgres)

Via MCP `execute_sql` (when available):

- **RPCs present:** `create_retailer_desk_fund_request_with_reserve`, `finalize_retailer_liquidity_reservation`, `transfer_retail_balance_to_customer_with_reservation`.
- **`retailer_liquidity_reservations`:** table created; backfill row count was **0** at verify time (no open `local_mobile` desk tickets in eligible statuses).

---

## 2. Repository sync

| Item | Status |
|------|--------|
| Commit on `main` | `5d7d36f` — `feat(funding): H1 liquidity reservations + H6 FX snapshot locking` |
| Remote | `origin/main` updated (`git push` **PASS**) |

---

## 3. VPS / PM2 deployment

| Step | Status |
|------|--------|
| Script | `bash scripts/deploy-vps-git-archive.sh` (default `REMOTE_HOST=67.159.52.40`, `REMOTE_APP_DIR=/opt/nexus-pro`) |
| Archive | `git archive HEAD` → scp → extract |
| `npm ci` | **PASS** |
| `npm run build` (production) | **PASS** |
| PM2 | `nexus` **online** (pid shown on deploy host), `pm2 save` **PASS** |

---

## 4. Live domain / runtime health

| Check | Result |
|--------|--------|
| `GET https://nexuspro.it.com/api/health` | **PASS** — HTTP 200, `{"ok":true,...}` |
| `GET https://nexuspro.it.com/api/health/supabase` | **PASS** — `supabase":"reachable"` |

Full browser UX on `https://nexuspro.it.com` (logged-in flows) was **not** exercised in automation (no session tokens in this environment).

---

## 5. Financial tests T1–T4 (operational)

These require **authenticated user + retailer + L5** sessions and non-destructive coordination on **live money paths**. They were **not automated end-to-end** in this pass.

| Test | Objective | Status |
|------|-----------|--------|
| **T1** Concurrent reservation safety | Two simultaneous POSTs to same desk exceeding spendable → one 409 / insufficient liquidity | **MANUAL REQUIRED** |
| **T2** Reservation release | Reject → reservation `released`, spendable restores | **MANUAL REQUIRED** |
| **T3** FX immutability | Settlement uses `amount_usd_locked` after FX display constants change | **MANUAL REQUIRED** (code path enforced in API; prove with one funded request + controlled approval) |
| **T4** Treasury vs retailer consistency | Treasury debit / retail debit / customer credit = locked USD | **MANUAL REQUIRED** |

### Suggested manual evidence bundle (per test)

- Snapshots: `user_balances.retail_balance`, `treasury_balances` (MAIN_TREASURY), customer `available_balance`.
- Rows: `retailer_liquidity_reservations` (`state`, `amount_usd`, `release_reason`).
- Request row: `retailer_fund_requests.amount_usd_locked`, `fx_locked_at`.
- Events: `financial_events` / operational notifications as applicable.

---

## 6. PASS / FAIL summary (this deployment pass)

| Area | Result |
|------|--------|
| Migration DDL applied (split MCP migrations) | **PASS** |
| RPCs exist (verified query) | **PASS** |
| Git push `main` | **PASS** |
| VPS build + PM2 `nexus` online | **PASS** |
| Live `/api/health` + Supabase reachability | **PASS** |
| T1 concurrent HTTP proof | **NOT RUN** (manual) |
| T2 release proof | **NOT RUN** (manual) |
| T3 FX immutability proof | **NOT RUN** (manual) |
| T4 treasury consistency proof | **NOT RUN** (manual) |

---

## 7. Remaining risks

1. **Stub migration history:** An empty-named migration may exist in Supabase migration history; supplemental migrations corrected schema. Align future CLI pushes with project linking to avoid drift perception.
2. **MCP intermittency:** Large single-shot SQL occasionally returned `fetch failed`; chunked migrations mitigated this.
3. **Manual financial proofs:** Institutional guarantees require completing T1–T4 under real credentials with logged before/after balances.

---

## 8. Rollback instructions

**Application:** Redeploy prior Git revision on the VPS (checkout previous archive / redeploy previous commit) and `pm2 restart nexus`.

**Database (destructive — plan maintenance window):**

1. Drop policies on `retailer_liquidity_reservations`, disable RLS or drop table after archiving rows.
2. `drop function if exists` the three new RPCs (reverse dependency order: `transfer_retail_balance_to_customer_with_reservation`, `create_retailer_desk_fund_request_with_reserve`, `finalize_retailer_liquidity_reservation`).
3. `alter table retailer_fund_requests drop column` for H6 columns only if no code depends on them (production app after rollback must match).

Prefer restoring from a **pre-migration backup** if strict byte-for-byte rollback is required.

---

## 9. Next actions (recommended)

1. Run **T1–T4** with dedicated test accounts; attach CSV/screenshots of balances + reservation rows.
2. Optionally add `retailer_liquidity_reservations` to Realtime publication if ops dashboards need live subscription (not in repo migration).
3. Monitor PM2 and `/api/health` after first production desk funding under the new RPC path.
