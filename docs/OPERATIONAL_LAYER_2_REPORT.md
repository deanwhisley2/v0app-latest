# Operational layer 2 — Realtime, treasury SSOT, support threads

Date: 2026-05-12  
Migration file: `supabase/migrations/20260520140000_operational_realtime_rls_treasury_ssot_support.sql`

---

## 1. Realtime tables connected (publication `supabase_realtime`)

| Table | Purpose |
|-------|---------|
| `retailer_fund_requests` | Funding queue |
| `withdrawal_requests` | Withdrawal lifecycle |
| `treasury_balances` | MAIN_TREASURY USD row |
| `container_balance_events` | Ledger-style user events |
| `user_account_notifications` | In-app notifications |
| `retailer_applications` | Onboarding queue |
| `operational_support_threads` | Support / appeals |
| `operational_support_messages` | Thread messages |

`unified_ledger` is **not** in Realtime (audit volume); admins use API + history panels.

---

## 2. RLS policies applied (high level)

- **`auth_is_level5()`** — reads `profiles.trading_user_level` for `auth.uid()` (`SECURITY DEFINER`). Used in policies; **not** JWT `user_metadata`.
- **`retailer_fund_requests`** — customer (`user_id`), desk (`retailer_profiles` join), or Level 5.
- **`withdrawal_requests`** — owner or Level 5.
- **`treasury_balances`** — Level 5 **SELECT only** (subscribe to MAIN_TREASURY).
- **`unified_ledger`** — Level 5 **SELECT** for `entity_type = 'TREASURY'` only.
- **`container_balance_events`** — owner or Level 5.
- **`retailer_applications`** — applicant or Level 5.
- **`operational_support_threads` / `operational_support_messages`** — thread parties + Level 5; insert rules enforce `sender_role` + membership.

All use **least privilege**; Realtime delivery matches the same row visibility as PostgREST SELECT.

---

## 3. Subscription scopes (client hook)

File: `hooks/use-operational-realtime.ts`

| Role | Channels |
|------|----------|
| **admin** | All relevant tables (no filter where policy already restricts rows). `treasury_balances` filtered `wallet_type=eq.MAIN_TREASURY`. |
| **retailer_desk** | `retailer_fund_requests` filtered `retailer_id=eq.<retailer_profiles.id>`. Support + notifications. **No** withdrawal broadcast (no broad SELECT for desks). |
| **trading_user** | `retailer_fund_requests` `user_id=eq.*`, `withdrawal_requests` `user_id=eq.*`, own notifications, support, own `container_balance_events`. |

Integrated in `components/dashboard/wallet-operational-panel.tsx` for **AdminOperationalAssets** and **RetailerOperationalAssets**. Polling fallback extended to **45s**.

---

## 4. Treasury SSOT architecture

- **Authoritative balance:** `public.treasury_balances` where `wallet_type = 'MAIN_TREASURY'` (USD).
- **Mutations:** existing RPC **`update_treasury_usd`** (unchanged grant model: `service_role` / server).
- **Legacy:** `admin_treasury_pool` — **deprecated** in DB comment; one-time **`GREATEST`** merge from legacy row into `MAIN_TREASURY` when `admin_treasury_pool` exists.
- **Audit:** `unified_ledger` gains **`balance_before_usd`** / **`balance_after_usd`** populated on treasury lines from `update_treasury_usd`.

---

## 5. Removed / deprecated treasury duplicates

- App code already avoided `admin_treasury_pool`; migration formalizes **SSOT = `treasury_balances`** and merges legacy numeric once.

---

## 6. Support thread schema

- **`operational_support_threads`** — `user_id`, `category`, `status`, optional `linked_kind` / `linked_id`, `assigned_admin_id`, unread flags, timestamps.
- **`operational_support_messages`** — `thread_id`, `sender_user_id`, `sender_role` (`user` | `admin` | `system`), `body`, `attachment_meta` (future).

---

## 7. Appeals / support workflow

| Step | Mechanism |
|------|-----------|
| User opens thread | `POST /api/user/support-threads` (creates thread + first message). |
| User replies | `POST /api/user/support-threads/[threadId]/reply`. |
| Admin lists | `GET /api/admin/support-threads` (Level 5). |
| Admin reads | `GET /api/admin/support-threads/[threadId]`. |
| Admin replies | `POST /api/admin/support-threads/[threadId]/reply`. |
| Realtime | Subscriptions on threads/messages refresh operational panels when RLS allows. |

**UI:** Full chat UI inside **Admin Support** tab is a **follow-up** (APIs are ready). Deep-link from notifications → thread id is a **follow-up** (`nav` / query param).

---

## 8. Notification linking

- Not yet wired end-to-end: insert into `user_account_notifications` on new admin message is **recommended next** (trigger or API side-effect).

---

## 9. PASS / FAIL tests (manual / local)

| Test | Result |
|------|--------|
| `npm run build` | **PASS** |
| Migration applied on remote | **PENDING** — run `supabase db push` or MCP `apply_migration` against your project. |
| Realtime receives events | **PENDING** — requires migration + Supabase Realtime enabled on project. |

---

## 10. Remaining operational risks

1. **`profiles.trading_user_level` staleness** — JWT may lag; `auth_is_level5()` reads live profile (good), but cache/session refresh still matters for edge cases.
2. **Realtime volume** — Level 5 subscription to `container_balance_events` can be chatty; consider narrowing filters later.
3. **Service-role APIs** — User/admin support routes use **`createAdminClient()`** with bearer-verified `user.id` / Level 5 — correct server-side enforcement; not a substitute for client RLS on anon key misuse.

---

## 11. Rollback instructions

1. Revert migration (restore prior `update_treasury_usd`, drop new tables/policies/publication entries) using a **down migration** crafted from this file’s inverse — or restore DB snapshot.
2. Remove `hooks/use-operational-realtime.ts` imports from `wallet-operational-panel.tsx`.
3. Delete `app/api/**/support-threads/**` routes if rolling back API surface.

---

## Apply migration

From repo root (linked project):

```bash
supabase db push
```

Or Supabase MCP **`apply_migration`** with the SQL file contents for production.
