# Drift Detection + Stability Intelligence

## Drift blind-spot audit

| Area | Prior visibility | Risk if ignored |
|------|------------------|-----------------|
| Confidence calibration drift | Point-in-time audits only | Silent overconfidence → bad fills |
| Regime classification churn | Live logs, no rolled stability score | Governance/outcomes misaligned |
| Governance approval drift | Raw logs | Over/under blocking undetected |
| Execution quality decay | Latest snapshot only | Latency/slippage creep |
| Signal reliability | Proxy via confidence error | Component-level blind |
| Reconciliation stress | Per-event logs | Rising divergence frequency missed |
| Recovery frequency | Startup gate | Repeat recovery cycles not scored |

## Stability intelligence architecture

- **Engine**: `lib/stability-intelligence-engine.ts`
- **Current authoritative state**: `DriftDetectionState` (per user)
- **History**: `StabilitySnapshot`, `StabilityPressureHistory`, `DriftEvent`
- **Baselines**: `BehavioralBaseline` (rolling window metrics JSON)

## Baseline methodology

- Splits last N performance snapshots (confidence, execution quality, governance) into **recent half** vs **older half** (chronological halves on newest-first arrays).
- Computes relative drift ratios: `abs(current - baseline) / max(|baseline|, epsilon)`.
- Augments with:
  - Global **regime transition instability** from `MarketStructureSnapshot`
  - **Reconciliation stress** from `ExchangeReconciliationLog` HIGH/CRITICAL counts
  - **Regime behavioral instability**: variance of win-rate across recent `RegimePerformanceSnapshot` rows per regime

## Drift classification model

Deterministic levels from **max drift ratio** and **stability pressure**:

- `STABLE`
- `MINOR_DRIFT`
- `MODERATE_DRIFT`
- `SEVERE_DRIFT`
- `CRITICAL_INSTABILITY`

## Stability-pressure model

Weighted blend of drift dimensions (confidence, high-conf loss rate, execution stress, latency, slippage, governance denial rate, regime churn, reconciliation stress). Clamped to `[0, 1]`.

## Regime-stability analytics

- **Market**: transition rate in live structure snapshots.
- **Behavioral**: win-rate variance within each regime’s recent performance samples (unstable performance profile when variance is high).

## Execution consistency methodology

- Coefficient-of-variation style score from recent fill latency series in execution-quality snapshots: higher variance → lower `executionConsistencyScore` (stored on `StabilitySnapshot`).

## Governance integration

- `requestGovernanceApproval` applies `(1 - stabilityPenalty)` on compression where `stabilityPenalty` derives from persisted `DriftDetectionState`.
- Hard gate: BUY blocked when drift is `CRITICAL_INSTABILITY`, or `SEVERE_DRIFT` with pressure ≥ `0.72`.

## Persistence strategy

- Snapshot append-only audit trail plus upsert current state for hot-path reads.
- APIs:
  - `POST /api/expert/stability/refresh`
  - `GET /api/expert/stability/status`
- `refreshExecutionPerformance` chains `refreshStabilityIntelligence({ force: true })` so new performance data immediately updates drift.

## Durable logging

- `[drift-detected]`, `[stability-pressure]`, `[confidence-drift]`, `[governance-drift]`, `[execution-instability]`, `[baseline-shift]`, `[regime-instability]`, `[performance-regime]`, `[slippage-analysis]` (when slippage drift event fires)

## Remaining blind spots

- No counterfactual store for “blocked trades that would have won” (still proxy-only).
- Component-level signal scores need richer `TradeMemory` fields for full attribution.
- Hysteresis/debounce on drift level flips can be tuned per deployment.

## Scaling / performance

- Throttled default refresh (`minRefreshMs`); forced refresh on performance pipeline.
- Governance reads a single `DriftDetectionState` row per approval.
