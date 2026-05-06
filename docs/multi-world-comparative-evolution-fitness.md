# Multi-world comparative intelligence and evolution fitness analysis

This phase layers **comparative evolutionary reasoning** on top of [sandbox shadow replay](./sandboxed-evolution-simulation-shadow-execution.md): many deterministic **world variants** against the same historical `TradeMemory`, plus **fitness**, **survivability**, and **meta-reliability** scoring. It still **does not** promote proposals, mutate production governance, or optimize live execution.

---

## 1. Single-world limitation audit

Structured inventory: `SINGLE_WORLD_LIMITATION_INVENTORY` in `lib/single-world-simulation-limitations.ts`.

API: `GET /api/expert/multi-world/limitations`.

Themes: replay bias, overfitting to one path, regime fixation, survivorship in recorded trades, hidden fragility under unstressed worlds, missing rare events, static correlation, microstructure gaps.

---

## 2. Multi-world architecture

| Concept | Implementation |
|---------|----------------|
| MultiWorldSimulationEngine | `runMultiWorldComparativeSimulation` in `lib/multi-world-simulation-engine.ts` |
| ComparativeEvolutionScenario (`WorldVariant`) | `id`, `label`, `category`, `modifiers: WorldReplayModifiers` |
| CrossRegimeStressTest | Synthetic **regime remaps** (`mapRegimeForWorldStress`) + systemic stack per world |
| Shadow replay unit | Existing `runSandboxSimulation` with `worldModifiers` + `quietSandboxLogs` |

Isolation: unchanged — no orders, no `EngineGovernanceState` writes.

---

## 3. Scenario generation methodology

Default suite (`DEFAULT_COMPARATIVE_WORLD_SUITE`, 7 worlds) mixes:

- **Systemic ladders**: `NORMAL` → `ELEVATED_CORRELATION` → `MARKET_STRESS` → `CASCADE_RISK` → `EXTREME_VOLATILITY` → `LIQUIDITY_DANGER`.
- **Regime stress lenses**: `PROMOTE_VOLATILITY`, `PANIC_TAIL`, `LOW_LIQUIDITY_STRESS`, `CASCADE_BIAS`.
- **Execution friction proxies**: `hypotheticalCompressionStressMultiplier` > 1 (spread / hostility stand-in — *not* a fill simulator).

Operators may POST a custom `worlds[]` array to `/api/expert/multi-world/run` (same modifier shape).

---

## 4. Fitness analysis model (`evolutionFitnessSnapshot`)

Deterministic composite `evolutionFitnessScore` \(\in [0,1]\) blends:

- **Minimum per-world sandbox reliability** (weakest sandbox undermines comparative trust),
- **Robustness fraction** (share of worlds where hypothetical \(\Delta\)PnL stays within a tolerance of non-worse-vs-reality),
- **Stability consistency** (lower variance of normalized \(\Delta\)PnL across worlds),
- **Trade-count retention stability** across worlds (governance choke inconsistency penalized).

This is explicitly **not** pure profitability maximization.

---

## 5. Cross-world comparative intelligence

For each world, the sandbox returns the same **recorded-trade reality PnL** (historical outcomes) vs **hypothetical** path under adaptation + stress.

Aggregates exposed as `crossWorldComparison` and `adaptationRobustness`:

- Worlds where hypo is **not badly worse** than reality,
- Worst/best \(\Delta\)PnL spread (fragility signal),
- Count of favorable worlds tagged by coarse **category**.

---

## 6. Stress-test intelligence

Stress is modeled as:

1. Alternate **systemic compression** stacks (reuse `SYSTEMIC_*` taxonomy from sandbox).
2. **Regime remapping** of each trade’s recorded label before compression scoring.
3. Optional **hypothetical compression hostility multiplier** after governance math.

Failures of robustness surface as poor `robustnessFraction`, large \(\Delta\) spread, or **`simulationBiasFlags`** entries in `metaSimulationReliability`.

---

## 7. Survivability scoring framework (`survivabilityProfile`)

Dimensions returned (conceptual proxies; not drift-engine writes):

- **stabilitySurvivability** — consistency of \(\Delta\)PnL distribution.
- **governanceSurvivability** — robustness fraction vs reality.
- **executionSurvivability** — dispersion of hypothetical trade counts.
- **regimeSurvivability** — diversity of coarse categories showing upside.
- **rollbackSurvivability** — pinned to `1` (future: tie to checkpoint fidelity).
- **confidenceSurvivability** — weakest per-world reliability across worlds.

`compositeEvolutionFitness` merges these into one headline scalar for dashboards — **still not approval**.

---

## 8. Persistence strategy

Table `ComparativeSimulationRun` (see `prisma/schema.prisma` + `docs/phase2-supabase-migration.sql`):

- `worldsDefinition`, `perWorldResults`, `evolutionFitnessSnapshot`, `survivabilityProfile`, `crossWorldComparison`, `metaSimulationReliability`, `stressScenarioResults`.

Listing: `GET /api/expert/multi-world/runs`.

Audit hook: `EvolutionAuditEvent` `MULTI_WORLD_COMPARATIVE_COMPLETE`.

---

## 9. Comparative simulation reliability (`metaSimulationReliability`)

Indicators:

- **diversityScore** — spread of systemic keys + regime-stress variations (penalizes tiny suites \< 5 worlds).
- **simulationBiasFlags** — e.g. very large cross-world \(\Delta\) spread, weak scenario diversity.

The system warns when **comparative experiments themselves** are thin or internally inconsistent.

---

## 10. Logging

Tags:

- `[multi-world-simulation]`
- `[evolution-fitness]`
- `[cross-world-analysis]`
- `[stress-survivability]`
- `[scenario-divergence]`
- `[adaptation-robustness]`
- `[simulation-bias]`

Per-world details remain available in JSON responses and persisted rows.

---

## 11. API summary

| Method | Path | Role |
|--------|------|------|
| POST | `/api/expert/multi-world/run` | Run suite (`symbol`, `from`, `to`, `proposalId`, `governancePatch`, `confidencePolicy`, `suiteLabel`, optional `worlds`, `persistComparative`, `tradeLimit`) |
| GET | `/api/expert/multi-world/runs` | List comparative runs |
| GET | `/api/expert/multi-world/limitations` | Single-world limitation audit |

---

## 12. Remaining blind spots and scaling

**Blind spots**

- Worlds are **synthetic stress lenses** on the **same** price path — not Monte Carlo price trees.
- No exchange-outage / reconciliation-failure injection (immutable zone — only narrative risk).
- Category tags are heuristic; overlapping worlds inflate perceived diversity slightly.

**Scaling**

- Cost \(\approx\) O(#worlds × single sandbox). Default 7 sequential replays — parallelize carefully to avoid starving DB.
- Cap custom `worlds` length in operators’ gateway if needed (currently trust caller + expert auth).

---

## Follow-on: long-horizon eras

For adaptation testing **across time slices** (months / fixed strides) with structured stress rotation, see [Temporal evolution — long horizon](./temporal-evolution-long-horizon-fitness.md).

---

## Explicit non-goals

Live autonomous mutation, production self-optimization, RL, deploying “winners,” bypassing constitutional governance. Multi-world improves **evaluation discipline** — not deployment authority.
