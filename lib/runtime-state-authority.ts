import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"

export type PositionStatus = "FLAT" | "PENDING_ENTRY" | "LONG" | "EXITING"
export type ExecutionStatus = "PENDING" | "ACTIVE" | "STOP_BUYS" | "COMPLETED" | "ABORTED" | "FAILED"
export type IdempotencyStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED"

function requireAdmin() {
  try {
    return createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`DB_WRITE_FAILED: ${msg}`)
  }
}

function dayKeyUtc(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export async function logStateTransition(input: {
  userId: string
  symbol: string
  sessionId?: string
  stateType: "position-state" | "cooldown-state" | "risk-state" | "execution-state"
  transition: string
  details?: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const row = {
    id: `evt_${randomUUID()}`,
    userId: input.userId,
    symbol: input.symbol,
    sessionId: input.sessionId ?? null,
    stateType: input.stateType,
    transition: input.transition,
    details: input.details ?? {},
  }
  const { error } = await admin.from("EngineRuntimeStateEvent").insert(row)
  if (error) throw new Error(`DB_WRITE_FAILED: EngineRuntimeStateEvent insert — ${error.message}`)
  console.log(
    `[${input.stateType}] transition=${input.transition} userId=${input.userId} symbol=${input.symbol} sessionId=${input.sessionId ?? "-"}`
  )
}

export async function acquireExecutionLock(input: {
  lockKey: string
  ownerId: string
  ttlMs?: number
  userId?: string
  symbol?: string
  sessionId?: string
}): Promise<{ acquired: boolean; lockId: string }> {
  const admin = requireAdmin()
  const nowIso = new Date().toISOString()
  const lockId = input.lockKey
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 120_000)).toISOString()
  const { data: existing, error: readErr } = await admin
    .from("ExecutionLock")
    .select("*")
    .eq("lockId", lockId)
    .maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: ExecutionLock select — ${readErr.message}`)
  if (existing && typeof existing.expiresAt === "string" && new Date(existing.expiresAt).getTime() > Date.now()) {
    await logStateTransition({
      userId: input.userId ?? "system",
      symbol: input.symbol ?? "GLOBAL",
      sessionId: input.sessionId,
      stateType: "execution-state",
      transition: "LOCK_REJECTED",
      details: { lockKey: input.lockKey, currentOwner: existing.ownerId },
    })
    console.warn(`[execution-lock] acquire rejected lockKey=${input.lockKey} owner=${input.ownerId}`)
    return { acquired: false, lockId }
  }
  const { error: upErr } = await admin.from("ExecutionLock").upsert(
    {
      lockId,
      ownerId: input.ownerId,
      acquiredAt: nowIso,
      expiresAt,
    },
    { onConflict: "lockId" }
  )
  if (upErr) throw new Error(`DB_WRITE_FAILED: ExecutionLock upsert — ${upErr.message}`)
  console.log(`[execution-lock] acquired lockKey=${input.lockKey} owner=${input.ownerId}`)
  return { acquired: true, lockId }
}

export async function releaseExecutionLock(input: {
  lockKey: string
  ownerId: string
  userId?: string
  symbol?: string
  sessionId?: string
}) {
  const admin = requireAdmin()
  const { error } = await admin.from("ExecutionLock").delete().eq("lockId", input.lockKey).eq("ownerId", input.ownerId)
  if (error) throw new Error(`DB_WRITE_FAILED: ExecutionLock release — ${error.message}`)
  await logStateTransition({
    userId: input.userId ?? "system",
    symbol: input.symbol ?? "GLOBAL",
    sessionId: input.sessionId,
    stateType: "execution-state",
    transition: "LOCK_RELEASED",
    details: { lockKey: input.lockKey, ownerId: input.ownerId },
  })
  console.log(`[execution-lock] released lockKey=${input.lockKey} owner=${input.ownerId}`)
}

export async function beginIdempotentEvent(input: {
  eventKey: string
  userId: string
  symbol: string
  sessionId?: string
}): Promise<{ ok: boolean; existingStatus?: IdempotencyStatus }> {
  const admin = requireAdmin()
  const { data: existing, error: readErr } = await admin
    .from("ExecutionIdempotency")
    .select("*")
    .eq("eventKey", input.eventKey)
    .maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: ExecutionIdempotency select — ${readErr.message}`)
  if (existing) {
    const status = (existing.status as IdempotencyStatus) ?? "FAILED"
    await logStateTransition({
      userId: input.userId,
      symbol: input.symbol,
      sessionId: input.sessionId,
      stateType: "execution-state",
      transition: "IDEMPOTENCY_HIT",
      details: { eventKey: input.eventKey, status },
    })
    console.warn(`[idempotency] hit eventKey=${input.eventKey} status=${status}`)
    return { ok: false, existingStatus: status }
  }
  const { error } = await admin.from("ExecutionIdempotency").insert({
    eventKey: input.eventKey,
    userId: input.userId,
    symbol: input.symbol,
    sessionId: input.sessionId ?? null,
    status: "IN_PROGRESS",
  })
  if (error) throw new Error(`DB_WRITE_FAILED: ExecutionIdempotency insert — ${error.message}`)
  console.log(`[idempotency] begin eventKey=${input.eventKey}`)
  return { ok: true }
}

