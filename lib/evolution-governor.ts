import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getGovernanceState } from "@/lib/global-execution-governor"
import { getResumeGate } from "@/lib/startup-recovery"
import type { DriftLevel } from "@/lib/stability-intelligence-engine"

/** Constitutional invariants — no autonomous adaptation may alter these subsystem categories. */
export const IMMUTABLE_MUTATION_ZONES = new Set([
  "TRANSACTION_INTEGRITY",
  "RECONCILIATION",
  "STARTUP_RECOVERY_GATING",
  "EMERGENCY_GOVERNANCE",
  "EXECUTION_LOCKING",
  "IDEMPOTENCY_KEYS",
  "AUDIT_LOGGING",
  "ROLLBACK_AUTHORITY",
  "EXCHANGE_TRUTH_HIERARCHY",
])

/** Narrow future-adaptation-eligible knobs (evaluation-only phase; nothing auto-applies). */
export const ADAPTATION_ELIGIBLE_ZONES = new Set([
  "SIGNAL_WEIGHTING",
  "CONFIDENCE_CALIBRATION",
  "GOVERNANCE_COMPRESSION",
  "REGIME_SENSITIVITY",
  "EXPOSURE_MULTIPLIERS_TUNING",
  "CORRELATION_SENSITIVITY",
  "EXECUTION_PACING_HINTS",
  "COOLDOWN_TIMING_HINTS",
  "POSITION_SIZING_HINTS",
])

export type ProposalStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CONDITIONALLY_APPROVED_EVAL_ONLY"
  | "REJECTED"
  | "EXPIRED"

