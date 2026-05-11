# Nexus — Cursor discussion log

Newest first. Add a block after each important session (paste yourself, or ask the agent to append here).

---

### 2026-05-03 — DEFERRED: Supabase exchange keys + `coin_list` architecture (saved spec)

Full user design + SQL + file layout + **implementation review** (RLS, tenancy, public vs signed endpoints):  
**`docs/workflow-notes/deferred-supabase-exchange-keys-architecture.md`** — implement when Supabase is back; revise RLS before running the raw SQL as written.

---

### 2026-05-03 — DEFERRED: Supabase (run when server / project is back)

**Context:** Anything that requires **executing SQL or touching the live Supabase project** waits until the server/database is available again. The **app code is already in the repo**; only the **remote DB step** is paused.

**When you turn the server / Supabase back on, deploy in this order:**

1. Confirm env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and any server secrets you use) on the host that runs Next.js.  
2. In **Supabase → SQL Editor**, run the full script: **`supabase/blocked_trade_patterns.sql`** (creates `blocked_trade_patterns` + RLS policies).  
3. Smoke test while **logged in**: open dashboard → Wall Street → Run analysis; in DevTools confirm **`GET /api/learner-patterns`** returns `200` and `patterns` (may be `[]` until learner blocks something).  
4. After a learner block fires, confirm **`POST /api/learner-patterns`** succeeds and a row appears in **Table Editor** for your user.  
5. Restart Next.js once and repeat step 3 — patterns should **hydrate** into the shared validator via `hydrateSharedLearnerFromServer()`.

**Still optional later:** Redis (or DB) for demo mode multi-instance; wire `TradeComparisonSystem` to `getSharedValidator()` for CLI/UI rule parity.

---

### 2026-05-03 — Learner patterns: Supabase persistence (cross-restart)

**Summary:**  
Added **`blocked_trade_patterns`** SQL (`supabase/blocked_trade_patterns.sql`), **`GET`/`POST` `/api/learner-patterns`** using cookie-based `createRouteHandlerSupabaseClient` (no service role in browser), **`lib/learner-patterns-client.ts`**, **`applyLearnedPatternToValidator` + `importBlockedPattern` + optional `onPatternBlocked` hook** on `StrategyLearner`, and **`hydrateSharedLearnerFromServer()`** called at the start of **`runFullTradingPipeline`**. New blocks sync to Supabase when the user is logged in; guests get empty hydrate.

**Decisions:**  
- **No** `SUPABASE_SERVICE_ROLE_KEY` in client code — RLS + user session only.  
- **SQL run on Supabase is deferred** until the server/project is back — see **“DEFERRED: Supabase”** entry above for the exact checklist.

**Next steps:**  
- [ ] *(Deferred)* Run `supabase/blocked_trade_patterns.sql` in SQL Editor when Supabase is available.  
- [ ] Optional: point `TradeComparisonSystem` at shared validator; Redis for demo multi-instance.

---

### 2026-05-03 — Trading pipeline hardening + adviser follow-up (shared validator)

**Summary:**  
Implemented **shared `PreTradeValidator` + `StrategyLearner`** so learned block rules persist across `runFullTradingPipeline` runs in the same browser session (same module singletons). Earlier in the same arc: real Binance depth → Nexus + sentiment bias, `lib/full-trading-pipeline.ts`, demo mode API + SafetyPanel toggle, bot-commander `accessLevel` + demo execution gate, dashboard AI panel calling the real pipeline. Adviser review acknowledged; this commit closes the “new validator every run” gap they flagged.

**Decisions:**  
- **Persistence:** same-session = shared singleton; cross-restart = `/api/learner-patterns` + table *(SQL deploy deferred — see DEFERRED entry)*.  
- **Telegram / SafetyNotifier** stays off the client pipeline (Node `fs`); route-based alerts remain the next increment if desired.  
- **`TradeComparisonSystem`** still constructs its own validator/learner; unifying with `shared-validator-state` is optional follow-up for scripts.

