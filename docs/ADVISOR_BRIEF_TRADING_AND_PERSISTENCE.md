# Nexus / v0app — Trading system & persistence (brief for advisor)

Use this to align on **what we built**, **how it works**, **where time goes**, and **what “done” looks like**.

## 1. Product strategy (trading logic)

- **Signals:** “Expert” analysis is **time-bound**: within a configurable window (60–600s), the server runs **fast paths** (order-book imbalance, funding, liquidity signals from `lib/server/fast-paths-core.ts`) and optionally **Grok (xAI)** when enabled. Outputs are **fused** into a single decision: `BUY` / `SELL` / `HOLD` with confidence and reasons (`lib/analysis/time-bound-analysis.ts`).
- **Execution gates:** Live money is **explicitly gated**: `NEXUS_REAL_TRADING=1`, per-user **Binance API credentials** (or server env keys for ops). Before placing orders we **validate the exchange** (spot enabled, symbol tradable, min notional, balance) via `lib/expert/exchange-precheck.ts`.
- **Analysis freshness:** Execution APIs require a **recent analysis** (default max age 60s), **not HOLD**, **confidence ≥ 65%**, and **symbol match** — see `lib/expert/execution-guards.ts`. Stale or weak signals **fail by design** (protects users, but feels like “the system doesn’t trade when I want”).
- **Sessions & orders:** Each trade run is a **`TradeSession`** with linked **`TradeOrder`** rows. NEX flow creates a session, **Binance market buy**, tracks fill, updates session status (`lib/expert/phase2-store.ts`, `app/api/expert/execute/nex/route.ts`).
- **Joelin / oscillator:** Separate track refreshes a **fixed liquid universe** via APIs (`/api/joelin/*`); some paths still mix **in-memory Joelin state** with live API updates.
- **Paper / demo:** Portions of the dashboard use **browser `localStorage`** for paper balances and ad‑hoc UI — **not** the same as server-backed expert sessions.

## 2. Implementation architecture

- **Stack:** Next.js (App Router), **Supabase Auth**, Route Handlers for `/api/*`, admin Supabase client for DB writes where configured.
- **Auth (Expert APIs):** `requireExpertUserId()` reads the user from **cookies** via `createRouteHandlerSupabaseClient()` (`lib/expert/auth-server.ts`). Browser uses **`@supabase/ssr` `createBrowserClient`** + **middleware** session refresh so the **server sees the same session as the UI** (fixes “signed in but 401”).
- **Persistence layer (Expert / Phase 2):** `lib/expert/phase2-store.ts` **dual-writes**:
  - **Primary when available:** Supabase tables `AnalysisHistory`, `NotificationRecord`, `TradeSession`, `TradeOrder`, and now **`ExpertChatMessage`** (chat timeline).
  - **Fallback:** In-process **`globalThis` maps** on each Node instance — **lost on cold start, scale-out, or restart** if DB insert failed or wasn’t migrated.
- **Real-time UI:** Chat uses **SSE** (`/api/chat/ws`) polling in-memory messages; messages are **hydrated from DB on connect** after migration so **refresh restores** the timeline when Supabase + service role work.

## 3. Challenges eating our time (honest list)

| Area | Symptom | Root cause |
|------|---------|------------|
| **Refresh / logout** | “Everything disappeared” | UI + **sessionStorage** / **localStorage** for some flows; Phase 2 **memory fallback**; Joelin state partly RAM-only. |
| **“Not trading”** | Orders blocked | **Freshness / HOLD / 65%** guards, **min notional**, **balance**, **`NEXUS_REAL_TRADING`**, missing keys — **correct risk controls** feel like bugs if expectations aren’t aligned. |
| **401 Expert** | “Sign in required” | Was **localStorage-only Supabase session** vs **cookie-based Route Handlers** — mitigated with SSR client + middleware. |
| **Multi-instance / VPS** | Random empty state | Serverless **multiple workers** → in-memory `phase2Store` not shared. **DB must be mandatory** for production truth. |
| **Operations** | Silent fallbacks | `console.warn` on insert failure then memory-only — **data looks OK until restart**. |

## 4. What we are executing toward (priority)

1. **Server as source of truth** for sessions, orders, analyses, chat — **no silent RAM-only for customer paths** when `DATABASE_URL`/Supabase is configured.
2. **Migrate Supabase** (`docs/phase2-supabase-migration.sql`) on every environment; ensure **service role** / admin client available for writes.
3. **On load:** dashboard / expert pages **`GET` APIs with `credentials: 'include'`** to **rebuild UI from DB** (already started for sessions; extend as needed).
4. **Paper/demo:** decide **per user persisted paper** vs **explicitly ephemeral** — avoid mixing metaphors in UX.
5. **Optional later:** Redux / RTK Query for **client cache** — **after** APIs reliably return full state.

## 5. Environment knobs (ops)

- `NEXUS_REAL_TRADING` — live trading gate.
- `NEXUS_GROK_ENABLED`, Grok keys — optional AI layer.
- `NEXUS_EXPERT_FALLBACK_USER_ID` — **integration only**, not production browsers.
- Supabase: `NEXT_PUBLIC_*` + **service role** for admin writes.

---

*Forward this doc as-is when discussing roadmap with your advisor; it reflects the codebase’s actual patterns and failure modes.*