/** Human-readable mutation-surface inventory (docs + tooling). Authority is descriptive, not enforced in code elsewhere. */
export const MUTATION_SURFACE_INVENTORY: Array<{
  subsystemKey: string
  zoneKind: "IMMUTABLE" | "ELIGIBLE" | "OPERATOR_BOUND"
  authorityOwner: string
  mutationRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  blastRadius: string
  reversibility: string
}> = [
  { subsystemKey: "TRANSACTION_INTEGRITY", zoneKind: "IMMUTABLE", authorityOwner: "persistence/invariant layer", mutationRisk: "CRITICAL", blastRadius: "capital + audit falsification", reversibility: "partial (replay only)" },
  { subsystemKey: "RECONCILIATION", zoneKind: "IMMUTABLE", authorityOwner: "exchange-reconciliation.ts", mutationRisk: "CRITICAL", blastRadius: "state vs exchange divergence", reversibility: "manual repair" },
  { subsystemKey: "STARTUP_RECOVERY_GATING", zoneKind: "IMMUTABLE", authorityOwner: "startup-recovery.ts", mutationRisk: "CRITICAL", blastRadius: "unsafe resume after crash", reversibility: "gate reset via operator" },
  { subsystemKey: "EXECUTION_LOCKING", zoneKind: "IMMUTABLE", authorityOwner: "ExecutionLock rows", mutationRisk: "HIGH", blastRadius: "duplicate execution paths", reversibility: "TTL + operator clear" },
  { subsystemKey: "IDEMPOTENCY_KEYS", zoneKind: "IMMUTABLE", authorityOwner: "ExecutionIdempotency", mutationRisk: "HIGH", blastRadius: "double fills / orphaned intents", reversibility: "limited" },
  { subsystemKey: "AUDIT_LOGGING", zoneKind: "IMMUTABLE", authorityOwner: "GovernanceApprovalLog / audits", mutationRisk: "HIGH", blastRadius: "accountability collapse", reversibility: "immutable append-only ideal" },
  { subsystemKey: "ROLLBACK_AUTHORITY", zoneKind: "IMMUTABLE", authorityOwner: "EvolutionRollbackCheckpoint semantics", mutationRisk: "CRITICAL", blastRadius: "cannot undo bad rollout", reversibility: "must stay deterministic" },
  { subsystemKey: "EXCHANGE_TRUTH_HIERARCHY", zoneKind: "IMMUTABLE", authorityOwner: "exchange-precheck + positions", mutationRisk: "CRITICAL", blastRadius: "false ground truth", reversibility: "reconcile replay" },

  { subsystemKey: "SIGNAL_WEIGHTING", zoneKind: "ELIGIBLE", authorityOwner: "analysis / advisory paths", mutationRisk: "MEDIUM", blastRadius: "signal quality distortion", reversibility: "checkpoint restore" },
  { subsystemKey: "CONFIDENCE_CALIBRATION", zoneKind: "ELIGIBLE", authorityOwner: "confidence-calibration.ts", mutationRisk: "MEDIUM", blastRadius: "over/under-confidence in decisions", reversibility: "checkpoint restore" },
  { subsystemKey: "GOVERNANCE_COMPRESSION", zoneKind: "ELIGIBLE", authorityOwner: "global-execution-governor multipliers", mutationRisk: "HIGH", blastRadius: "exposure limits & approvals", reversibility: "EngineGovernanceState snapshot" },
  { subsystemKey: "REGIME_SENSITIVITY", zoneKind: "ELIGIBLE", authorityOwner: "market-regime-engine", mutationRisk: "MEDIUM", blastRadius: "regime misclassification stress", reversibility: "checkpoint + regime cache TTL" },
  { subsystemKey: "EXPOSURE_MULTIPLIERS_TUNING", zoneKind: "ELIGIBLE", authorityOwner: "EngineGovernanceState.effectiveExposureMultiplier", mutationRisk: "HIGH", blastRadius: "portfolio risk envelope", reversibility: "governance snapshot" },
  { subsystemKey: "CORRELATION_SENSITIVITY", zoneKind: "ELIGIBLE", authorityOwner: "correlation map + governor", mutationRisk: "HIGH", blastRadius: "clustered risk blindness", reversibility: "correlation snapshot" },
  { subsystemKey: "EXECUTION_PACING_HINTS", zoneKind: "ELIGIBLE", authorityOwner: "daemon / pacing heuristics", mutationRisk: "MEDIUM", blastRadius: "queueing instability", reversibility: "config snapshot" },
  { subsystemKey: "COOLDOWN_TIMING_HINTS", zoneKind: "ELIGIBLE", authorityOwner: "cooldown semantics in session/order flow", mutationRisk: "MEDIUM", blastRadius: "churn / lockout imbalance", reversibility: "checkpoint" },
  { subsystemKey: "POSITION_SIZING_HINTS", zoneKind: "ELIGIBLE", authorityOwner: "advisory sizing only (not invariant sizing)", mutationRisk: "HIGH", blastRadius: "notional explosion if miswired", reversibility: "checkpoint" },

  { subsystemKey: "RISK_LIMIT_HARD_CAPS", zoneKind: "OPERATOR_BOUND", authorityOwner: "env + governor floors", mutationRisk: "CRITICAL", blastRadius: "loss beyond policy", reversibility: "operator only" },
  { subsystemKey: "APPROVAL_STRICTNESS_CORE", zoneKind: "OPERATOR_BOUND", authorityOwner: "governance mode machine", mutationRisk: "HIGH", blastRadius: "execution when should pause", reversibility: "mode transition audit" },
]

const RATE_WINDOW_DAYS = 7
const MAX_SUBMITTED_IN_WINDOW = 5
const MIN_CONFIDENCE_SAMPLE_SIZE = 20
const MAX_STABILITY_PRESSURE = 0.45
const MAX_RELIABILITY_ERROR = 0.24
const ALLOWED_DRIFT: DriftLevel[] = ["STABLE", "MINOR_DRIFT"]

function requireAdmin() {
  return createAdminClient()
}

export type EvolutionEvaluationVerdict = "REJECT_IMMUTABLE_ZONE" | "REJECT_NOT_ELIGIBLE" | "REJECT_UNSTABLE_SYSTEM" | "REJECT_RATE_LIMIT" | "CONDITIONALLY_APPROVED_EVAL_ONLY"

