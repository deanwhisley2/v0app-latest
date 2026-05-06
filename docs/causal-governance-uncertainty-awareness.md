# Causal governance + uncertainty-aware market-reality cognition

Unifies probabilistic causal framing **on top of** epistemic calibration (market–truth alignment): counterfactual **interval masses**, attribution **uncertainty**, anti-overfitting stress, causal-divergence when narrative coherence exceeds execution corroboration.

**Hard constraints:** Not structural causal inference, not RCT-level identification, **not** autonomous governance mutation.

---

## 1. Causal illusion risk inventory

`CAUSAL_ILLUSION_RISK_INVENTORY` in `lib/causal-illusion-risks.ts`

API: `GET /api/expert/causal-governance/risks`

---

## 2. Engine (`runCausalGovernanceAssessment`)

1. Runs **`runEpistemicCalibrationAssessment({ persist:false, quietCalibrationConsole:true })`** — full triad underneath with quiet consoles.
2. Derives **`attributionUncertaintyMean`**, probabilistic attribution mass, causal fragility, counterfactual scenario list with **explicit interval bounds**.
3. Emits divergence pressure when coherent governance narrative may outstrip execution anchors.

---

## 3. Logging

Primary tags: `[causal-attribution]`, `[counterfactual-governance]`, `[probabilistic-truth]`, `[causal-divergence]`, `[attribution-uncertainty]`, `[anti-overfitting]`, `[institutional-causality]`, `[execution-grounding]` (anchors to calibration scalars).

---

## 4. Persistence

| Table | Role |
|-------|------|
| `CausalGovernanceSnapshot` | JSON payloads + causal index + probabilistic humility |
| `CausalGovernanceEvent` | WARN divergence / attribution overconfidence |

Audit: **`CAUSAL_GOVERNANCE_ASSESSMENT_COMPLETE`**

DDL: **`docs/supabase-delta-causal-governance.sql`**, **`docs/supabase-all-deltas-in-order.sql`** section **7** — verification expects **17** governance-extension tables.

---

## 5. APIs (`requireExpertUserId`)

| Method | Route |
|--------|--------|
| `POST` | `/api/expert/causal-governance/assessment` |
| `GET` | `/api/expert/causal-governance/snapshots?limit=` |
| `GET` | `/api/expert/causal-governance/events?limit=` |
| `GET` | `/api/expert/causal-governance/risks` |

---

## 6. Remaining causal risks

No instrumented SCM; counterfactuals are **scenario stress objects**, not identified effects. Calibration sparsity still widens ambiguity.