export async function completeIdempotentEvent(input: {
  eventKey: string
  status: Exclude<IdempotencyStatus, "IN_PROGRESS">
  response?: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const { error } = await admin
    .from("ExecutionIdempotency")
    .update({
      status: input.status,
      response: input.response ?? null,
      updatedAt: new Date().toISOString(),
    })
    .eq("eventKey", input.eventKey)
  if (error) throw new Error(`DB_WRITE_FAILED: ExecutionIdempotency update — ${error.message}`)
}

export async function upsertExecutionState(input: {
  sessionId: string
  userId: string
  symbol: string
  status: ExecutionStatus
  lastError?: string | null
  expectedVersion?: number
}) {
  const admin = requireAdmin()
  const { data: existing, error: readErr } = await admin
    .from("ExecutionState")
    .select("*")
    .eq("sessionId", input.sessionId)
    .maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: ExecutionState select — ${readErr.message}`)
  if (!existing) {
    const { error } = await admin.from("ExecutionState").insert({
      sessionId: input.sessionId,
      userId: input.userId,
      symbol: input.symbol,
      status: input.status,
      lastError: input.lastError ?? null,
      version: 1,
    })
    if (error) throw new Error(`DB_WRITE_FAILED: ExecutionState insert — ${error.message}`)
  } else {
    if (typeof input.expectedVersion === "number" && Number(existing.version) !== input.expectedVersion) {
      await logStateTransition({
        userId: input.userId,
        symbol: input.symbol,
        sessionId: input.sessionId,
        stateType: "execution-state",
        transition: "VERSION_CONFLICT",
        details: { expectedVersion: input.expectedVersion, actualVersion: existing.version },
      })
      throw new Error(`STATE_CONFLICT: ExecutionState version mismatch (expected ${input.expectedVersion}, got ${existing.version})`)
    }
    const { error } = await admin
      .from("ExecutionState")
      .update({
        status: input.status,
        lastError: input.lastError ?? null,
        version: Number(existing.version) + 1,
      })
      .eq("sessionId", input.sessionId)
      .eq("version", existing.version)
    if (error) throw new Error(`DB_WRITE_FAILED: ExecutionState update — ${error.message}`)
  }
  await logStateTransition({
    userId: input.userId,
    symbol: input.symbol,
    sessionId: input.sessionId,
    stateType: "execution-state",
    transition: input.status,
    details: { lastError: input.lastError ?? null },
  })
}

export async function upsertPositionState(input: {
  userId: string
  symbol: string
  sessionId?: string
  status: PositionStatus
  quantity?: number | null
  entryPrice?: number | null
  expectedVersion?: number
}) {
  const admin = requireAdmin()
  const { data: existing, error: readErr } = await admin
    .from("PositionState")
    .select("*")
    .eq("userId", input.userId)
    .eq("symbol", input.symbol)
    .maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: PositionState select — ${readErr.message}`)
  if (!existing) {
    const { error } = await admin.from("PositionState").insert({
      userId: input.userId,
      symbol: input.symbol,
      sessionId: input.sessionId ?? null,
      status: input.status,
      quantity: input.quantity ?? null,
      entryPrice: input.entryPrice ?? null,
      version: 1,
    })
    if (error) throw new Error(`DB_WRITE_FAILED: PositionState insert — ${error.message}`)
  } else {
    if (typeof input.expectedVersion === "number" && Number(existing.version) !== input.expectedVersion) {
      await logStateTransition({
        userId: input.userId,
        symbol: input.symbol,
        sessionId: input.sessionId,
        stateType: "position-state",
        transition: "VERSION_CONFLICT",
        details: { expectedVersion: input.expectedVersion, actualVersion: existing.version },
      })
      throw new Error(`STATE_CONFLICT: PositionState version mismatch (expected ${input.expectedVersion}, got ${existing.version})`)
    }
    const { error } = await admin
      .from("PositionState")
      .update({
        sessionId: input.sessionId ?? null,
        status: input.status,
        quantity: input.quantity ?? null,
        entryPrice: input.entryPrice ?? null,
        version: Number(existing.version) + 1,
      })
      .eq("userId", input.userId)
      .eq("symbol", input.symbol)
      .eq("version", existing.version)
    if (error) throw new Error(`DB_WRITE_FAILED: PositionState update — ${error.message}`)
  }
  await logStateTransition({
    userId: input.userId,
    symbol: input.symbol,
    sessionId: input.sessionId,
    stateType: "position-state",
    transition: input.status,
    details: { quantity: input.quantity ?? null, entryPrice: input.entryPrice ?? null },
  })
}