export type AdaptationEvaluation = {
  verdict: EvolutionEvaluationVerdict
  evaluatorConfidence: number
  gates: Record<string, boolean>
  details: Record<string, unknown>
  rejectionReason?: string
}

async function fetchStabilitySignals(userId: string) {
  const admin = requireAdmin()
  const [dds, conf, gov, gate] = await Promise.all([
    admin.from("DriftDetectionState").select("*").eq("userId", userId).maybeSingle(),
    admin.from("ConfidenceAuditSnapshot").select("*").eq("userId", userId).order("createdAt", { ascending: false }).limit(1).maybeSingle(),
    getGovernanceState(),
    getResumeGate(),
  ])
  const driftLevel = (dds.data?.driftLevel as DriftLevel | undefined) ?? "STABLE"
  const stabilityPressure = Number(dds.data?.stabilityPressure ?? 0)
  const sampleSize = Number(conf.data?.sampleSize ?? 0)
  const reliabilityError = Number(conf.data?.reliabilityError ?? 1)
  const mode = String(gov.mode ?? "NORMAL")
  return { driftLevel, stabilityPressure, sampleSize, reliabilityError, mode, gate, governance: gov }
}

/**
 * Read-only constitutional evaluation. Does not apply any parameter changes to runtime.
 */
export async function evaluateAdaptationProposal(input: { userId: string; subsystem: string }): Promise<AdaptationEvaluation> {
  const subsystem = input.subsystem.trim().toUpperCase().replace(/\s+/g, "_")

  const gates: Record<string, boolean> = {
    notImmutable: !IMMUTABLE_MUTATION_ZONES.has(subsystem),
    eligibleOrDocumented: ADAPTATION_ELIGIBLE_ZONES.has(subsystem),
    startupSafe: false,
    governanceHealthy: false,
    driftAcceptable: false,
    stabilityPressureOk: false,
    sampleSizeOk: false,
    reliabilityOk: false,
    rateLimitOk: true,
  }

  const sig = await fetchStabilitySignals(input.userId)
  gates.startupSafe = sig.gate.status === "SAFE_TO_RESUME"
  gates.governanceHealthy = !["EXECUTION_DISABLED", "GLOBAL_PAUSE", "GOVERNANCE_LOCKED"].includes(sig.mode)
  gates.driftAcceptable = ALLOWED_DRIFT.includes(sig.driftLevel)
  gates.stabilityPressureOk = sig.stabilityPressure < MAX_STABILITY_PRESSURE
  gates.sampleSizeOk = sig.sampleSize >= MIN_CONFIDENCE_SAMPLE_SIZE
  gates.reliabilityOk = sig.reliabilityError <= MAX_RELIABILITY_ERROR

  const since = new Date(Date.now() - RATE_WINDOW_DAYS * 86400_000).toISOString()
  const admin = requireAdmin()
  const { data: recent, error: rateErr } = await admin
    .from("AdaptationProposal")
    .select("id,status,createdAt")
    .eq("userId", input.userId)
    .gte("createdAt", since)
    .in("status", ["SUBMITTED", "UNDER_REVIEW"])
  if (rateErr) throw new Error(`DB_READ_FAILED: AdaptationProposal rate scan — ${rateErr.message}`)
  gates.rateLimitOk = (recent?.length ?? 0) < MAX_SUBMITTED_IN_WINDOW

  const details: Record<string, unknown> = {
    subsystem,
    driftLevel: sig.driftLevel,
    stabilityPressure: sig.stabilityPressure,
    confidenceSampleSize: sig.sampleSize,
    reliabilityError: sig.reliabilityError,
    governanceMode: sig.mode,
    startupGate: sig.gate.status,
    rateWindowDays: RATE_WINDOW_DAYS,
    submittedInWindow: recent?.length ?? 0,
  }

  if (IMMUTABLE_MUTATION_ZONES.has(subsystem)) {
    return {
      verdict: "REJECT_IMMUTABLE_ZONE",
      evaluatorConfidence: 1,
      gates,
      details,
      rejectionReason: "Subsystem is a constitutional invariant; autonomous or silent adaptation is forbidden.",
    }
  }
  if (!ADAPTATION_ELIGIBLE_ZONES.has(subsystem)) {
    return {
      verdict: "REJECT_NOT_ELIGIBLE",
      evaluatorConfidence: 0.95,
      gates,
      details,
      rejectionReason: "Subsystem is not in the adaptation-eligible registry for this phase.",
    }
  }
  if (!gates.rateLimitOk) {
    return {
      verdict: "REJECT_RATE_LIMIT",
      evaluatorConfidence: 0.9,
      gates,
      details,
      rejectionReason: `Too many active proposals in ${RATE_WINDOW_DAYS}d window (max ${MAX_SUBMITTED_IN_WINDOW}).`,
    }
  }
  const stableEnough =
    gates.startupSafe &&
    gates.governanceHealthy &&
    gates.driftAcceptable &&
    gates.stabilityPressureOk &&
    gates.sampleSizeOk &&
    gates.reliabilityOk
  if (!stableEnough) {
    return {
      verdict: "REJECT_UNSTABLE_SYSTEM",
      evaluatorConfidence: 0.75,
      gates,
      details,
      rejectionReason: "Stability / governance / confidence gates not satisfied; adaptation must not proceed when uncertain.",
    }
  }

  const passed = Object.values(gates).filter(Boolean).length
  const evaluatorConfidence = Math.min(0.98, 0.55 + passed * 0.05)
  return {
    verdict: "CONDITIONALLY_APPROVED_EVAL_ONLY",
    evaluatorConfidence,
    gates,
    details,
  }
}

