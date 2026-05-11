# Operational cleanup report — Wallstreet → Container authority

Date: 2026-05-11  
Scope: strategic consolidation (not random deletion). Governance, accounting, retailer/treasury, auth, and audit paths were preserved.

---

## 1. Removed systems inventory

### HTTP API routes (Next.js `app/api`)

| Path | Role removed |
|------|----------------|
| `/api/joelin/*` | Oscillator / stream / re-analyze — parallel signal universe outside Wallstreet+Container |
| `/api/demo-mode` | In-memory demo flag API (unused by dashboard) |
| `/api/auto-trader/abort` | In-memory stub for legacy auto-trader |
| `/api/binance-race` | Experimental prediction-race harness |

### Libraries / expert modules

| Item | Notes |
|------|--------|
| `lib/demo-mode-manager.ts` | Only served `/api/demo-mode` |
| `lib/expert/joelin-ranking.ts`, `joelin-safety-filter.ts`, `focus-daily-pipeline.ts`, `auto-trader-engine.ts` | Joelin / focus-20 pipeline only |
| `lib/observation-window-tick.ts` | Observation + focus-observer ticks only |
| `lib/trading-scheduler.ts`, `lib/market-intelligence.ts` | Used only by removed `trade-24-7` |
| `lib/bot-registry.ts`, `lib/bot-capability-types.ts` | Dead registry for removed bot-commander |

### `phase2` store / types

- Removed in-memory **`joelin`** coin array from `lib/expert/phase2-store.ts`.
- Removed types: `JoelinCoin`, `FocusCoinInsight`, `JoelinResponse`, `Position`, `AutoTraderConfig` from `lib/expert/phase2-types.ts` (only used by removed stacks).

### Scripts (`scripts/`)

Removed non-authoritative trading / observer entrypoints, including:

- `auto-trader-daemon.ts`, `auto-trader-1hr.ts`, `trade-24-7.ts`, `execute-live-trade.ts`
- `background-engine.ts`, `focus-20-observer-daemon.ts`, `observation-window.ts`
- `learn-coins.ts`, `test-trade-comparison.ts`, `test-trade-with-safety.ts`, `fix-trading-workspace.js`

**Replaced** `emergency-shutdown.ts` with a PM2 + `pkill` hygiene script (no simulation engine).

### UI / auth

- `components/auth/auth-joelin-panel.tsx` → **`auth-assistant-panel.tsx`** (`AuthAssistantPanel`) — same Nexus assistant behavior, no Joelin branding.

### Middleware

- Removed operational-freeze branch that targeted `/api/joelin` (route no longer exists).

### PM2 (`ecosystem.config.js`)

- Removed apps: **`nexus-auto-trader`**, **`nexus-observation-window`**, **`nexus-focus-observer`**.
- **Retained:** single app **`nexus`** (`npm run start:with-recovery`).

### `package.json` scripts

Removed npm scripts pointing at deleted files (auto-trader, trade-24-7, learn-coins, test-trade*, observation/focus daemons).

### Config comments

- `.env.local.example` — trimmed obsolete auto-trader / observation blocks; clarified legacy `/api/trade` removal.
- `app/api/analysis/time-bound/route.ts`, `lib/grok-symbol-eligibility.ts` — comments updated (no auto-trader daemon).

### Documentation / historical

- Older docs under `docs/` may still mention removed files; treat as historical unless updated in a later pass.

---

## 2. Retained systems inventory (high level)

| Area | Kept |
|------|------|
| **Wallstreet** | `components/dashboard/ai-panel.tsx`, `live-analysis-overlay.tsx`, `strategy-analyzer.tsx`, `lib/trading-strategies.ts`, `lib/full-trading-pipeline.ts`, `POST /api/analysis/time-bound`, `GET/POST /api/learner-patterns`, Grok status/eligibility |
| **Container** | `ContainerMode` UI, `/api/user/fixed-trade/*`, `/api/user/copy-trade/*`, `/api/user/container-earnings`, related balance RPC wiring |
| **Accounting / governance** | Admin + user financial routes, withdrawals, retailer flows, `financial-events`, `nexus-main` assert, `trades/record` (ledger hook), reconcile on start |
| **Auth / session** | Supabase auth routes, login/register/recovery, middleware session handling |
| **Market data** | Binance/Bitget/KuCoin proxies, exchange balances, `binance/live-market`, `market/compare` (supporting analysis, not duplicate execution products) |
| **Assistant** | `/api/nexus-assistant` (DeepSeek path variable renamed; behavior unchanged) |
| **Ops / health** | Health, launch verify, operational smoke / nexus financial check scripts |

---

## 3. Active runtime map (intended)

| Layer | Process / artifact |
|--------|----------------------|
| **Production PM2** | `nexus` only → `npm run start:with-recovery` → `next start` |
| **Next.js** | All routes listed in latest `next build` output (73 routes after cleanup) |
| **Supabase** | Unchanged by this pass — no remote `DROP` / migration applied here |

**Local PM2 check (this machine):** `pm2 ls` showed no running apps after cleanup instructions (empty table).

---

## 4. Remaining execution architecture (authoritative)

