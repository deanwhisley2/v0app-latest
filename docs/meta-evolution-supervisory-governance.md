# Meta-evolution supervision + recursive governance intelligence

This phase adds a **read-only supervisory layer** over the **adaptation pipeline** (proposals, sandbox, comparative, temporal) and its **audit trail**. It does **not** authorize live evolution, relax constitutional limits, or self-modify execution.

**Prerequisites:** Tables from [Supabase operator guide](./supabase-operator-guide.md) including **`MetaGovernanceSnapshot`** and **`MetaGovernanceEvent`** (`docs/supabase-delta-meta-governance.sql` if you already applied older migrations).

---

## 1. Meta-governance blind-spot audit

Structured rows: `META_GOVERNANCE_BLINDSPOT_INVENTORY` in `lib/meta-governance-blindspots.ts`.

API: `GET /api/expert/meta-governance/blindspots`.

---

## 2. Supervisory architecture

| Layer | Scope |
|-------|--------|
| Execution intelligence | Trading, governor, recovery, locks |
| Adaptation intelligence | Proposals, simulations, fitness engines (hypothetical only) |
| **Supervisory intelligence** | **`runMetaGovernanceAssessment`** aggregates audits + stored runs; **no** `EngineGovernanceState` writes |

---

## 3. Adaptation discipline methodology

Signals in `adaptationDisciplineProfile`:

- Proposal status distribution in the supervisory window  
- Audit counts for `PROPOSAL_CREATED`, `SANDBOX_*`, `MULTI_WORLD_*`, `TEMPORAL_*`, `EVALUATION_COMPLETE`  
- Current **rate-window** snapshot via `countRecentProposals`  
- Simulation / comparative / temporal run counts  

Derived **discipline friction proxy** from proximity to proposal caps.

---

## 4. Constitutional integrity model

Deterministic scan of `AdaptationProposal` rows whose `subsystem` lands in **`IMMUTABLE_MUTATION_ZONES`**, plus **`REJECT_IMMUTABLE_ZONE`** evaluation outcomes. Produces **`integrityScore`** and explanatory counts (any immutable-target row is a workflow violation risk even if rejected later).

---

## 5. Recursive pressure detection

Heuristic indicators (examples):

- **SIMULATION_VELOCITY_HIGH** — many sandbox runs per supervisory day  
- **PROPOSAL_RATE_NEAR_CAP** — active proposals hugging the 7‑day cap  
- **ROLLBACK_UNDERUSE** / **EVOLUTION_WITHOUT_ROLLBACK** — experiments without checkpoints  
- **CONFIDENCE_INFLATION_PROXY** — high mean `simulationReliability.score` over many runs  
- **IMMUTABLE_TARGET_RECORDED** — immutable subsystem present on proposal rows  

Logs: `[recursive-pressure]` with severity.

---

## 6. Meta-stability scoring

**`metaStabilityScore`** blends integrity, discipline + rollback health, inverse recursive penalty, skepticism vitality, minus a small **fitness inflation** penalty when comparative + temporal fitness averages are uniformly very high (success monotony cue).

---

## 7. Authority segmentation

Documented in **`authoritySegmentation`** JSON: three layers and the rule that **no layer fully self-authorizes mutation**; promotion remains outside these modules by policy.

Logs: `[authority-segmentation]`.

---

## 8. Persistence strategy

| Table | Role |
|-------|------|
| `MetaGovernanceSnapshot` | One row per assessment (full JSON dimensions) |
| `MetaGovernanceEvent` | WARN/ALERT recursive-pressure rows linked to `snapshotId` |

Audit hook: `EvolutionAuditEvent` **`META_GOVERNANCE_ASSESSMENT_COMPLETE`**.

---

## 9. Supervisory skepticism philosophy

**`supervisorySkepticismHealth`** combines inverse simulation reliability, comparative `skepticismScore`, temporal `skepticismScore`. Low composite triggers `[supervisory-drift]` warning — *the supervisor distrusts overly smooth success curves*.

---

## 10. Logging

| Tag | When |
|-----|------|
| `[meta-governance]` | Assessment start / persistence |
| `[recursive-pressure]` | Each indicator |
| `[constitutional-integrity]` | Integrity summary |
| `[adaptation-discipline]` | Discipline snapshot |
| `[supervisory-drift]` | Low skepticism vitality |
| `[rollback-health]` | Rollback ratio |
| `[authority-segmentation]` | Layer reminder |

---

## 11. API summary

| Method | Path |
|--------|------|
| POST | `/api/expert/meta-governance/assessment` — body `{ supervisoryWindowDays?, persist? }` default window 28 days |
| GET | `/api/expert/meta-governance/snapshots` |
| GET | `/api/expert/meta-governance/events` |
| GET | `/api/expert/meta-governance/blindspots` |

---

## 12. Remaining recursive risks and scaling

Heuristics may **false positive** during intentional heavy testing; tune window length. No causal model of “approval bias in humans.” Cost is **O(queries over bounded windows)** — keep `supervisoryWindowDays` ≤ 120 (enforced in code).

---

## Explicit non-goals

Recursive self-authorization, weakening constitutional sets, autonomous production mutation, collapsing the hierarchy so adaptation supervises itself unchecked.
