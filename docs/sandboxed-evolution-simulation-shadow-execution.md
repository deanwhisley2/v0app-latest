# Sandboxed evolution simulation and shadow execution intelligence

This phase adds an **isolated experimental layer** on top of [constitutional evolution governance](./adaptation-boundaries-safe-evolution-governance.md). It answers: *“What might have happened under alternate governance or confidence rules?”* using **historical trade memory replay** — not live optimization, not production mutation, and not autonomous promotion of results.

---

## 1. Live-risk mutation inventory

Structured rows (blast radius, simulation feasibility, rollback complexity, shadow-test safety) live in `lib/live-mutation-simulation-inventory.ts` and are exposed at `GET /api/expert/sandbox/inventory`.

Eligible evolution subsystems from the prior phase remain the main candidates; immutable zones are **out of scope** for mutation simulation (requests tied to immutable proposals are rejected).

---

## 2. Sandbox architecture

| Component | Role |
|-----------|------|
| `SandboxExecutionEngine` | `runSandboxSimulation` in `lib/sandbox-execution-engine.ts` — pure in-memory governance forks + TradeMemory math |
| `ShadowExecutionSession` | Per-invocation input: symbol, replay window, optional `proposalId` / `sandboxProfileId`, patches |
| `SimulatedGovernanceState` | `mergeSandboxGovernance(baseline, patch)` over **allowlisted keys only** |
| `HypotheticalExecutionState` | Inclusion vector per trade (confidence gate, symbol notional cap) + compression factors |
| `CounterfactualReplay` | Chronological `TradeMemory` rows scoped by `TradeSession.userId` |

**Hard isolation guarantees (enforced by design):**

- No calls to order placement, `setGovernanceState`, execution locks, or idempotency mutation.
- Read-only use of **live** `EngineGovernanceState` as a **baseline fingerprint** and numeric snapshot; hypothetical values never persist to that table.
- Replay uses **recorded** `pnlUsd` and regimes; it is **not** a tick-level market simulator.

---

## 3. Shadow execution methodology

1. Resolve `TradeSession` ids for `(userId, symbol, optional time window)`.
2. Load `TradeMemory` rows for those sessions (same symbol, time filters).
3. Baseline **reality** metrics: all recorded trades in the window (actual outcomes).
4. **Hypothesis**: apply (in order) optional profile overrides, explicit `governancePatch`, and mapped fields from an `AdaptationProposal`.
5. For each trade (chronological):
   - **Confidence policy**: exclude if `effectiveConfidence < minCalibratedToExecute` (after optional `scale`).
   - **Compression proxy**: ratio of governance compression score (regime + assumed systemic state + sandbox multipliers) vs baseline → scales hypothetical PnL for included trades (clamped).
   - **Symbol notional cap proxy**: cumulative `entryPrice * quantity` vs hypothetical `maxSymbolExposureUsd` may exclude later trades.

Console tags: `[sandbox-run]`, `[shadow-execution]`, `[counterfactual-analysis]`, `[simulation-drift]`, `[hypothetical-governance]`, `[adaptation-simulation]`, `[simulation-reliability]`.

---

## 4. Counterfactual comparison model

Persisted under `SimulationRun.counterfactualComparison`:

- **reality**: trade count, total PnL, win rate (recorded trades).
- **hypothetical**: same after filters + compression-scaled PnL.
- **deltas**: PnL, win rate, trade count differences.

This is **side-by-side execution intelligence** at the **trade-memory aggregate** level, not order-book replay.

---

## 5. Adaptation proposal simulation workflow

1. Create or select an `AdaptationProposal` (existing evolution APIs).
2. `POST /api/expert/sandbox/simulate` with `proposalId` (and optional window).
3. Engine maps a **narrow** set of `proposedValue` shapes to sandbox fields (e.g. numeric multiplier → `effectiveExposureMultiplier`, object with `correlationUncertainty`, confidence object / scale).
4. Immutable-zone proposals throw `SANDBOX_REJECT`.
5. Results persist to `SimulationRun` and emit `EvolutionAuditEvent` `SANDBOX_SIMULATION_COMPLETE` (accountability only).

**No rule auto-applies** winning simulations to production.

---

## 6. Governance shadow-testing design

- **SandboxGovernanceProfile**: named JSON templates (`governanceOverrides`) for repeatable experiments; **never** applied to production automatically.
- Allowlisted keys: `effectiveExposureMultiplier`, `correlationUncertainty`, `maxPortfolioExposureUsd`, `maxSymbolExposureUsd`. Any other key is rejected.

---

## 7. Simulation reliability methodology

`simulationReliability.score` in \([0,1]\) blends:

- Sample size (more trades → better),
- Regime diversity (single-regime windows → weaker),
- Staleness of replay end vs “now”,
- **Divergence penalty** when hypothetical PnL swings extremely vs baseline (model stress / overfitting warning).

The system should treat **low scores** as “simulation conclusions are weak.”

---

## 8. Persistence strategy

| Table | Purpose |
|-------|---------|
| `SandboxGovernanceProfile` | Reusable governance override templates |
| `SimulationRun` | One row per run: inputs, `shadowExecutionResult`, `counterfactualComparison`, `adaptationSimulationSummary`, `simulationReliability` |

DDL: appended to `docs/phase2-supabase-migration.sql`; Prisma mirrors in `schema.prisma`.

---

## 9. API summary

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/expert/sandbox/simulate` | Run shadow replay (body: `symbol`, `from`, `to`, `proposalId`, `sandboxProfileId`, `governancePatch`, `confidencePolicy`, `systemicRiskAssumption`, `persist`, `tradeLimit`) |
| GET | `/api/expert/sandbox/runs` | List persisted runs |
| GET/POST | `/api/expert/sandbox/profile` | List / create sandbox governance profiles |
| GET | `/api/expert/sandbox/inventory` | Live-risk / simulation-feasibility inventory |

---

## 10. Remaining blind spots

- No L2 / slippage / partial-fill microstructure; PnL is **as recorded**.
- Systemic risk during each historical trade is **not** recovered; default `systemicRiskAssumption` (e.g. `NORMAL`) is a documented simplification.
- Signal-weight mutations are only weakly approximated (no full feature vector in `TradeMemory`).
- Correlation clusters are not replayed path-by-path; only `correlationUncertainty` compression participates.
- Empty session list → empty replay (strict user scoping via `TradeSession`).

---

## 11. Scaling and performance

- Bounded `tradeLimit` (default 200, max 500 in query path).
- One run is O(n) over trades plus small constant DB reads + optional audit insert.
- Heavy use should batch windows or offload to workers; indexes on `SimulationRun (userId, createdAt DESC)` support listing.

---

## 12. Explicit non-goals

- Live self-optimization, production mutation, autonomous deployment, bypassing constitutional approval, auto-promoting simulation winners.

Successful completion means the stack can **safely experiment in silico** and retain an **audit trail** before any future live adaptation path is designed.

For **many-world robustness**, see [Multi-world comparative evolution fitness](./multi-world-comparative-evolution-fitness.md). For **era-sliced long-horizon fitness**, see [Temporal evolution](./temporal-evolution-long-horizon-fitness.md).