```
User → Dashboard
         ├─ tab "wallstreet" → AIPanel + LiveAnalysisOverlay
         │       → client: tradingStrategies + runFullTradingPipeline
         │       → server: POST /api/analysis/time-bound, learner-patterns, market feeds
         │
         └─ tab "container" → ContainerMode
                 → server: /api/user/fixed-trade/* , /api/user/copy-trade/*
                 → Supabase RPCs / RLS (existing financial enforcement layer)
```

External **`POST /api/trades/record`** remains for **audited** bot/script ledger rows (secret-gated), not as a second retail execution desk.

---

## 5. Rollback instructions (NEXUS_CHATGPT backup)

**Backup path:** `/home/whisley2/Downloads/NEXUS_CHATGPT/`  
**Pointer file in repo:** `BACKUP_NEXUS_CHATGPT.txt`

### Full tree rollback (stop app first)

```bash
# Example: restore working copy from backup (adjust DEST if your app lives elsewhere)
DEST=/home/whisley2/Downloads/v0app_latest
pm2 stop nexus 2>/dev/null || true
rsync -a --delete /home/whisley2/Downloads/NEXUS_CHATGPT/ "$DEST/"
cd "$DEST" && npm ci && npm run build && pm2 restart nexus
```

### Selective restore

Copy individual paths from `NEXUS_CHATGPT/` over `v0app_latest/` (e.g. a single deleted script) without `--delete` if you do not want to wipe newer files.

### Database

This cleanup did **not** drop Supabase tables or RPCs. Rollback of **DB** state is independent (use Supabase backups / migration history).

---

## 6. Acceptance tests (PASS / FAIL)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Backup created successfully (`NEXUS_CHATGPT` full rsync) | **PASS** — mirror at `/home/whisley2/Downloads/NEXUS_CHATGPT` (~2.6G including `node_modules`); `SNAPSHOT_README.txt` inside |
| 2 | Rollback capability verified | **PASS** — rsync reverse documented; spot-check: backup contains removed `app/api/joelin` tree |
| 3 | Only Wallstreet / Container trading remains active (product scope) | **PASS** (app) — no Joelin/demo/auto-trader/binance-race routes in build; Wallstreet + Container user APIs present |
| 4 | No orphan execution paths remain | **PASS** (build) — `npm run build` OK; residual risk: stale docs or external cron still calling old URLs → ops must grep prod logs |
| 5 | No duplicate trading engines in tree | **PARTIAL** — `lib/trade-comparison-engine` / `multi-coin-manager` remain for `send-telegram-report` / emergency hygiene; not wired to PM2 |
| 6 | Server runtime cleaned successfully | **PASS** (config) — ecosystem only `nexus`; **FAIL/UNKNOWN** on your actual VPS until you run `pm2 delete` on old apps (see §7) |
| 7 | PM2 / runtime state stable | **PASS** (local) — empty `pm2 ls`; **YOU** must confirm production |
| 8 | Accounting / governance unaffected | **PASS** (code review) — admin/user financial routes untouched; build excludes only non-core trading APIs |
| 9 | Operational environment simplified | **PASS** — fewer routes, one PM2 app definition, fewer npm scripts |

---

## 7. Required actions on your deployment server

**Important:** Every command that uses `package.json`, `scripts/`, or `npm run` must be executed from the **application root** (the folder that contains `package.json`), not from `/home/vpsuser` or `~` unless your app lives there.

Example (replace `APP` with your real deploy path, e.g. `/opt/nexus-pro`, `/var/www/nexus`, `~/nexus-app`):

```bash
APP=/opt/nexus-pro   # <-- set this to your cloned repo root
cd "$APP" || exit 1

npm run emergency:shutdown
# equivalent: npx tsx scripts/emergency-shutdown.ts

npm run pm2:restart
# equivalent: pm2 restart nexus
```

Legacy PM2 names (safe to run even if already gone):

```bash
cd "$APP" || exit 1
pm2 stop nexus-auto-trader nexus-observation-window nexus-focus-observer 2>/dev/null || true
pm2 delete nexus-auto-trader nexus-observation-window nexus-focus-observer 2>/dev/null || true
```

Review **cron** manually for removed scripts (`learn-coins`, `trade-24-7`, etc.); do not pipe `crontab -e` blindly.

Remove obsolete env blocks from **server** `.env` if desired (optional; unused keys are harmless).

---

## 8. Financial “authority” class (user-supplied sketch)

The TypeScript `FinancialAuthority` / `BalanceMutation` snippet from the request was **not** added to the repository: it references tables/RPCs (`balances`, `apply_balance_mutation`, `ledger`) that must align with your real Supabase schema. Existing enforcement remains the **migrations + RPC + route-layer** design already in the project. If you want that class as a façade, it should be implemented against the **actual** RPC names and tables in a dedicated follow-up.

---

## 9. Follow-up (optional)

- Grep production logs for `404` on `/api/joelin`, `/api/demo-mode`, `/api/binance-race`.
- Trim historical `docs/*` references to deleted scripts.
- Decide whether to delete `lib/trade-comparison-engine.ts` + dependents after migrating `send-telegram-report.ts` off `CoinLearningResult`.