export async function upsertCooldownState(input: {
  userId: string
  symbol: string
  cooldownUntil?: string | null
  pauseUntil?: string | null
  lastExecutionAt?: string | null
  tradeCountWindow?: number | null
  tradeWindowStart?: string | null
  transition?: string
  expectedVersion?: number
}) {
  const admin = requireAdmin()
  const { data: existing, error: readErr } = await admin
    .from("CooldownState")
    .select("*")
    .eq("userId", input.userId)
    .eq("symbol", input.symbol)
    .maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: CooldownState select — ${readErr.message}`)
  if (!existing) {
    const { error } = await admin.from("CooldownState").insert({
      userId: input.userId,
      symbol: input.symbol,
      cooldownUntil: input.cooldownUntil ?? null,
      pauseUntil: input.pauseUntil ?? null,
      lastExecutionAt: input.lastExecutionAt ?? null,
      tradeCountWindow: input.tradeCountWindow ?? null,
      tradeWindowStart: input.tradeWindowStart ?? null,
      version: 1,
    })
    if (error) throw new Error(`DB_WRITE_FAILED: CooldownState insert — ${error.message}`)
  } else {
    if (typeof input.expectedVersion === "number" && Number(existing.version) !== input.expectedVersion) {
      await logStateTransition({
        userId: input.userId,
        symbol: input.symbol,
        stateType: "cooldown-state",
        transition: "VERSION_CONFLICT",
        details: { expectedVersion: input.expectedVersion, actualVersion: existing.version },
      })
      throw new Error(`STATE_CONFLICT: CooldownState version mismatch (expected ${input.expectedVersion}, got ${existing.version})`)
    }
    const { error } = await admin
      .from("CooldownState")
      .update({
        cooldownUntil: input.cooldownUntil ?? null,
        pauseUntil: input.pauseUntil ?? null,
        lastExecutionAt: input.lastExecutionAt ?? null,
        tradeCountWindow: input.tradeCountWindow ?? null,
        tradeWindowStart: input.tradeWindowStart ?? null,
        version: Number(existing.version) + 1,
      })
      .eq("userId", input.userId)
      .eq("symbol", input.symbol)
      .eq("version", existing.version)
    if (error) throw new Error(`DB_WRITE_FAILED: CooldownState update — ${error.message}`)
  }
  const row = {
    userId: input.userId,
    symbol: input.symbol,
    cooldownUntil: input.cooldownUntil ?? null,
    pauseUntil: input.pauseUntil ?? null,
    lastExecutionAt: input.lastExecutionAt ?? null,
    tradeCountWindow: input.tradeCountWindow ?? null,
    tradeWindowStart: input.tradeWindowStart ?? null,
  }
  await logStateTransition({
    userId: input.userId,
    symbol: input.symbol,
    stateType: "cooldown-state",
    transition: input.transition ?? "UPSERT",
    details: row,
  })
}

export async function applyRiskTradeClose(input: {
  userId: string
  symbol: string
  pnlUsd: number
  pausedUntilMs?: number | null
}) {
  const admin = requireAdmin()
  const key = dayKeyUtc()
  const { data: existing, error: readErr } = await admin
    .from("RiskState")
    .select("*")
    .eq("userId", input.userId)
    .eq("dayKey", key)
    .maybeSingle()
  if (readErr) throw new Error(`DB_READ_FAILED: RiskState select — ${readErr.message}`)
  const prevPnl = Number(existing?.realizedPnlUsd ?? 0)
  const prevLosses = Number(existing?.consecutiveLosses ?? 0)
  const prevTrades = Number(existing?.tradeCount ?? 0)
  const next = {
    userId: input.userId,
    dayKey: key,
    realizedPnlUsd: prevPnl + input.pnlUsd,
    consecutiveLosses: input.pnlUsd < 0 ? prevLosses + 1 : 0,
    tradeCount: prevTrades + 1,
    pauseUntil: input.pausedUntilMs ? new Date(input.pausedUntilMs).toISOString() : (existing?.pauseUntil ?? null),
    version: Number(existing?.version ?? 0) + 1,
  }
  if (!existing) {
    const { error: insErr } = await admin.from("RiskState").insert(next)
    if (insErr) throw new Error(`DB_WRITE_FAILED: RiskState insert — ${insErr.message}`)
  } else {
    const { error: upErr } = await admin
      .from("RiskState")
      .update(next)
      .eq("userId", input.userId)
      .eq("dayKey", key)
      .eq("version", existing.version)
    if (upErr) {
      await logStateTransition({
        userId: input.userId,
        symbol: input.symbol,
        stateType: "risk-state",
        transition: "VERSION_CONFLICT",
        details: { expectedVersion: existing.version, dayKey: key },
      })
      throw new Error(`STATE_CONFLICT: RiskState update failed — ${upErr.message}`)
    }
  }
  await logStateTransition({
    userId: input.userId,
    symbol: input.symbol,
    stateType: "risk-state",
    transition: "TRADE_CLOSED",
    details: { pnlUsd: input.pnlUsd, dayKey: key, ...next },
  })
}

export async function commitEntryLifecycleTransaction(input: {
  sessionId: string
  userId: string
  symbol: string
  sessionStatus: string
  usedAmount: number
  endTime?: string | null
  orders: Array<Record<string, unknown>>
  positionStatus: PositionStatus
  positionQty?: number | null
  positionEntryPrice?: number | null
  executionStatus: ExecutionStatus
  executionLastError?: string | null
  lastExecutionAt?: string | null
}) {
  const admin = requireAdmin()
  console.log(
    `[transaction-start] lifecycle=entry sessionId=${input.sessionId} symbol=${input.symbol} scope=session+orders+position+execution+cooldown`
  )
  const { error } = await admin.rpc("expert_commit_entry_lifecycle", {
    p_session_id: input.sessionId,
    p_user_id: input.userId,
    p_symbol: input.symbol,
    p_session_status: input.sessionStatus,
    p_used_amount: input.usedAmount,
    p_end_time: input.endTime ?? null,
    p_orders: input.orders,
    p_position_status: input.positionStatus,
    p_position_qty: input.positionQty ?? null,
    p_position_entry_price: input.positionEntryPrice ?? null,
    p_execution_status: input.executionStatus,
    p_execution_last_error: input.executionLastError ?? null,
    p_last_execution_at: input.lastExecutionAt ?? null,
  })
  if (error) {
    console.error(
      `[transaction-rollback] lifecycle=entry sessionId=${input.sessionId} symbol=${input.symbol} error=${error.message}`
    )
    throw new Error(`TXN_FAILED: entry lifecycle — ${error.message}`)
  }
  console.log(`[transaction-commit] lifecycle=entry sessionId=${input.sessionId} symbol=${input.symbol}`)
}

export async function commitLiquidationLifecycleTransaction(input: {
  sessionId: string
  userId: string
  symbol: string
  sellOrder?: Record<string, unknown> | null
  sessionStatus: string
  endTime?: string | null
  executionStatus: ExecutionStatus
  executionLastError?: string | null
  markFlat: boolean
  lastExecutionAt?: string | null
  pnlUsd?: number | null
  tradeMemory?: Record<string, unknown> | null
}) {
  const admin = requireAdmin()
  console.log(
    `[transaction-start] lifecycle=liquidation sessionId=${input.sessionId} symbol=${input.symbol} scope=sell+session+position+risk+memory+execution`
  )
  const { error } = await admin.rpc("expert_commit_liquidation_lifecycle", {
    p_session_id: input.sessionId,
    p_user_id: input.userId,
    p_symbol: input.symbol,
    p_sell_order: input.sellOrder ?? null,
    p_session_status: input.sessionStatus,
    p_end_time: input.endTime ?? null,
    p_execution_status: input.executionStatus,
    p_execution_last_error: input.executionLastError ?? null,
    p_mark_flat: input.markFlat,
    p_last_execution_at: input.lastExecutionAt ?? null,
    p_pnl_usd: input.pnlUsd ?? null,
    p_trade_memory: input.tradeMemory ?? null,
  })
  if (error) {
    console.error(
      `[transaction-rollback] lifecycle=liquidation sessionId=${input.sessionId} symbol=${input.symbol} error=${error.message}`
    )
    throw new Error(`TXN_FAILED: liquidation lifecycle — ${error.message}`)
  }
  console.log(`[transaction-commit] lifecycle=liquidation sessionId=${input.sessionId} symbol=${input.symbol}`)
}