export async function countRecentProposals(userId: string) {
  const since = new Date(Date.now() - RATE_WINDOW_DAYS * 86400_000).toISOString()
  const admin = requireAdmin()
  const { count, error } = await admin
    .from("AdaptationProposal")
    .select("*", { count: "exact", head: true })
    .eq("userId", userId)
    .gte("createdAt", since)
    .in("status", ["SUBMITTED", "UNDER_REVIEW"])
  if (error) throw new Error(`DB_READ_FAILED: AdaptationProposal count — ${error.message}`)
  return { count: count ?? 0, windowDays: RATE_WINDOW_DAYS, max: MAX_SUBMITTED_IN_WINDOW }
}

export async function createAdaptationProposal(input: {
  userId: string
  subsystem: string
  parameterKey: string
  proposedValue: unknown
  currentValueSnapshot?: unknown
  expectedImprovement?: string
  evidence?: unknown
  stabilityImpactEstimate?: unknown
  rollbackPlan?: string
  status?: ProposalStatus
}) {
  const admin = requireAdmin()
  const status = input.status ?? "DRAFT"
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") {
    const { count } = await countRecentProposals(input.userId)
    if (count >= MAX_SUBMITTED_IN_WINDOW) {
      throw new Error(`RATE_LIMIT: max ${MAX_SUBMITTED_IN_WINDOW} submitted proposals per ${RATE_WINDOW_DAYS} days`)
    }
  }
  const row = {
    id: `ap_${randomUUID()}`,
    userId: input.userId,
    status,
    subsystem: input.subsystem.trim().toUpperCase().replace(/\s+/g, "_"),
    parameterKey: input.parameterKey.trim(),
    currentValueSnapshot: input.currentValueSnapshot ?? null,
    proposedValue: input.proposedValue,
    expectedImprovement: input.expectedImprovement ?? null,
    evidence: input.evidence ?? null,
    stabilityImpactEstimate: input.stabilityImpactEstimate ?? null,
    rollbackPlan: input.rollbackPlan ?? null,
    evaluatorConfidence: null,
    evaluationVerdict: null,
    evaluationDetails: null,
    rejectionReason: null,
    reviewedAt: null,
  }
  const { error } = await admin.from("AdaptationProposal").insert(row)
  if (error) throw new Error(`DB_WRITE_FAILED: AdaptationProposal insert — ${error.message}`)
  await logEvolutionAudit({
    userId: input.userId,
    proposalId: row.id,
    eventType: "PROPOSAL_CREATED",
    details: { status, subsystem: row.subsystem, parameterKey: row.parameterKey },
  })
  return row
}

