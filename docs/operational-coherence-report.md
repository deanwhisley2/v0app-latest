# Operational coherence (runtime truth + deployment)

## What changed (code)

| Area | Change |
|------|--------|
| **Unified market regime** | `resolveAuthoritativeMarketState` (`lib/market-state-authority.ts`) is the shared entry — wraps `refreshLiveMarketStructure`, logs `[runtime-market-state] consumer=…`. Expert analyze + time-bound calibration use live labels; execution sessions store Governor snapshot `marketRegime`. Trade memory buckets via `regimeBucketForTradeMemory`. |
| **Calibration penalties** | `applyRegimePenalty` covers full live regimes; **UNKNOWN** only on explicit degraded/offline fallback. |
| **Governance** | `requestGovernanceApproval` uses authority + bounded **epistemic** tightening from latest `EpistemicCalibrationSnapshot` (≤ 0.08, logs `[epistemic-governance-hook]`). Exposure snapshot gains `authoritativeMarketDegraded`. |
| **Startup** | `npm run start:with-recovery` (`reconcile-on-start` then `next start`). Repo `ecosystem.config.js` uses it for `nexus`. Optional `instrumentation.ts` when `STARTUP_ORCHESTRATE_INSTRUMENTATION=1`. |
| **Observability** | `GET /api/expert/operational/status` aggregates gate + live market + cognition hooks + last governance decision. |
| **Smoke test** | `npm run operational:smoke` → `scripts/operational-smoke-check.ts` (explicit PASS/FAIL lines). |

## Deployment checklist (your server — not runnable from CI here)

1. Env parity: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXUS_EXPERT_FALLBACK_USER_ID`, Binance vars if executing, `NEXT_PUBLIC_SUPABASE_ANON_KEY` for auth.
2. Supabase SQL: run `docs/supabase-all-deltas-in-order.sql` or full `phase2-supabase-migration.sql`; verification **17** governance-extension tables (+ core Phase 2).
3. `npm ci && npm run build && npm run start:with-recovery` (or PM2 `ecosystem.config.js`).
4. Browser: signed-in Expert user → open `GET /api/expert/operational/status`.
5. Shell: `npm run operational:smoke` on the server (loads `.env.local`).

## Dead-path / simplification classification

| Item | Verdict |
|------|---------|
| `ecosystem.config.cjs` vs `ecosystem.config.js` | **MERGE** — align server preset with repo `start:with-recovery`; documented in `.cjs` header. |
| Prisma schema | **KEEP** (documentation parity; runtime writes use Supabase service role — verify drift occasionally). |
| Causal/meta on hot execution path | **KEEP** — intentionally **not** wired into `requestGovernanceApproval`. |
| Dedicated governance APIs (`/market-structure`, etc.) | **KEEP** — operator visibility. |

## Remaining operational risks

* **Multi-instance:** `start:with-recovery` per replica may race reconciliation — prefer one bootstrap job or singleton leader.
* **`getResumeGate`:** Missing `StartupRecoveryState` row ⇒ `EXECUTION_BLOCKED` until recovery runs once.
* **Binance outages:** Authority degrades to UNKNOWN + conservative calibration; governor falls back to `EngineGovernanceState` regimes for compression keys.
