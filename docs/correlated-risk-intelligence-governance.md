# Correlated Risk Intelligence + Portfolio-Aware Governance

## Current risk-model limitation audit

- Existing model protected nominal totals (`maxPortfolioExposureUsd`, `maxSymbolExposureUsd`, active sessions, daily loss).
- Limitation: treated symbol risks as mostly independent; correlated drawdown amplification was under-modeled.
- Correlated failure risk: portfolio could pass nominal checks while being cluster-concentrated (e.g., BTC-beta stack).
- Cascading risk gap: no native systemic state compression on risk limits during panic/low-liquidity regimes.

## Correlation architecture

- Persistent relationship layer added:
  - `AssetCorrelationState` (`baseSymbol`, `relatedSymbol`, `cluster`, `correlation`, `betaWeight`, `volatilityWeight`).
- Governance now computes:
  - nominal exposure
  - correlated exposure contribution from relationship map
  - cluster exposure distribution and dominant cluster concentration
- Default correlation seeds are initialized automatically when a base symbol has no map.

## Market-cluster model

- Cluster examples currently used:
  - `MAJOR_BTC_BETA`
  - `HIGH_BETA_L1`
  - `EXCHANGE_BETA`
  - `ALT_BETA`
  - `MEME_VOL`
- Each correlated relationship carries:
  - correlation coefficient
  - beta weight
  - volatility weight
- Effective cluster contribution = `relatedExposure * correlation * betaWeight * volatilityWeight`.

## Systemic-risk model

- Added governance state dimensions in `EngineGovernanceState`:
  - `marketRegime`: `TRENDING`, `VOLATILE`, `CHOPPING`, `PANIC`, `LOW_LIQUIDITY`
  - `systemicRiskState`: `NORMAL`, `ELEVATED_CORRELATION`, `MARKET_STRESS`, `CASCADE_RISK`, `EXTREME_VOLATILITY`, `LIQUIDITY_DANGER`
  - `effectiveExposureMultiplier`
  - `correlationUncertainty`
- Regime and systemic states compress effective limits conservatively via a dynamic compression factor.

## Effective exposure methodology

- `effectivePortfolioExposure = nominalPortfolioExposure + correlatedExposure * uncertaintyFactor`
- Buy approval evaluates projected effective exposure against compressed portfolio cap.
- Symbol cap also compressed by systemic/regime risk.
- Dominant cluster concentration ratio is checked (high concentration blocks approvals).

## Cascading-risk protections

- `CASCADE_RISK` / `LIQUIDITY_DANGER` can trigger direct BUY blocking (`cascade-protection`).
- Volatile/panic/low-liquidity regimes tighten limits automatically through compression.
- Conservative uncertainty multiplier increases effective exposure when correlation confidence is low.

## Diversification-governance model

- Governance now evaluates cluster concentration (`dominantClusterExposure / effectiveExposure`).
- High concentration implies reduced diversification quality and can block additional BUY approvals.
- Correlation map and cluster schema are API-manageable:
  - `GET/POST /api/expert/governance/correlation`

## Durable risk logging

- Added/used tags:
  - `[correlation-risk]`
  - `[portfolio-cluster]`
  - `[market-regime-governance]`
  - `[cascade-protection]`
  - plus existing `[governance-approval]` / `[governance-denied]`
- Approval logs persist snapshots in `GovernanceApprovalLog.exposureSnapshot`.

## Remaining blind spots

- Correlation weights are static/manual unless updated; no rolling statistical estimator yet.
- No explicit stablecoin-liquidity feed integration; state is operator/governance driven.
- Cross-exchange contagion and funding/basis stress are not yet modeled.

## PM2/distributed scaling implications

1. All workers evaluate the same centralized correlation-aware governor before execution.
2. Risk compression and systemic states are globally persistent and restart-safe.
3. Correlation map updates propagate immediately to all workers without daemon restarts.
4. Conservative uncertainty handling prevents distributed workers from over-expanding correlated exposure under ambiguity.
