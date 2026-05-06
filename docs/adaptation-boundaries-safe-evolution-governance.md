# Adaptation boundaries and safe evolution governance

This phase establishes **constitutional rules for future adaptation only**. It does **not** enable autonomous strategy mutation, self-tuning execution weights, or unrestricted machine learning. All changes are mediated through **proposals**, **gates**, **checkpoints**, and **audit events**.

---

## 1. Mutation surface inventory

Canonical structured inventory (for tooling): `MUTATION_SURFACE_INVENTORY`, `IMMUTABLE_MUTATION_ZONES`, and `ADAPTATION_ELIGIBLE_ZONES` in `lib/evolution-governor.ts`.

| Surface | Authority owner (typical) | Mutation risk | Blast radius | Reversibility | Adaptation danger |
|--------|----------------------------|---------------|--------------|---------------|-------------------|
| Transaction integrity | Persistence / invariant paths | Critical | Capital + audit integrity | Replay / manual only | Forbidden (immutable) |
| Reconciliation | `exchange-reconciliation.ts` | Critical | Exchange vs DB divergence | Operator repair | Forbidden |
| Startup recovery gating | `startup-recovery.ts` | Critical | Unsafe resume after failure | Gate reset | Forbidden |
| Execution locking | `ExecutionLock` | High | Duplicate execution | TTL + operator | Forbidden |
| Idempotency keys | `ExecutionIdempotency` | High | Double intents / orphaned state | Limited | Forbidden |
| Audit logging | Approval / audit tables | High | Accountability loss | Append-only ideal | Forbidden |
| Rollback authority semantics | Checkpoint contract | Critical | Cannot undo bad rollout | Must stay deterministic | Forbidden |
| Exchange truth hierarchy | Precheck + positions | Critical | False ground truth | Reconcile replay | Forbidden |
| Signal weighting | Analysis / advisory | Medium | Signal distortion | Checkpoint | Eligible (future) |
| Confidence calibration | Calibration layer | Medium | Mis-calibrated trust | Checkpoint | Eligible |
| Governance compression | `global-execution-governor` | High | Exposure envelope | Governance snapshot | Eligible |
| Regime sensitivity | Market regime engine | Medium | Regime misclassification | Snapshot + TTL | Eligible |
| Exposure multipliers | Engine governance state | High | Portfolio envelope | Snapshot | Eligible |
| Correlation sensitivity | Governor + correlation map | High | Clustered risk blindness | Snapshot | Eligible |
| Execution / cooldown / sizing hints | Daemon / heuristics | Medium–High | Pace / churn imbalance | Config snapshot | Eligible (narrow) |
| Risk limit hard caps | Env + policy floors | Critical | Policy breach | Operator only | Operator-bound (not auto) |
| Approval strictness core | Governance mode machine | High | Executes when should halt | Mode audit | Operator-bound |

---

## 2. Immutable safety zones (constitutional invariants)

These subsystem keys **must never** be autonomously mutated. They are enforced logically by `evaluateAdaptationProposal` (`REJECT_IMMUTABLE_ZONE`).

- `TRANSACTION_INTEGRITY`
- `RECONCILIATION`
- `STARTUP_RECOVERY_GATING`
- `EMERGENCY_GOVERNANCE` (reserved: emergency mode transitions as invariant policy)
- `EXECUTION_LOCKING`
- `IDEMPOTENCY_KEYS`
- `AUDIT_LOGGING`
- `ROLLBACK_AUTHORITY`
- `EXCHANGE_TRUTH_HIERARCHY`

---

## 3. Adaptation-eligible boundaries (constrained)

Only keys in `ADAPTATION_ELIGIBLE_ZONES` may receive a non-immutable verdict path. Even then, **this phase only evaluates and records**; nothing applies proposed values to runtime.

Examples: `SIGNAL_WEIGHTING`, `CONFIDENCE_CALIBRATION`, `GOVERNANCE_COMPRESSION`, `REGIME_SENSITIVITY`, `EXPOSURE_MULTIPLIERS_TUNING`, `CORRELATION_SENSITIVITY`, pacing / cooldown / sizing **hints** (not core invariants).

Anything outside the registry is rejected (`REJECT_NOT_ELIGIBLE`) until explicitly added with review.

---

## 4. Evolution governance layer

