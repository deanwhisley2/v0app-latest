# Observational learning phase — handoff (save point)

**Purpose:** Controlled observation until evaluation tomorrow — simulation-first, telemetry-driven, **no live autonomous evolution** (no weight mutation, no strategy self-modification, no bypassing governance).

## What shipped in code

| Piece | Role |
|--------|------|
| `lib/observation-window-tick.ts` | Single tick: authoritative market state, resume gate, governance **BUY probe only** (lane `observation-window`), per-symbol **time-bound analysis** (fast, no Grok), confidence calibration, **`Analysis`** rows (`tradeExecuted: false`, reasons include `OBSERVATION_WINDOW`), optional **`runSandboxSimulation`** (persisted shadow replay), optional stability refresh, **`EvolutionAuditEvent`** `OBSERVATION_WINDOW_TICK`. |
| `scripts/observation-window.ts` | Daemon loop until **`OBSERVATION_UNTIL`** (default: start + 24h). Requires **`NEXUS_EXPERT_FALLBACK_USER_ID`**. Env: `OBSERVATION_SYMBOLS`, `OBSERVATION_INTERVAL_MS`, `OBSERVATION_ANALYSIS_WINDOW_SECONDS`, `OBSERVATION_GOVERNANCE_PROBE_USD`, `OBSERVATION_SKIP_STABILITY`. |
| `npm run observation:window` | Runs the daemon script. |
| PM2 **`nexus-observation-window`** | `ecosystem.config.js` — `autorestart: false` (process exits when window ends). |
| **`GET/POST /api/expert/observation/window`** | Telemetry: GET lists recent `OBSERVATION_WINDOW_TICK` audits; POST triggers one manual tick. |

## Operator checklist

1. **No live orders from this path** — tick does not call `/api/expert/execute/*`. For zero live exposure, also avoid running **`nexus-auto-trader`** and keep **`NEXUS_REAL_TRADING`** off.
2. Set end explicitly: `OBSERVATION_UNTIL=2026-05-07T23:59:59.000Z` (adjust date as needed).
3. Read telemetry: `GET /api/expert/observation/window?limit=40`, existing evolution/operational routes, **`GET /api/expert/trade-analytics`** for trade-memory analytics.

## Tomorrow’s evaluation prompts

- Repeatability of signal structures vs false positives  
- Governance overblocking vs safety  
- Regime-conditioned outcomes vs noise  
- Confidence realism and opportunity decay  
- Simulated execution coherence (sandbox / `SimulationRun` trail)

---

*Saved at commit:* see `git log -1 --oneline` after you commit this branch.
