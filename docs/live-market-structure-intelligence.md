# Live Market Structure Intelligence + Dynamic Regime Engine

## Static-assumption audit

- `AssetCorrelationState` was persistent/manual seeded and could go stale during regime breaks.
- `EngineGovernanceState.marketRegime` / `systemicRiskState` relied on manual control and slow operator updates.
- `effectiveExposureMultiplier` and compression logic were mostly static policy coefficients.
- Exposure checks were strong but could lag during rapid volatility/liquidity transitions.
- Risk during stale assumptions: delayed tightening in panic, false-normal posture in liquidity stress, and underestimation of correlation convergence.

## Dynamic regime architecture

- New engine: `lib/market-regime-engine.ts`
  - pulls live Binance market structure metrics
  - computes volatility, liquidity stress, rolling BTC-alt correlation signals
  - classifies live regime + systemic state deterministically
- Regime classes now include:
  - `TRENDING`, `SIDEWAYS`, `CHOPPING`, `VOLATILE`, `PANIC`, `LOW_LIQUIDITY`, `LIQUIDITY_STRESS`, `CASCADE_CONDITIONS`, `RECOVERY_BOUNCE`

## Live correlation methodology

- Pull minute-level rolling returns (`/api/v3/klines`) for `BTCUSDT`, `ETHUSDT`, `SOLUSDT` (extensible set).
- Compute rolling BTC-to-alt absolute correlation.
- Use correlation score directly in governance compression and exposure risk interpretation.
- Keep `AssetCorrelationState` as persistent structure memory; augment with live correlation score for immediate state awareness.

## Volatility/liquidity intelligence model

- Volatility score: normalized stddev of rolling BTC minute returns.
- Liquidity stress score: spread widening + volume pressure proxy from ticker 24h and bid/ask spread.
- Regime/systemic classification combines volatility, liquidity stress, correlation, and BTC move pressure.
- Conservative bias: higher uncertainty => stronger compression.

## Regime-transition model

- New state persistence tracks transitions (`transitionFrom`, `transitionAt`) in `LiveStructureState`.
- Transition logs emitted via:
  - `[regime-transition]`
  - `[market-regime]`
- Transition-aware failure philosophy: when shifts accelerate into stress regimes, governance tightens before approvals.

## Governance integration design

- `requestGovernanceApproval` now refreshes live structure (throttled cache window) and uses:
  - live regime
  - live systemic state
  - live volatility/liquidity/correlation penalties
- Compression factor now combines:
  - policy regime/systemic compression
  - correlation uncertainty
  - live structure penalty
- New logs:
  - `[market-regime]`
  - `[regime-transition]`
  - `[correlation-shift]` (captured via correlation score movement in snapshots)
  - `[liquidity-stress]` (via stress score in snapshots)
  - `[volatility-expansion]` (via volatility score in snapshots)
  - `[systemic-escalation]` (state transitions reflected in live/systemic output)
  - `[market-structure]` (snapshot persistence)

## Historical market-state persistence model

- `LiveStructureState`: latest live computed state (authoritative current regime/systemic posture).
- `MarketStructureSnapshot`: time-series history for analytics and future calibration safety.
- API visibility:
  - `GET /api/expert/governance/status` includes current live structure.
  - `GET /api/expert/governance/market-structure` returns live + historical snapshots.

## Remaining blind spots

- Liquidity stress currently uses public spread/volume proxies, not deep order-book imbalance depth.
- No direct liquidation-feed/funding-feed integration yet.
- Live correlation currently center-weighted around BTC-major pairs; broader sector matrices can be added.
- Hysteresis/debounce could be expanded further to reduce noisy rapid toggles in edge conditions.

## Scaling/performance considerations

- Live refresh is throttled (`minRefreshMs`) to avoid over-querying during high worker fanout.
- Shared persisted live state avoids each worker recomputing full market structure every loop.
- Snapshot writes are lightweight and append-only for auditability.
- PM2/distributed workers consume the same live structure authority, preventing per-worker market-state drift.
