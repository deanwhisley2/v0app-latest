# Temporal evolution tracking and long-horizon fitness intelligence

Extends [multi-world comparative evolution fitness](./multi-world-comparative-evolution-fitness.md) by slicing history into **eras** over time and applying a rotating **structural-cycle stress** profile per era—still **sandbox-only**, never production adaptation.

---

## Short-horizon blind-spot audit

Structured inventory: `SHORT_HORIZON_TEMPORAL_BLINDSPOT_INVENTORY` in `lib/short-horizon-temporal-blindspots.ts`.

API: `GET /api/expert/temporal-evolution/limitations`.

---

## Temporal evolution architecture

| Concept | Implementation |
|---------|----------------|
| TemporalEvolutionEngine | `runTemporalEvolutionAnalysis` in `lib/temporal-evolution-engine.ts` |
| Era boundaries | `buildFixedDayEras`, `buildCalendarMonthEras`, or `explicitEras[]` |
| StructuralCycleStress | `STRUCTURAL_CYCLE_STRESS_ROTATION` — deterministic 5-slot rotation of `WorldReplayModifiers` |
| Per-era unit replay | Existing `runSandboxSimulation` (`quietSandboxLogs`, `persist: false`) |

Isolation: unchanged—no orders, no `EngineGovernanceState` writes.

---

## Era-aware methodology

Modes (`eraSplitMode`):

- **`FIXED_DAYS`** (default stride **42**) — contiguous UTC windows (`buildFixedDayEras`, clamped stride 7–180d).
- **`CALENDAR_MONTH`** — UTC month buckets (`buildCalendarMonthEras`).
- **`EXPLICIT_ERAS`** — operator-provided `{ id?, label?, replayFromIso/from, replayToIso/to }[]`.

Each era invokes the same hypothetical adaptation knobs (proposal / governance patch / profile) against **only trades in that window** via session-scoped TradeMemory replay (same mechanic as sandbox).

---

## Temporal fitness model

Deterministic **`longHorizonFitnessScore`** \(\in [0,1]\) blends:

- **Persistence stability** — low variance of normalized \(\Delta\)PnL across non-empty eras.
- **Governance temporal resilience** — fraction of eras where hypothetical stays near / above reality (within tolerance).
- **Temporal drift resistance proxy** — penalty for negative linear trend of \(\Delta\)PnL vs era index.
- **Structural regime survivability proxy** — mean per-era sandbox reliability.
- **Delayed rollback proxy** heuristic — keyed off adaptation-fatigue ratios.

Supporting JSON: **`evolutionPersistenceRecord`** (early vs late era means, slopes, \(\Delta\) series).

---

## Evolution persistence methodology

Fatigue cues:

- **Early vs late mean** \(\Delta\)PnL on non-empty eras.
- **Slope** of \(\Delta\) vs era index (scale-normalized).

These detect “short-era winner → long-horizon fade” proxies without claiming causal macro modeling.

---

## Structural-cycle stress framework

Structural stress is **not** historical oracle data—it is **rotated deterministic presets** aligned to stylized eras (liquidity cascade, volatility tail, elevated correlation).

`disableStructuralRotation: true` pins the calm preset for baseline sensitivity tests.

---

## Temporal survivability scoring

Exposed under **`temporalSurvivabilityProfile`** and summarized in **`longHorizonFitnessSnapshot`** on persist:

persistence stability, governance resilience, drift resistance proxy, adaptation fatigue score, regime survivability proxy, delayed rollback proxy.

---

## Temporal reliability (“simulation skepticism”)

**`temporalReliability`** includes:

- `flags[]` (`INSUFFICIENT_ERA_SAMPLES`, `SINGLE_YEAR_SPAN_BIAS`, `LOW_TRADE_DENSITY_ERAS`, …).
- `skepticismScore` — meta confidence in the comparative conclusion.

---

## Persistence strategy

**`TemporalEvolutionRun`** (`prisma/schema.prisma`; `docs/phase2-supabase-migration.sql`; incremental `docs/supabase-delta-temporal-evolution.sql`).

Indexes: `(userId, createdAt DESC)`, `(userId, symbol, createdAt DESC)`.

**`EvolutionAuditEvent`**: `TEMPORAL_EVOLUTION_COMPLETE`.

---

## Logging tags

| Tag | Emitted |
|-----|---------|
| `[temporal-evolution]` | Run start/end, persist |
| `[era-analysis]` | Each era boundaries + preset |
| `[long-horizon-fitness]` | Per-era delta + reliability |
| `[structural-cycle-stress]` | Rotation key/systemic |
| `[evolution-persistence]` | Fatigue slopes |
| `[temporal-drift]` | Stability aggregates |
| `[adaptation-fatigue]` | Early vs late means |

(`/cross-world-analysis/` equivalents are intentionally **multi-world**; temporal uses era-level logs.)

---

## API summary

| Method | Path |
|--------|------|
| POST | `/api/expert/temporal-evolution/run` |
| GET | `/api/expert/temporal-evolution/runs` |
| GET | `/api/expert/temporal-evolution/limitations` |

**POST body** (minimal): `symbol`, `from`, `to` (ISO unless `explicitEras[]`). Optional `eraSplitMode`, `eraStrideDays`, `explicitEras`, `proposalId`, patches, `suiteLabel`, `persistTemporal`, `disableStructuralRotation`, `tradeLimit`.

---

## Remaining blind spots and scaling

- Same **historical TradeMemory path** backs every era—no branching price simulations.
- Eras can be **sparse** (empty windows); reliability flags degrade trust.
- Cost \(\approx\) O(**eras**) sandbox runs—cap stride / month counts for large histories.
- **Deep nested multi-world × every era** is intentionally omitted from default paths (combinatorial explosion); call multi-world separately on selected eras if needed.

---

## Explicit non-goals

Live autonomous evolution, RL, promotion of temporally fit proposals, production self-modification, bypass of constitutional governance.