export async function persistProposalEvaluation(input: {
  proposalId: string
  userId: string
  evaluation: AdaptationEvaluation
}) {
  const admin = requireAdmin()
  const { data: proposal, error: readErr } = await admin.from("AdaptationProposal").select("*").eq("id", input.proposalId).maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: AdaptationProposal — ${readErr.message}`)
  if (!proposal || proposal.userId !== input.userId) throw new Error("NOT_FOUND")

  const status: ProposalStatus =
    input.evaluation.verdict === "CONDITIONALLY_APPROVED_EVAL_ONLY" ? "CONDITIONALLY_APPROVED_EVAL_ONLY" : "REJECTED"

  const { error: upErr } = await admin
    .from("AdaptationProposal")
    .update({
      status,
      evaluatorConfidence: input.evaluation.evaluatorConfidence,
      evaluationVerdict: input.evaluation.verdict,
      evaluationDetails: { gates: input.evaluation.gates, details: input.evaluation.details },
      rejectionReason: input.evaluation.rejectionReason ?? null,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq("id", input.proposalId)
    .eq("userId", input.userId)
  if (upErr) throw new Error(`DB_WRITE_FAILED: AdaptationProposal update — ${upErr.message}`)

  await logEvolutionAudit({
    userId: input.userId,
    proposalId: input.proposalId,
    eventType: "EVALUATION_COMPLETE",
    details: input.evaluation,
  })
  await logEvolutionAudit({
    userId: input.userId,
    proposalId: input.proposalId,
    eventType: "STABILITY_APPROVAL_RECORD",
    details: {
      verdict: input.evaluation.verdict,
      evaluatorConfidence: input.evaluation.evaluatorConfidence,
      gates: input.evaluation.gates,
    },
  })
}

export async function createRollbackCheckpoint(input: { userId: string; label: string; proposalId?: string | null }) {
  const admin = requireAdmin()
  const [gov, drift, gate] = await Promise.all([
    getGovernanceState(),
    admin.from("DriftDetectionState").select("*").eq("userId", input.userId).maybeSingle(),
    getResumeGate(),
  ])
  const snapshot = {
    kind: "EVOLUTION_GOVERNANCE_CHECKPOINT_V1",
    takenAt: new Date().toISOString(),
    engineGovernanceState: gov,
    driftDetectionState: drift.data ?? null,
    startupRecoveryGate: gate,
  }
  const row = {
    id: `rb_${randomUUID()}`,
    userId: input.userId,
    label: input.label.slice(0, 500),
    proposalId: input.proposalId ?? null,
    snapshot,
  }
  const { error } = await admin.from("RollbackCheckpoint").insert(row)
  if (error) throw new Error(`DB_WRITE_FAILED: RollbackCheckpoint insert — ${error.message}`)
  await logEvolutionAudit({
    userId: input.userId,
    proposalId: input.proposalId ?? undefined,
    eventType: "ROLLBACK_CHECKPOINT_CREATED",
    details: { checkpointId: row.id, label: row.label },
  })
  return row
}

export async function logEvolutionAudit(input: { userId: string; proposalId?: string; eventType: string; details?: unknown }) {
  const admin = requireAdmin()
  const { error } = await admin.from("EvolutionAuditEvent").insert({
    id: `ea_${randomUUID()}`,
    userId: input.userId,
    proposalId: input.proposalId ?? null,
    eventType: input.eventType,
    details: input.details ?? null,
  })
  if (error) throw new Error(`DB_WRITE_FAILED: EvolutionAuditEvent insert — ${error.message}`)
}
