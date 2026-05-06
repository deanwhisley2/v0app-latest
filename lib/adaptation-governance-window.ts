import { createAdminClient } from "@/lib/supabaseAdmin"

/**
 * Canonical read bundle for adaptation / simulation / rollback artefacts in a supervisory window.
 * Shared by recursive meta-assessment and pluralistic cognitive councils (single worldview → multiple lenses).
 */

export type AdaptationGovernanceWindowSnapshot = {
  sinceIso: string
  windowDays: number
  proposals: Array<Record<string, unknown>>
  audits: Array<Record<string, unknown>>
  simulations: Array<{ simulationReliability?: { score?: number } | null }>
  comparatives: Array<{
    evolutionFitnessSnapshot?: Record<string, unknown> | null
    metaSimulationReliability?: Record<string, unknown> | null
  }>
  temporals: Array<{
    longHorizonFitnessSnapshot?: Record<string, unknown> | null
    temporalReliability?: Record<string, unknown> | null
  }>
  rollbacks: unknown[]
}

function requireAdmin() {
  return createAdminClient()
}

export function clampSupervisoryWindowDays(n: number) {
  return Math.max(7, Math.min(120, Math.round(n)))
}

export async function loadAdaptationGovernanceWindow(userId: string, windowDays: number): Promise<AdaptationGovernanceWindowSnapshot> {
  const wd = clampSupervisoryWindowDays(windowDays)
  const since = new Date(Date.now() - wd * 86400_000).toISOString()
  const admin = requireAdmin()

  const [proposalRes, auditRes, simRes, compRes, tempRes, rbRes] = await Promise.all([
    admin.from("AdaptationProposal").select("id,status,subsystem,evaluationVerdict,createdAt").eq("userId", userId).gte("createdAt", since),
    admin.from("EvolutionAuditEvent").select("id,eventType,createdAt,details").eq("userId", userId).gte("createdAt", since),
    admin
      .from("SimulationRun")
      .select("id,simulationReliability,createdAt")
      .eq("userId", userId)
      .gte("createdAt", since)
      .order("createdAt", { ascending: false })
      .limit(300),
    admin
      .from("ComparativeSimulationRun")
      .select("id,evolutionFitnessSnapshot,metaSimulationReliability,createdAt")
      .eq("userId", userId)
      .gte("createdAt", since)
      .order("createdAt", { ascending: false })
      .limit(120),
    admin
      .from("TemporalEvolutionRun")
      .select("id,longHorizonFitnessSnapshot,temporalReliability,createdAt")
      .eq("userId", userId)
      .gte("createdAt", since)
      .order("createdAt", { ascending: false })
      .limit(120),
    admin.from("RollbackCheckpoint").select("id,createdAt").eq("userId", userId).gte("createdAt", since),
  ])

  for (const { label, error } of [
    { label: "AdaptationProposal", error: proposalRes.error },
    { label: "EvolutionAuditEvent", error: auditRes.error },
    { label: "SimulationRun", error: simRes.error },
    { label: "ComparativeSimulationRun", error: compRes.error },
    { label: "TemporalEvolutionRun", error: tempRes.error },
    { label: "RollbackCheckpoint", error: rbRes.error },
  ]) {
    if (error) throw new Error(`DB_READ_FAILED: ${label} — ${error.message}`)
  }

  return {
    sinceIso: since,
    windowDays: wd,
    proposals: (proposalRes.data ?? []) as AdaptationGovernanceWindowSnapshot["proposals"],
    audits: (auditRes.data ?? []) as AdaptationGovernanceWindowSnapshot["audits"],
    simulations: (simRes.data ?? []) as AdaptationGovernanceWindowSnapshot["simulations"],
    comparatives: (compRes.data ?? []) as AdaptationGovernanceWindowSnapshot["comparatives"],
    temporals: (tempRes.data ?? []) as AdaptationGovernanceWindowSnapshot["temporals"],
    rollbacks: rbRes.data ?? [],
  }
}
