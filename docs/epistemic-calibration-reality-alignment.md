# Reality-grounded epistemic calibration + market-truth alignment

Bridges **institutional cognition** (triad + pluralistic/meta stack) to **observed execution artefacts** so epistemic posture is not purely self-referential.

**Non-goals:** No autonomous mutation, no reputation self-authorizing “truth,” no override of constitutional execution gates.

---

## 1. Self-referential risk inventory

`SELF_REFERENTIAL_GOVERNANCE_RISK_INVENTORY` in `lib/self-referential-governance-risks.ts`

API: `GET /api/expert/epistemic-calibration/risks`

---

## 2. Calibration engine

`runEpistemicCalibrationAssessment` in `lib/epistemic-calibration-assessment.ts`

- Runs **institutional triad** with `quietTriadConsole: true` (no triad stdout spam).
- Loads **execution reality bundle** in parallel window:
  - `RiskState` (dayKey ≥ window start) — realized PnL sum, trade counts, max consecutive losses  
  - `StabilitySnapshot.executionConsistencyScore` (rolling)  
  - `AnalysisHistory` with `tradeExecuted` — win proxy from `tradeResult` JSON  
  - `TradeMemory` joined by `TradeSession` ids for the user in the window  

Outputs **execution quality score** (heuristic 0–1), **market-truth correlation proxy** (gap vs internal coherence), **reality divergence pressure**, **anti–self-referential safeguards**, **institutional humility**, composite **epistemicCalibrationIndex** / **realityGroundingScore**.

---

## 3. Logging

`[epistemic-calibration]`, `[market-truth]`, `[reality-alignment]`, `[execution-grounding]`, `[self-referential-risk]`, `[reality-divergence]`, `[institutional-humility]`

---

## 4. Persistence

| Table | Purpose |
|-------|---------|
| `EpistemicCalibrationSnapshot` | Full JSON payloads + headline indices |
| `EpistemicCalibrationEvent` | WARN/INFO (divergence, self-referential, sparse sample) |

Audit: `EPISTEMIC_CALIBRATION_ASSESSMENT_COMPLETE`

DDL: **`docs/supabase-delta-epistemic-calibration.sql`** (also in **`docs/supabase-all-deltas-in-order.sql`** section **6**).

---

## 5. APIs (`requireExpertUserId`)

| Method | Route |
|--------|--------|
| `POST` | `/api/expert/epistemic-calibration/assessment` |
| `GET` | `/api/expert/epistemic-calibration/snapshots?limit=` |
| `GET` | `/api/expert/epistemic-calibration/events?limit=` |
| `GET` | `/api/expert/epistemic-calibration/risks` |

---

## 6. Remaining risks

Heuristics scale PnL loosely; **sparse** windows raise **calibration confidence** discount and emit `SPARSE_EXECUTION_GROUNDING`. No fill-level audit; attribution to specific specialists is coarse.

## 7. Scaling

One triad evaluation + bounded queries (`AnalysisHistory` cap 800); JSON snapshots suitable for dashboard use.