| Concept | Implementation |
|--------|------------------|
| Evolution governor | `lib/evolution-governor.ts` |
| Adaptation proposal | Supabase `AdaptationProposal` (+ Prisma mirror for schema consistency) |
| Mutation boundary | `IMMUTABLE_MUTATION_ZONES` / `ADAPTATION_ELIGIBLE_ZONES` |
| Evolution audit | `EvolutionAuditEvent` |
| Rollback checkpoint | `RollbackCheckpoint` snapshot (`EVOLUTION_GOVERNANCE_CHECKPOINT_V1`) |
| Stability approval record | Audit event `STABILITY_APPROVAL_RECORD` + proposal evaluation fields |

---

## 5. Proposal lifecycle (no silent self-modification)

1. **Create** proposal (`DRAFT` or `SUBMITTED`) via `POST /api/expert/evolution/proposals`.
2. **Evaluate** via `POST /api/expert/evolution/proposals/[id]/evaluate` → persists `evaluationVerdict`, gates, confidence — **does not write engine parameters**.
3. Verdicts: `CONDITIONALLY_APPROVED_EVAL_ONLY` (gates passed), `REJECT_*` otherwise.
4. Future phase (explicitly out of scope): operator or signed workflow **apply** + mandatory checkpoint first.

Required proposal fields (conceptual): subsystem, parameter key, proposed value, optional evidence, stability impact estimate, rollback plan text.

---

## 6. Stability approval requirements (evaluation gates)

Evaluation requires, among others:

- Startup gate `SAFE_TO_RESUME`
- Governance mode not `EXECUTION_DISABLED`, `GLOBAL_PAUSE`, or `GOVERNANCE_LOCKED`
- Drift level in `{ STABLE, MINOR_DRIFT }`
- `stabilityPressure` < `0.45`
- Latest confidence audit `sampleSize` ≥ `20`
- `reliabilityError` ≤ `0.24`

Philosophy: prefer **stable imperfection** over unstable optimization; failing gates → `REJECT_UNSTABLE_SYSTEM`.

---

## 7. Rollback authority

- `POST /api/expert/evolution/checkpoint` creates `RollbackCheckpoint` with deterministic JSON snapshot: governance state, drift row, startup gate.
- Restoration of prior behavior is a **future operator-facing action**; this phase only defines **capture + audit**.

---

## 8. Adaptation rate limiting

- At most **5** proposals in `SUBMITTED` or `UNDER_REVIEW` per user per **7** days (enforced on submit).
- Implicit philosophy: cap concurrent “mutation intent” and force serial consideration.

Future: per-parameter max delta %, minimum evaluation windows, cooldown between applies (not implemented — no applies yet).

---

## 9. Auditability

- `EvolutionAuditEvent`: `PROPOSAL_CREATED`, `EVALUATION_COMPLETE`, `STABILITY_APPROVAL_RECORD`, `ROLLBACK_CHECKPOINT_CREATED`.
- Query: `GET /api/expert/evolution/audit?limit=&proposalId=`.

---

## 10. API summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/expert/evolution/proposals` | List proposals |
| POST | `/api/expert/evolution/proposals` | Create proposal |
| POST | `/api/expert/evolution/proposals/[id]/evaluate` | Run gates; persist verdict only |
| GET / POST | `/api/expert/evolution/checkpoint` | List / create rollback checkpoints |
| GET | `/api/expert/evolution/audit` | List audit events |

---

## 11. Database migration

Tables are appended in `docs/phase2-supabase-migration.sql` (`AdaptationProposal`, `RollbackCheckpoint`, `EvolutionAuditEvent`). Prisma models mirror the same shape in `schema.prisma`.

---

## 12. Remaining risks

- **Registry drift**: new subsystems could be added without updating immutable/eligible sets — requires code review discipline.
- **Snapshot completeness**: checkpoints currently capture governance + drift + startup gate; future applies may need richer snapshots (correlation rows, regime caches).
- **Human bypass**: APIs are authenticated expert routes; governance of *who* may eventually “apply” belongs in a later phase.
- **Evidence quality**: proposals can carry arbitrary JSON evidence; evaluation does not-deep-validate causal claims.

---

## 13. Scaling implications

- Audit and proposal tables grow with operator activity; index on `(userId, createdAt DESC)` supports listing.
- Evaluation reads a bounded set of stability rows; OK at moderate QPS. Heavy fan-out would move evaluation to a worker and cache gate inputs with short TTL.

---

## Explicit non-goals (this phase)

- Auto-changing weights, strategies, or live execution parameters.
- ML training loops or unbounded optimization.
- Applying `proposedValue` to `EngineGovernanceState` or similar without a separate, explicit approval path.
