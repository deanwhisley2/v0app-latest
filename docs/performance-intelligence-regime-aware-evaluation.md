# Performance Intelligence + Regime-Aware Execution Evaluation

## Performance blind-spot audit

- **Execution quality by regime**: previously no persistent per-regime quality snapshots.
- **Confidence realism**: no durable reliability-error tracking (confidence vs realized outcome).
- **Governance effectiveness**: approvals/denials logged, but no summary analytics for false-positive/false-negative tendencies.
- **Execution friction quality**: no explicit fill-latency / throughput stress scoring.
- **Performance drift visibility**: no mechanism to turn worsening reliability into tighter governance.

## Execution evaluation architecture

- New engine: `lib/execution-performance-engine.ts`
  - Computes self-performance metrics from runtime history tables.
  - Writes durable snapshots:
    - `RegimePerformanceSnapshot`
    - `ConfidenceAuditSnapshot`
    - `GovernanceEffectivenessSnapshot`
    - `ExecutionQualitySnapshot`
- Triggered after completed liquidation lifecycle (filled close) and available through API refresh endpoint.

## Regime-aware performance methodology

- Uses `TradeMemory` grouped by `marketRegime`.
- Per-regime metrics:
  - trade count
  - win rate
  - avg pnl
  - avg hold duration
  - confidence reliability error
- Logged with `[performance-regime]`.

## Confidence realism model

- Reliability error (Brier-style): `(predicted_confidence - outcome)^2`.
- Tracks:
  - `highConfidenceLosses`
  - `lowConfidenceWins`
  - global `reliabilityError`
  - by-regime confidence profile
- Logged with `[confidence-audit]`.

## Signal reliability model (current scope)

- Current deterministic proxy uses confidence/outcome realism and regime slice behavior from `TradeMemory`.
- This phase establishes persistence + evaluation framework; deeper per-signal attribution (Kalman/liquidity/sentiment/race) can be expanded once those components are written explicitly into memory payload fields.
- Logged via `[signal-reliability]` through future extension on the same engine.

## Governance-effectiveness analytics

- Aggregates `GovernanceApprovalLog` by lookback window.
- Computes:
  - approvals / denials
  - denial rate
  - blocked-would-be-win proxy
  - approved-loss-rate proxy
- Logged with `[governance-effectiveness]`.

## Execution-quality intelligence design

- Reads filled `TradeOrder` rows.
- Computes:
  - average fill latency (`createdAt` -> `filledAt`)
  - quote-throughput proxy (`quoteAmount / fill_seconds`)
  - stress penalty from latency + throughput weakness
- Logged with `[execution-quality]` and contributes to `[performance-drift]` tightening.

## Persistence strategy

- New persistent tables:
  - `RegimePerformanceSnapshot`
  - `ConfidenceAuditSnapshot`
  - `GovernanceEffectivenessSnapshot`
  - `ExecutionQualitySnapshot`
- APIs:
  - `POST /api/expert/performance/refresh`
  - `GET /api/expert/performance/status`

## Safety-first integration

- Governance now reads latest confidence/execution quality penalty and compresses approvals further when performance uncertainty degrades.
- Drift log emitted as `[performance-drift]`.
- Principle enforced: uncertainty in performance => more conservative approvals.

## Remaining blind spots

- Slippage is still a proxy (fill quality currently latency/throughput based).
- Governance false-positive/false-negative calculations are approximate until counterfactual backtesting store is formalized.
- Per-signal attribution is limited by currently sparse structured signal-component persistence.

## Scaling/performance implications

- Snapshot writes are append-only and cheap; indexed by user + time.
- Refresh API allows scheduled/off-peak recompute.
- Governance consumes only latest snapshots, minimizing hot-path overhead.
