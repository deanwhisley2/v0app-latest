import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"

type PositionStatus = "FLAT" | "LONG"

export type DaemonSymbolRuntime = {
  daemonType: string
  userId: string
  symbol: string
  positionStatus: PositionStatus
  openSessionId: string | null
  openQuantity: number | null
  openEntryPrice: number | null
  openEntryCost: number | null
  streakAction: string | null
  streakCount: number
  streakUpdatedAt: string | null
  lastExecutionAt: string | null
  lastEntryAt: string | null
  tradeCountWindow: number
  totalLossWindow: number
  windowStart: string | null
  version: number
}

function requireAdmin() {
  return createAdminClient()
}

export async function acquireOrchestrationLease(input: { leaseKey: string; workerId: string; ttlMs?: number }) {
  const admin = requireAdmin()
  const ttlMs = Math.max(30_000, input.ttlMs ?? 120_000)
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const nextExpiry = new Date(now + ttlMs).toISOString()
  const { data: existing, error: readErr } = await admin
    .from("OrchestrationLease")
    .select("*")
    .eq("leaseKey", input.leaseKey)
    .maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: OrchestrationLease read — ${readErr.message}`)
  if (existing && new Date(existing.expiresAt).getTime() > now && existing.ownerId !== input.workerId) {
    console.log(`[orchestration-lease] leaseKey=${input.leaseKey} status=denied owner=${existing.ownerId}`)
    return { acquired: false as const, ownerId: existing.ownerId as string }
  }
  const { error } = await admin.from("OrchestrationLease").upsert(
    {
      leaseKey: input.leaseKey,
      ownerId: input.workerId,
      heartbeatAt: nowIso,
      expiresAt: nextExpiry,
    },
    { onConflict: "leaseKey" }
  )
  if (error) throw new Error(`DB_WRITE_FAILED: OrchestrationLease upsert — ${error.message}`)
  console.log(`[orchestration-lease] leaseKey=${input.leaseKey} status=acquired owner=${input.workerId}`)
  return { acquired: true as const, ownerId: input.workerId }
}

export async function heartbeatOrchestrationLease(input: { leaseKey: string; workerId: string; ttlMs?: number }) {
  const admin = requireAdmin()
  const ttlMs = Math.max(30_000, input.ttlMs ?? 120_000)
  const nowIso = new Date().toISOString()
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()
  const { error } = await admin
    .from("OrchestrationLease")
    .update({
      heartbeatAt: nowIso,
      expiresAt,
    })
    .eq("leaseKey", input.leaseKey)
    .eq("ownerId", input.workerId)
  if (error) throw new Error(`DB_WRITE_FAILED: OrchestrationLease heartbeat — ${error.message}`)
  console.log(`[daemon-heartbeat] leaseKey=${input.leaseKey} workerId=${input.workerId}`)
}

export async function getDaemonSymbolRuntime(input: { daemonType: string; userId: string; symbol: string }) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("DaemonSymbolState")
    .select("*")
    .eq("daemonType", input.daemonType)
    .eq("userId", input.userId)
    .eq("symbol", input.symbol)
    .maybeSingle()
  if (error) throw new Error(`DB_READ_FAILED: DaemonSymbolState read — ${error.message}`)
  if (!data) {
    const row = {
      id: `dss_${randomUUID()}`,
      daemonType: input.daemonType,
      userId: input.userId,
      symbol: input.symbol,
      positionStatus: "FLAT",
      tradeCountWindow: 0,
      totalLossWindow: 0,
      version: 1,
    }
    const { error: insErr } = await admin.from("DaemonSymbolState").insert(row)
    if (insErr) throw new Error(`DB_WRITE_FAILED: DaemonSymbolState insert — ${insErr.message}`)
    return { ...row, openSessionId: null, openQuantity: null, openEntryPrice: null, openEntryCost: null, streakAction: null, streakCount: 0, streakUpdatedAt: null, lastExecutionAt: null, lastEntryAt: null, windowStart: null } as DaemonSymbolRuntime
  }
  return data as DaemonSymbolRuntime
}

/** Symbols (e.g. BTCUSDT) currently marked LONG for this daemon worker + user. */
export async function listDaemonSymbolLongs(input: { daemonType: string; userId: string }) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("DaemonSymbolState")
    .select("symbol")
    .eq("daemonType", input.daemonType)
    .eq("userId", input.userId)
    .eq("positionStatus", "LONG")
  if (error) throw new Error(`DB_READ_FAILED: DaemonSymbolState list LONG — ${error.message}`)
  return (data ?? []).map((row) => String((row as { symbol: string }).symbol))
}

export async function updateDaemonSymbolRuntime(
  input: { daemonType: string; userId: string; symbol: string; expectedVersion: number },
  patch: Partial<Omit<DaemonSymbolRuntime, "daemonType" | "userId" | "symbol" | "version">>
) {
  const admin = requireAdmin()
  const { error } = await admin
    .from("DaemonSymbolState")
    .update({
      ...patch,
      version: input.expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    })
    .eq("daemonType", input.daemonType)
    .eq("userId", input.userId)
    .eq("symbol", input.symbol)
    .eq("version", input.expectedVersion)
  if (error) throw new Error(`STATE_CONFLICT: DaemonSymbolState update failed — ${error.message}`)
  console.log(`[execution-authority] daemon=${input.daemonType} symbol=${input.symbol} patch=${Object.keys(patch).join(",")}`)
}
