import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { reconcileIncompleteSessions } from "@/lib/exchange-reconciliation"

export type ResumeGateStatus =
  | "RECOVERY_IN_PROGRESS"
  | "SAFE_TO_RESUME"
  | "MANUAL_REVIEW_REQUIRED"
  | "RECOVERY_FAILED"
  | "EXECUTION_BLOCKED"

const GLOBAL_SCOPE = "GLOBAL_EXECUTION"

function requireAdmin() {
  try {
    return createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`DB_READ_FAILED: ${msg}`)
  }
}

export async function setResumeGate(status: ResumeGateStatus, payload?: { reason?: string; unresolvedCount?: number; details?: Record<string, unknown> }) {
  const admin = requireAdmin()
  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    scope: GLOBAL_SCOPE,
    status,
    reason: payload?.reason ?? null,
    lastRunAt: now,
    lastCompletedAt: status === "RECOVERY_IN_PROGRESS" ? null : now,
    unresolvedCount: payload?.unresolvedCount ?? 0,
    details: payload?.details ?? null,
    updatedAt: now,
  }
  const { error } = await admin.from("StartupRecoveryState").upsert(row, { onConflict: "scope" })
  if (error) throw new Error(`DB_WRITE_FAILED: StartupRecoveryState upsert — ${error.message}`)
  console.log(`[startup-recovery] gate=${status} reason=${payload?.reason ?? "-"} unresolved=${payload?.unresolvedCount ?? 0}`)
}

export async function getResumeGate(): Promise<{ status: ResumeGateStatus; unresolvedCount: number; reason?: string }> {
  const admin = requireAdmin()
  const { data, error } = await admin.from("StartupRecoveryState").select("*").eq("scope", GLOBAL_SCOPE).maybeSingle()
  if (error) throw new Error(`DB_READ_FAILED: StartupRecoveryState read — ${error.message}`)
  if (!data) return { status: "EXECUTION_BLOCKED", unresolvedCount: 0, reason: "startup gate not initialized" }
  return {
    status: (data.status as ResumeGateStatus) ?? "EXECUTION_BLOCKED",
    unresolvedCount: Number(data.unresolvedCount ?? 0),
    reason: data.reason ?? undefined,
  }
}

export async function clearStaleExecutionLocks(ttlMs = 180_000) {
  const admin = requireAdmin()
  const cutoff = new Date(Date.now() - Math.max(60_000, ttlMs)).toISOString()
  const { data: locks, error: readErr } = await admin
    .from("ExecutionLock")
    .select("*")
    .lt("expiresAt", cutoff)
  if (readErr) throw new Error(`DB_READ_FAILED: stale lock scan — ${readErr.message}`)
  let released = 0
  for (const l of locks ?? []) {
    const { error } = await admin.from("ExecutionLock").delete().eq("lockId", l.lockId)
    if (!error) {
      released += 1
      console.log(`[stale-lock-release] lockId=${l.lockId} owner=${l.ownerId}`)
    }
  }
  return released
}

export async function markStaleIdempotencyAsFailed(maxAgeMinutes = 30) {
  const admin = requireAdmin()
  const cutoff = new Date(Date.now() - Math.max(1, maxAgeMinutes) * 60_000).toISOString()
  const { data, error } = await admin
    .from("ExecutionIdempotency")
    .select("*")
    .eq("status", "IN_PROGRESS")
    .lt("createdAt", cutoff)
  if (error) throw new Error(`DB_READ_FAILED: stale idempotency scan — ${error.message}`)
  let marked = 0
  for (const row of data ?? []) {
    const { error: upErr } = await admin
      .from("ExecutionIdempotency")
      .update({
        status: "FAILED",
        response: { reason: "stale in-progress idempotency marked failed on startup recovery" },
        updatedAt: new Date().toISOString(),
      })
      .eq("eventKey", row.eventKey)
      .eq("status", "IN_PROGRESS")
    if (!upErr) marked += 1
  }
  return marked
}

export async function orchestrateStartupRecovery(input: {
  userId: string
  autoRepair?: boolean
  maxAgeMinutes?: number
}) {
  await setResumeGate("RECOVERY_IN_PROGRESS", { reason: "startup scan started" })
  try {
    console.log(`[startup-scan] userId=${input.userId} maxAge=${input.maxAgeMinutes ?? 30}m`)
    const releasedLocks = await clearStaleExecutionLocks()
    const staleIdem = await markStaleIdempotencyAsFailed()
    const recovered = await reconcileIncompleteSessions({
      userId: input.userId,
      maxAgeMinutes: input.maxAgeMinutes ?? 30,
      autoRepair: input.autoRepair === true,
    })
    const unresolved = recovered.filter((r) => {
      const status = String((r as { status?: string }).status ?? "")
      return status === "RECOVERY_REQUIRED" || status === "DIVERGED" || status === "EXCHANGE_UNKNOWN"
    })
    const gate: ResumeGateStatus = unresolved.length > 0 ? "MANUAL_REVIEW_REQUIRED" : "SAFE_TO_RESUME"
    await setResumeGate(gate, {
      reason: unresolved.length > 0 ? "unresolved recovery items detected" : "startup recovery completed",
      unresolvedCount: unresolved.length,
      details: {
        releasedLocks,
        staleIdempotencyMarkedFailed: staleIdem,
        recoveredCount: recovered.length,
      },
    })
    console.log(
      `[resume-approved] status=${gate} unresolved=${unresolved.length} releasedLocks=${releasedLocks} staleIdempotency=${staleIdem}`
    )
    return { gate, unresolvedCount: unresolved.length, releasedLocks, staleIdem, recovered }
  } catch (e) {
    await setResumeGate("RECOVERY_FAILED", {
      reason: e instanceof Error ? e.message : String(e),
      unresolvedCount: 0,
    })
    console.error(`[resume-blocked] status=RECOVERY_FAILED error=${e instanceof Error ? e.message : String(e)}`)
    throw e
  }
}
