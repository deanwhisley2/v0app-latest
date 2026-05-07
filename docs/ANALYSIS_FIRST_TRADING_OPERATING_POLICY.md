# Analysis-first trading operating policy (advisor draft)

**Purpose:** Ensure the system is selective, evidence-based, and timely; avoid both forced trading and passive missed opportunities.

## 1) Operating mandate

- Prioritize **decision quality** over trade count.
- Trade only when analysis supports clear edge and risk-adjusted opportunity.
- Stay out when evidence is weak, conflicting, stale, or outside policy.
- Keep a stable weekly focus universe (minimum 20 assets) to reduce noise and improve comparability.

## 2) Weekly focus universe policy (minimum 20 assets)

Every week, define and freeze a **Focus-20+ list** before active trading cycles.

- **Core anchors (required):** BTC, ETH.
- **Macro hedge/anchor (if enabled in system scope):** Gold.
- **Volatility cohort:** high-liquidity, high-volatility assets selected by objective filters.
- **Stability checks:** remove assets with poor data quality, thin liquidity, or execution constraints.

Universe selection gates:
- Minimum liquidity and tradability thresholds.
- Volatility and momentum relevance for the week.
- Data completeness and freshness checks.
- Correlation balance to avoid hidden concentration.

## 3) Decision stack (must pass in order)

1. **Data Integrity Gate**
   - Fresh, complete, and consistent multi-source inputs.
   - If failed: no trade decision; emit `DATA_QUALITY_BLOCK`.

2. **Analysis Sufficiency Gate**
   - Required analysis dimensions complete: trend, momentum, volatility regime, liquidity, and context.
   - If incomplete: no trade decision; emit `INSUFFICIENT_ANALYSIS`.

3. **Pre-execution Behavior Learning Gate**
   - Before any live order, the system must learn how the coin has recently behaved in real time.
   - Minimum live observation window is 5 minutes per coin before first execution attempt in a cycle.
   - Learning output must include behavior profile, dominant micro-pattern(s), and expected entry timing range.
   - If learning evidence is missing: `BEHAVIOR_LEARNING_REQUIRED`.

4. **Signal Quality Gate**
   - Directional signal strength above threshold.
   - Confidence calibrated and not contradictory across horizons.
   - If failed: `NO_EDGE`.

5. **Risk/Reward Gate**
   - Positive expected value under conservative assumptions.
   - Buy, sell, and stop-loss levels must be behavior-adaptive and derived from learned coin profile, not static defaults.
   - Max loss defined before execution.
   - If failed: `RISK_REWARD_REJECT`.

6. **Execution Timing Gate**
   - Entry not late versus trigger window.
   - Entry timeframe must match learned behavior tempo (fast, medium, slow setup classes).
   - Slippage estimate acceptable.
   - If failed: `TIMING_REJECT`.

Only when all gates pass may the system execute `ENTER`/`ADD` decisions.

### Pattern-memory requirement

- Reuse previously successful strategy patterns from legacy system behavior, but only when current behavior-learning confirms pattern compatibility.
- The fast-math layer should score likely outcomes quickly after the minimum 5-minute observation window.
- If no pattern match quality is found, the default action is `NO_TRADE`.

## 4) Anti-overtrading and anti-hesitation controls

- **Anti-overtrading:** hard minimum confidence and risk/reward floors; cooldown after invalidation; maximum trades per asset/day.
- **Anti-hesitation:** trigger expiry clocks; if conviction remains above threshold within window, execute without repeated re-analysis loops.
- **No-force rule:** absence of valid setup is a correct outcome (`HOLD`/`NO_TRADE`).
- **Reality-watch rule:** when the system is actively monitoring live focus coins, it must propose a formal analysis session if confidence quality or timing consistency degrades.

## 5) Governance and override policy

- Human override is allowed only as a controlled exception.
- Every override must log:
  - reason code,
  - expected outcome,
  - risk cap,
  - timeout/expiry.
- Overrides must not bypass risk limits, kill-switches, or max drawdown protections.
- Weekly report must compare override vs non-override outcomes.

## 6) Weekly operating checklist (advisor sign-off)

Run this checklist at start-of-week and end-of-week.

- [ ] Focus-20+ list published and frozen.
- [ ] Data quality thresholds validated for all focus assets.
- [ ] Gate thresholds reviewed (confidence, EV, timing, slippage).
- [ ] Pre-execution behavior learning is enabled and minimum 5-minute observation rule is enforced.
- [ ] Buy/sell/stop-loss logic is behavior-adaptive and not static.
- [ ] Analysis-session trigger is configured for real-time monitoring degradation.
- [ ] Risk caps confirmed (per trade, per asset, portfolio-wide, drawdown).
- [ ] Override rules confirmed and logging verified.
- [ ] End-of-week review completed with pass/fail metrics.

## 7) Pass/fail scorecard (minimum standards)

System is considered **PASS** for the week only if all are true:

- **Coverage:** at least 20 focus assets actively analyzed during weekly cycle.
- **Analysis completeness:** >= 95% of candidate decisions contain all required analysis dimensions.
- **Decision discipline:** 100% of executed trades show all gate checks passed and logged.
- **Learning discipline:** 100% of executed trades have pre-execution behavior-learning evidence.
- **Selectivity:** low-quality setup rejection rate meets configured target band.
- **Timing quality:** median trigger-to-action latency within target window.
- **Adaptation quality:** buy/sell/stop-loss parameters are traceable to behavior-learning output for each executed trade.
- **Risk compliance:** 0 breaches of hard risk constraints.

System is **FAIL** for the week if any occur:
- Trade executed with missing required analysis.
- Trade executed without complete gate logging.
- Trade executed without minimum behavior-learning evidence.
- Hard risk breach (position, exposure, or drawdown guardrail).
- Repeated late entries outside timing policy band.

## 8) Tuning workflow for advisor

Tune in this order:
1. Data relevance filters (remove low-signal inputs).
2. Universe selection criteria (Focus-20+ composition).
3. Gate thresholds (confidence, EV, timing, slippage).
4. Risk controls (sizing, concentration, drawdown).
5. Override thresholds (when human intervention is justified).

If repeated weekly FAIL persists after tuning window, activate controlled strategy override mode while preserving hard risk governance.

---

**Outcome target:** A system that trades less often when evidence is weak, acts decisively when edge is real, and proves decision quality with auditable weekly metrics.