**Files / areas:**  
- `lib/shared-validator-state.ts` — `getSharedValidator`, `getSharedLearner`, `ensureSharedValidationState`, `resetSharedValidationState`.  
- `lib/full-trading-pipeline.ts` — uses shared validator + audit note.  
- Related (same deployment thread): `lib/order-book-mapper.ts`, `lib/binance-api.ts` (`getBinanceOrderBook`), `lib/trading-strategies.ts` (`analyzeWithAllStrategiesAsync`, `sentimentBiasFromReport`, `buildMarketData`), `nexus-core/nexus-engine.ts` (`sentimentBiasScore`), `lib/demo-mode-manager.ts`, `app/api/demo-mode/route.ts`, `app/api/bot-commander/route.ts`, `components/bot-commander/SafetyPanel.tsx`, `components/dashboard/ai-panel.tsx`.

**Next steps:**  
- [ ] Persist learner patterns across reloads (DB or JSON file) + optional `initializeSharedState` loader.  
- [ ] Optional: wire `TradeComparisonSystem` / scripts to `getSharedValidator()` for one global rule set.  
- [ ] If deploying serverless/edge: replace in-memory demo mode with Redis or a shared config store.  
- [ ] Telegram for blocks: small API route that calls `SafetyNotifier` or `TelegramNotifier` server-side only.

---

### 2026-05-03 (evening) — Resting; desktop shortcut for backups

**Summary:**  
User pausing for rest. Session recap: we use **`cursor256/`** in the Nexus repo for written summaries and decisions (not automatic Cursor cloud sync). A **desktop launcher** was added so you can open this folder in one click and copy it to USB, cloud, or another drive.

**Decisions:**  
- Keep backing up **`/home/whisley2/Downloads/v0app_latest/cursor256`** (or the whole repo) when you care about durability beyond this machine.

**Files / areas:**  
- `~/Desktop/Open-cursor256-Nexus.desktop` — opens `cursor256` in the default file manager (`xdg-open`).

**Next steps:**  
- [ ] When rested: copy `cursor256` (or zip it) to your safe location.  
- [ ] If the desktop file shows “untrusted,” right-click → **Allow Launching** (GNOME) or equivalent.

---

### 2026-05-03 — Project chat log (`cursor256`) + work snapshot

**Summary:**  
Renamed the project-memory folder from `cursor-history` to **`cursor256`** so it is easy to find. This log is where we append session summaries; Cursor still keeps the live thread separately—this folder is deliberate backup / team memory.

**Decisions:**  
- Use **`cursor256/`** as the canonical path for “summarise and save” requests (`README.md`, `LOG.md`, `ENTRY-TEMPLATE.md`).
- Agent should **prepend** new entries under “Newest first” and keep secrets out of committed text.

**Files / areas (current tree — not all committed yet):**  
- **Auth / email:** `app/api/auth/*`, `app/auth/login`, `register`, `AuthContext`, Supabase client; OTP / verification flows.  
- **Dashboard / trading UX:** `ai-panel`, `container-mode`, `strategy-analyzer`, `header`, `bottom-nav`, `settings-screen`, `trade-coin-explorer`, `dashboard/page`.  
- **Libs:** `UserPreferencesContext`, `user-preferences`, `currency-display`, `container-earnings-schedule`, `paper-trade-storage`, `trade-explore-coins`, `exchange-coin-support`, `i18n/*`, `dev-local-*`, `middleware`.  
- **Ops:** `ecosystem.config.js`, `next.config.mjs`, `scripts/deploy` area as needed.

**Next steps:**  
- [ ] Ask for a log append after big sessions: *“Summarise and put it in `cursor256/LOG.md`”*.  
- [ ] Redact secrets before any paste into this folder; commit when happy.

---

## Template (copy below the line)

### YYYY-MM-DD — Title

**Summary:**  
What we agreed or built.

**Decisions:**  
- …

**Files / areas:**  
- …

**Next steps:**  
- …

---

<!-- Add new entries above this line -->
