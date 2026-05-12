# Operational stabilization + reconstruction report

Date: 2026-05-12  
Scope: coordinated routing, role isolation, live polling for ops queues, legacy redirects, and documented gaps.

---

## 1. Implemented features

| Item | Implementation |
|------|----------------|
| Admin / retailer land on real ops UI | Level 5 and Level-2 **designated credit desks** (`operationalWorkspace`) default to **`/dashboard`** tab **`wallet`** (Assets). Removed client redirects to `/admin/treasury` and `/retailer/dashboard`. |
| Focused primary navigation | **Header** and **BottomNav** show only **Wallet (Assets)** + **Settings** for `operationalWorkspace`. |
| Trading UI suppressed | Container / Wallstreet tabs blocked with toast; market ticker strip and Joelin assistant hidden for ops roles; portfolio shortcut buttons hidden in balance hero. |
| Wallet operational surface | **`WalletScreen`** `operationalMode` hides Portfolio/Earn demo tabs; shows operational banner + **`AdminOperationalAssets`** / **`RetailerOperationalAssets`** only. |
| Near-realtime refresh | **12s polling** on retailer incoming queue + admin approval/history panels (`wallet-operational-panel.tsx`). |
| Legacy URLs | **`/admin/treasury`** and **`/retailer/dashboard`** → **`redirect("/dashboard")`**. |
| Middleware | Level 5 **no longer** redirected off `/dashboard`. Level 2 redirected **only** from trading paths (`/trading-workspace`, `/war-room`, `/analysis`, `/race-conditions`, `/api-settings`) to `/dashboard` — **not** from `/dashboard`. |

---

## 2. Removed / avoided systems (for ops roles)

- Primary navigation entries: **Home (container)** and **Wallstreet** for `operationalWorkspace`.
- **LiveMarketFeedBar**, **Ticker**, testimonial strip (marketing), **Joelin** floating chat (mobile).
- **Sidebar “Market pulse”** when `operationalWorkspace` (no market sidebar column).
- Demo **Portfolio / Earn** tabs inside **`WalletScreen`** when `operationalMode`.

---

## 3. Restored systems

- **Retailer add-fund pipeline**: desks again use **`RetailerOperationalAssets`** + **`/api/user/retailer-incoming-queue`** (`retailer_fund_requests`) because they stay on **`/dashboard`** → Wallet → Assets.
- **Admin command surface**: **`AdminOperationalAssets`** again reachable because Level 5 stays on **`/dashboard`** (same path).

---

## 4. Routing changes

| Before | After |
|--------|--------|
| Middleware sent **ADMIN** from `/dashboard` → `/admin/treasury` | Admin may use `/dashboard`. |
| Middleware sent **RETAILER** from `/dashboard` → `/retailer/dashboard` | Retailers may use `/dashboard`; trading-only paths redirect to `/dashboard`. |
| Client sent credit desks → `/retailer/dashboard`, L5 → `/admin/treasury` | Client lands ops roles on **`wallet`** tab. |

---

## 5. Realtime integrations

| Approach | Status |
|----------|--------|
| **Supabase Realtime (`postgres_changes`)** | **Not enabled** in this pass — `retailer_fund_requests` / treasury rows typically require **service_role** or narrow RLS for browser clients; needs publication + policy review per table. |
| **Polling (12s)** | **Enabled** on admin + retailer operational panels as operational substitute. |

---

## 6. Treasury logic applied

- Authoritative USD treasury mutations remain in **`lib/financial/treasury-authority.ts`** (`treasury_balances`, `MAIN_TREASURY`, RPC `update_treasury_usd`). No schema change in this phase.
- **`admin_treasury_pool`** (legacy single-row display) still exists in DB but **`/admin/treasury`** now redirects to **`/dashboard`**; admins should use **financial-events + operations-desk** for tracing.

---

## 7. Retailer logic applied

- Incoming queue: **`retailer_fund_requests`** via **`retailer-incoming-queue`** API (unchanged).
- **Qualified retailers** API already enforces **country**, **network**, **spendable retail liquidity**, and **open ticket cap** (`app/api/user/qualified-retailers/route.ts`).

---

## 8. Transaction protections (verified / unchanged)

