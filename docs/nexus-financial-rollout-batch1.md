# Nexus financial rollout — Batch 1

## Objective

Establish three accountable pillars before layering referrals, promotions, and session policy:

1. **Canonical policy constants** — USD-normalized minimums, processing expectations, insurance/withdraw fee bands, emergency thresholds (for future risk engine), referral rate constant (3.5% on referee first deposit — implemented in a later batch).
2. **Withdrawal pipeline** — Nexus Main debited immediately; funds held in `withdrawal_pending_balance` until a **Level 5 liquidity admin** approves (external payout) or rejects (automatic refund to Nexus Main).
3. **Fixed-trade open path** — Single server route debiting **only** `available_balance`: insurance fee immediately + principal locked into `current_stake`, with tier checks from `traderEligibleForFixedTrade`.

## Files / components touched

| Area | Path |
|------|------|
| Policy & FX | `lib/nexus-financial-policy.ts`, `lib/nexus-fx.ts` |
| Authz | `lib/server/security-authz.ts` (`requireLiquidityAdminLevel5`) |
| Schema | `docs/supabase-delta-nexus-financial-batch1.sql`, append in `docs/supabase-all-deltas-in-order.sql` |
| APIs | `app/api/user/withdrawal/request/route.ts`, `app/api/user/withdrawal-requests/route.ts`, `app/api/admin/withdrawal-requests/route.ts`, `app/api/user/fixed-trade/open/route.ts` |
| Balances | `app/api/user/balance/route.ts`, `lib/operational-bootstrap-types.ts`, `lib/server/operational-bootstrap.ts` |
| Dashboard | `app/dashboard/page.tsx` (withdraw flow, pending balance UI, processing copy) |

## Accounting impact

- **Withdrawal request:** `available_balance ↓`, `withdrawal_pending_balance ↑` (same nominal amount).
- **Approve:** `withdrawal_pending_balance ↓` only (payout off-platform; `available_balance` already reduced at request).
- **Reject:** `withdrawal_pending_balance ↓`, `available_balance ↑` (full refund).
- **Fixed trade open:** `available_balance ↓ (principal + insurance)`, `current_stake ↑ (principal)`; ledger rows `fixed_trade_insurance_fee`, `fixed_trade_principal_lock`.

## Acceptance checks

1. Run SQL delta on Supabase (see `docs/supabase-delta-nexus-financial-batch1.sql`).
2. Run `npm run nexus:financial-batch1-check` — policy/FX sanity.
3. **Withdrawal:** Authenticated POST `/api/user/withdrawal/request` with `amount >= 3` (USD-normalized unit) removes funds from `available_balance` and increments pending; GET `/api/user/withdrawal-requests` lists rows.
4. **Admin:** Level 5 user PATCH `/api/admin/withdrawal-requests` with `{ requestId, decision }` — reject restores main balance; approve clears pending only.
5. **Fixed trade:** POST `/api/user/fixed-trade/open` with valid body fails with 400 if `principal + insurance > available_balance`.

## Rollback

- Revert application deploy to prior commit.
- DB: optional manual reversal of pending rows; drop new tables only if no production data depends on them. Removing `withdrawal_pending_balance` requires migrating balances back to `available_balance` first.

## Operational risks

- **Schema drift:** APIs assume new columns/tables — deploy SQL **before** traffic hits new routes.
- **Concurrency:** Batch 1 uses read-modify-write without serializable transactions; high contention may need a Postgres RPC or row locks (future batch).
- **Currency:** Batch 1 validates minimum withdrawal in **normalized USD units** matching stored balances; local-currency UX validation requires `NEXUS_FX_LOCAL_PER_USD_JSON` and UI wiring (Batch 2).

## Early fixed-trade pullout (added after Batch 1 core)

- **Policy:** `computeEarlyExitSettlementUsd` in `lib/nexus-financial-policy.ts` — **10% agreement default** + **opening insurance nominal** are taken **only from principal/stake return**; **session earned amount is credited in full** (schedule-based, same curve as open).
- **API:** `POST /api/user/fixed-trade/early-exit` with `{ sessionId }` — only while `now < official lease end`; credits **net principal + full earnings** to `available_balance`, releases stake from `current_stake`.
- **Schema:** `fixed_trade_sessions.cancelled_at` — run `docs/supabase-delta-nexus-financial-early-exit.sql` or batch1 delta tail.
- **UI:** Container Mode shows **Early pullout** when `ActiveFixTrade.serverSessionId` is set (after wiring open-session API to client state).

## Next batches (preview)

- Referral 3.5% on first successful deposit (treasury source **not** L5 user wallet — company settlement pool).
- Single-session policy for L1/L2 + unlimited L5.
- Deposit minimum enforcement + promotional 20% bonus caps.
