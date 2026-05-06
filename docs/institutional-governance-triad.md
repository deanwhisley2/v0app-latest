# Institutional cognitive triad (three connected advisory phases)

Implements simultaneously:

1. **Institutional cognitive memory + epistemic reputation** — decay‑limited historical weights over stored pluralistic councils; minority archive signal; dissent lineage references. **Advisory**, not aristocracy.
2. **Strategic opportunity intelligence + controlled aggression governance** — caution‑tax vs throughput proxies; skepticism elasticity; bounded expansion labels. **Hints for review**, never auto aggression in markets.
3. **Meta‑cognitive equilibrium + anti‑concentration safety** — HHI‑style concentration on specialist stress‑shares; coalition‑repeat heuristic on recent councils; fragmentation / dissent health balance.

**Hard constraints:** No autonomous mutation of `EngineGovernanceState`, no weakening immutable zones, no permanent reputational dictatorship — decay and anti‑dominance wording are intrinsic to payloads.

---

## Persistence

| Table | Role |
|-------|------|
| `InstitutionalCognitiveSnapshot` | Full triad JSON + three headline indices (`epistemicMemoryIndex`, `opportunityBalanceIndex`, `constitutionalEquilibriumIndex`) |
| `InstitutionalGovernanceEvent` | Optional WARN / INFO bridges (`phase`: EPISTEMIC \| OPPORTUNITY \| EQUILIBRIUM) |

Evolution audit: `EvolutionAuditEvent` with **`INSTITUTIONAL_GOVERNANCE_ASSESSMENT_COMPLETE`**.

Correlation: **`pluralisticCouncilRef`** may point at a concurrently persisted pluralistic snapshot if workflow persisted both — often `null` when council run with `persist: false`.

DDL: **`docs/supabase-delta-institutional-governance.sql`**, included in **`docs/supabase-all-deltas-in-order.sql`**.

---

## APIs (`requireExpertUserId`)

| Method | Route |
|--------|--------|
| `POST` | `/api/expert/institutional-governance/assessment` — body: `assessmentWindowDays?`, `persist?`, `persistCorrelatedMetaSnapshot?`, `historySnapshotsLimit?` |
| `GET` | `/api/expert/institutional-governance/snapshots?limit=` |
| `GET` | `/api/expert/institutional-governance/events?limit=` |

---

## Logs (namespaced)

Emitted by `runInstitutionalGovernanceAssessment`:

Phase 1: `[cognitive-memory]`, `[epistemic-reputation]`, `[reputation-decay]`, `[minority-survivability]`, `[disagreement-lineage]`, `[historical-validation]`

Phase 2: `[opportunity-cost]`, `[missed-opportunity]`, `[strategic-aggression]`, `[governance-elasticity]`, `[controlled-expansion]`, `[survivability-balance]`

Phase 3: `[cognitive-equilibrium]`, `[authority-concentration]`, `[epistemic-monopoly]`, `[dissent-health]`, `[constitutional-balance]`, `[governance-fragmentation]`

Council stdout is **`quietCouncilConsole`** when nested unless you invoke pluralistic route separately.

---

## Recursive risks (remaining)

Synthetic reputation can still **inherit selection bias** if only favorable eras are persisted; equilibrium uses **stress dominance heuristics** without external ground truth.

## Scaling

One council evaluation + bounded history reads (`≤40` snapshots by default); JSON payloads sized for dashboards — cap list endpoints.
