# Distributed cognitive specialization + adversarial governance intelligence

Adds **multiple deterministic specialist lenses** over the **same adaptation window** as recursive meta-governance: structured disagreement, debate artefacts, diversity metrics, and persisted memory. **Does not** authorize autonomous evolution, collapse disagreement into automatic promotion, or write `EngineGovernanceState`.

**Prerequisites:** Governance/simulation tables and meta-governance DDL (see [`supabase-operator-guide.md`](./supabase-operator-guide.md)); apply **`docs/supabase-delta-pluralistic-cognitive.sql`** if the DB predates this phase.

---

## 1. Centralized-cognition risk audit

Structured rows: `CENTRALIZED_COGNITION_RISK_INVENTORY` in `lib/centralized-cognition-risks.ts`.

API: `GET /api/expert/pluralistic-cognitive/risks`

---

## 2. Specialist architecture (`CognitiveSpecialistAssessment`)

Seven semi-independent roles (heuristic, code-defined — not LLM):

| Specialist | Role |
|------------|------|
| `COGNITIVE_STABILITY` | Interprets meta-stability vs recursive alerts |
| `GOVERNANCE_SKEPTIC` | Pushes on integrity / immutable rows |
| `SIMULATION_RELIABILITY_AUDITOR` | Challenges mean sandbox reliability + inflation flags |
| `ADAPTATION_CONSERVATIVE` | Rate-cap and velocity pessimism |
| `SURVIVABILITY_STRESS` | Fitness dispersion / synchronized survivability bias |
| `DRIFT_ESCALATION` | Rollback ratio vs experiment volume |
| `CONSTITUTIONAL_GUARDIAN` | Strong dissent on boundary signals |

Each emits: `stance` (SUPPORT \| CHALLENGE \| NEUTRAL), `stressScore`, `confidence`, `rationale`, `adversarialTargets[]`, `institutionalizedDissentNote`.

---

## 3. Adversarial methodology

- Pairwise **challenge edges** (`from` → `to`) when a specialist disputes another’s implied optimism or blind spot.
- **Governance debate** structure: two thematic rounds (constitutional/rollback vs simulation/survivability) with per-specialist headlines.
- **Minority opinions**: specialists with `CHALLENGE` or high stress are listed explicitly (not silently merged).

---

## 4. Epistemic diversity framework

`epistemicDiversityHealthScore` blends:

- Spread of specialist stress (σ)  
- Count of adversarial edges  
- Minority cohort size  
- Meta **skepticism vitality** scalar (shared signal, but used as one input only — not sole truth)

---

## 5. Disagreement stability model

Composite **`disagreementStabilityScore`** plus **`disagreementIntegrityScore`** and **`cognitiveAuthorityBalance.pluralismEntropyBalance`** (stress-weighted entropy — descriptive balance, not a mutation gate).

Low diversity or low disagreement stability emits **WARN** rows in `PluralisticGovernanceEvent`.

---

## 6. Persistence

| Table | Purpose |
|-------|---------|
| `PluralisticCognitiveSnapshot` | Full council JSON + scores + optional `metaSnapshotId` correlation |
| `PluralisticGovernanceEvent` | WARN / INFO adversarial and diversity events |

Audit: `EvolutionAuditEvent` with `PLURALISTIC_COGNITIVE_COUNCIL_COMPLETE`.

---

## 7. APIs (Expert, `requireExpertUserId`)

| Method | Route |
|--------|--------|
| `POST` | `/api/expert/pluralistic-cognitive/council` — body: `cognitiveWindowDays?`, `persist?`, `persistCorrelatedMetaSnapshot?` (default meta snapshot **off**) |
| `GET` | `/api/expert/pluralistic-cognitive/snapshots?limit=` |
| `GET` | `/api/expert/pluralistic-cognitive/events?limit=` |
| `GET` | `/api/expert/pluralistic-cognitive/risks` |

---

## 8. Logging prefixes

`runPluralisticCognitiveCouncil` emits: `[cognitive-specialist]`, `[governance-debate]`, `[adversarial-review]`, `[epistemic-diversity]`, `[minority-opinion]`, `[disagreement-stability]`, `[cognitive-alignment]` (alongside nested meta evaluation logs when correlation runs).

---

## 9. Non-goals

- No specialist self-authorizes mutation or weakens immutable zones  
- No automatic consensus that overrides constitutional hierarchy  
- Heuristics are **observability** primitives; widen with product review before any autonomous promotion path  

---

## 10. Scaling / performance

- One window load serves both **meta evaluation** (in-process) and council derivation — **single round-trip burst** of parallel selects (same as meta).  
- Snapshot JSON size grows with council detail; cap history via list limits (API defaults 25/50).  
- Optional `persistCorrelatedMetaSnapshot: true` adds a second snapshot write + meta events when you want explicit meta row linkage (`metaSnapshotId`).