- **Fixed trades**: debit **`available_balance`** (Nexus Main) — see `app/api/user/fixed-trade/open/route.ts`.
- **Retailer approvals**: solvency checks live in **`lib/server/retailer-funding-helpers.ts`** + approval routes (existing behavior).

---

## 9. Solvency checks

- **Qualified retailer list**: spendable liquidity vs requested amount (existing).
- **Approval execution**: unchanged server handlers; ensure regression tests when altering RPCs.

---

## 10. APIs connected / disconnected

| API | Ops relevance |
|-----|----------------|
| Connected | `/api/user/retailer-incoming-queue`, `/api/admin/*` desk routes, `/api/admin/financial-events`, `/api/user/retail-balance-transfer`. |
| Blocked for retailers | Trading APIs via middleware `TRADING_API_PATHS` (unchanged). |

---

## 11. Financial handler logic

- No new RPCs. Treasury/user balance mutations still route through existing server helpers and **`recordFinancialEvent`** where applicable.

---

## 12. Role isolation logic

- **`operationalWorkspace`** = `trading_user_level === 5` OR `(level === 2 && retailer_credit_seller)`.
- Level 2 **without** credit-desk flag keeps normal trader dashboard (unless middleware restricts paths).

---

## 13. Tests performed

- **`npm run build`**: **PASS** (Next.js 16.2.4).

---

## 14. PASS/FAIL vs acceptance list (this phase)

| Criterion | Result |
|-----------|--------|
| Admin lands in Assets (Wallet) | **PASS** (defaults `wallet` tab + restricted nav). |
| Retailer lands in Assets | **PASS** for designated desks (`operationalWorkspace`). |
| Retailer receives funding requests live | **PARTIAL** — queue wired + **12s poll**; **not** true Realtime yet. |
| Admin treasury history operational | **PARTIAL** — exists inside **`AdminOperationalAssets`** history/financial-events; consolidated “treasury SSOT” UI still mixed concepts (`treasury_balances` vs `admin_treasury_pool`). |
| Admin notifications center | **FAIL** — no new institutional feed (desk queues only). |
| Appeals open into persistent support chat | **FAIL** — **`AdminSupportChatPanel`** remains AI copilot; no DB-backed threads shipped. |
| Realtime updates | **PARTIAL** — polling only. |
| Retailer settings/security | **PARTIAL** — **Settings** screen unchanged; sessions API exists. |
| Users blocked from overspending | **PASS** (existing fixed-trade paths). |
| Retailers blocked from over-approve | **PASS** (existing helpers). |
| Treasury debits/credits | **PASS** (existing RPC layer; not re-audited end-to-end). |
| Immutable history | **PASS** (append-only tables; UI must not expose delete — unchanged). |
| Regional retailer filtering | **PASS** (qualified-retailers). |
| Placeholder/demo removed for ops | **PASS** (Portfolio/Earn hidden; demo arrays still exist for non-ops users). |

---

## 15. Known remaining risks

1. **Operational bootstrap / saved workspace** may briefly restore a trading tab before ops guard runs — mitigated by follow-up effect forcing `wallet` for `operationalWorkspace`.
2. **Supabase Realtime** not wired — polling can lag up to ~12s under load.
3. **Appeals + institutional notifications + persistent chat** require **new tables**, **RLS**, and **UI** — not in this PR.
4. **`admin_treasury_pool` vs `treasury_balances`** — two representations; consolidation is a **follow-up migration + app alignment**.

---

## 16. Rollback instructions

1. Revert **`middleware.ts`** (restore admin `/dashboard` → `/admin/treasury` and retailer `/dashboard` → `/retailer/dashboard` if desired).
2. Restore **`app/dashboard/page.tsx`** redirect `useEffect` and remove `operationalWorkspace` gating.
3. Restore **`app/admin/treasury/page.tsx`** and **`app/retailer/dashboard/page.tsx`** previous implementations from git history.
4. Remove **`operationalMode`** / **`operationalWorkspace`** props from **Header**, **BottomNav**, **WalletScreen**.
5. Remove polling **`setInterval`** blocks in **`wallet-operational-panel.tsx`**.

---

## Deploy notes

Ship this commit to VPS with existing **`scripts/deploy-vps-git-archive.sh`** or **`scripts/deploy.sh`**; no DB migration required for the routing/UI slice.
