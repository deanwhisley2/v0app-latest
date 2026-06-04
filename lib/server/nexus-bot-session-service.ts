import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { computeParticipationWeight } from "@/lib/nexus-bot/participation-weight"
import {
  closedTradeHistorySummary,
  resolveTradeSessionPhaseKey,
  TRADE_SESSION_OPEN_STATUSES,
  type TradeSessionPhaseKey,
} from "@/lib/nexus-bot/user-session-messaging"
import {
  isNexusAutoTradePlanKey,
  normalizeSignalCode,
  type NexusSignalSlot,
} from "@/lib/nexus-bot/plans"
import { casCreditNexusMainOnly, casReserveCopyTradeStake } from "@/lib/server/nexus-main-enforcement"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import {
  awardPerformancePoints,
  incrementCompletedSessions,
} from "@/lib/server/performance-points"
import { consumeTradeSessionVerification } from "@/lib/server/trade-session-verification"
import { findActiveTradeSessionByCode } from "@/lib/server/trade-sessions"
import {
  ensureUserTradeSessionReserve,
  previewSessionPayoutFromCapital,
  processTradeSessionForfeitures,
  settleTradeSessionParticipation,
} from "@/lib/server/trade-session-earnings-reserve"

export type { UserTradeSessionReserveRow } from "@/lib/server/trade-session-earnings-reserve"
export { previewSessionPayoutFromCapital } from "@/lib/server/trade-session-earnings-reserve"

export function resolveUserDisplayPhase(params: {
  status: string
  startAt: string
  endAt: string
  displayPhase?: string | null
  now?: Date
}): TradeSessionPhaseKey {
  if (params.displayPhase) {
    const key = params.displayPhase as TradeSessionPhaseKey
    if (
      [
        "booked",
        "ready",
        "waiting_window",
        "active_analysing",
        "active_strategy",
        "capturing",
        "completed",
        "profit_released",
      ].includes(key)
    ) {
      return key
    }
  }
  return resolveTradeSessionPhaseKey(params)
}

async function awardAttendancePoints(
  admin: SupabaseClient,
  userId: string,
  currentStreak: number,
  isNewVisit: boolean,
): Promise<void> {
  if (!isNewVisit) return
  const today = new Date().toISOString().slice(0, 10)
  await awardPerformancePoints(admin, {
    userId,
    ruleKey: "daily_attendance",
    idempotencyKey: `attendance:${userId}:${today}`,
    reason: "Daily platform visit",
    source: "attendance",
  })
  if (currentStreak >= 7) {
    await awardPerformancePoints(admin, {
      userId,
      ruleKey: "attendance_streak_7",
      idempotencyKey: `streak7:${userId}`,
      reason: "7-day attendance streak",
      source: "attendance_streak",
    })
  }
}

export async function recordAttendanceVisit(
  admin: SupabaseClient,
  userId: string,
): Promise<{ currentStreak: number; longestStreak: number; totalVisits: number }> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: row } = await admin
    .from("user_attendance_streaks")
    .select("last_visit_date,current_streak,longest_streak,total_visits")
    .eq("user_id", userId)
    .maybeSingle()

  let current = Number(row?.current_streak ?? 0)
  let longest = Number(row?.longest_streak ?? 0)
  let total = Number(row?.total_visits ?? 0)
  const last = row?.last_visit_date ? String(row.last_visit_date) : null

  if (last === today) {
    return { currentStreak: current, longestStreak: longest, totalVisits: total }
  }

  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)
  current = last === yStr ? current + 1 : 1
  longest = Math.max(longest, current)
  total += 1

  const { error } = await admin.from("user_attendance_streaks").upsert(
    {
      user_id: userId,
      last_visit_date: today,
      current_streak: current,
      longest_streak: longest,
      total_visits: total,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
  if (error) throw new Error(error.message)

  await awardAttendancePoints(admin, userId, current, true)
  return { currentStreak: current, longestStreak: longest, totalVisits: total }
}

export async function getAutoTradeGrantsMap(
  admin: SupabaseClient,
  userId: string,
): Promise<Record<string, boolean>> {
  const { data, error } = await admin
    .from("nexus_bot_auto_trade_grants")
    .select("plan_key,enabled")
    .eq("user_id", userId)
  if (error) throw new Error(error.message)
  const out: Record<string, boolean> = {}
  for (const r of data ?? []) {
    out[String(r.plan_key)] = Boolean(r.enabled)
  }
  return out
}

export async function findOpenSignalCode(
  admin: SupabaseClient,
  slot: NexusSignalSlot,
  codeRaw: string,
  now = new Date(),
): Promise<{
  id: string
  strategy_title: string
  confidence: string
  duration_hours: number
} | null> {
  const code = normalizeSignalCode(codeRaw)
  const { data, error } = await admin
    .from("nexus_signal_codes")
    .select("id,strategy_title,confidence,duration_hours,code,window_opens_at,window_closes_at,slot")
    .eq("slot", slot)
    .lte("window_opens_at", now.toISOString())
    .gte("window_closes_at", now.toISOString())
    .order("window_opens_at", { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  const hit = (data ?? []).find((r) => normalizeSignalCode(String(r.code ?? "")) === code)
  if (!hit) return null
  return {
    id: String(hit.id),
    strategy_title: String(hit.strategy_title),
    confidence: String(hit.confidence ?? "High"),
    duration_hours: Number(hit.duration_hours ?? 12),
  }
}

export async function syncTradeSessionBotStates(
  admin: SupabaseClient,
  userId?: string,
): Promise<void> {
  const now = new Date()
  const nowIso = now.toISOString()
  let q = admin
    .from("nexus_bot_sessions")
    .select(
      "id,user_id,status,trade_session_id,stake_usd,participation_weight,trade_sessions(start_at,end_at,session_slot)",
    )
    .not("trade_session_id", "is", null)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
  if (userId) q = q.eq("user_id", userId)
  const { data, error } = await q.limit(200)
  if (error) throw new Error(error.message)

  const endedTradeSessions = new Set<string>()

  for (const row of data ?? []) {
    const ts = row.trade_sessions as { start_at?: string; end_at?: string; session_slot?: string } | null
    if (!ts?.start_at || !ts?.end_at) continue
    const startMs = new Date(ts.start_at).getTime()
    const endMs = new Date(ts.end_at).getTime()
    const t = now.getTime()
    const status = String(row.status)

    if (t >= endMs) {
      await completeTradeSessionBotRow(admin, {
        id: String(row.id),
        userId: String(row.user_id),
        stakeUsd: Number(row.stake_usd ?? 0),
        tradeSessionId: String(row.trade_session_id),
        participationWeight: Number(row.participation_weight ?? 1),
        sessionStartAt: ts.start_at,
        sessionEndAt: ts.end_at,
        sessionSlot: String(ts.session_slot ?? "morning"),
      })
      endedTradeSessions.add(String(row.trade_session_id))
      continue
    }

    const nextStatus = t < startMs ? "booked" : "running"
    const phase = resolveUserDisplayPhase({
      status: nextStatus,
      startAt: ts.start_at,
      endAt: ts.end_at,
      now,
    })
    if (status !== nextStatus || phase) {
      await admin
        .from("nexus_bot_sessions")
        .update({ status: nextStatus, display_phase: phase })
        .eq("id", row.id)
        .in("status", [...TRADE_SESSION_OPEN_STATUSES])
    }
  }

  await admin
    .from("nexus_bot_sessions")
    .update({ status: "expired", display_phase: "completed" })
    .not("trade_session_id", "is", null)
    .in("status", ["booked", "ready", "pending"])
    .lt("ends_at", nowIso)

  for (const tradeSessionId of endedTradeSessions) {
    const ts = (data ?? []).find((r) => String(r.trade_session_id) === tradeSessionId)?.trade_sessions as
      | { start_at?: string; session_slot?: string }
      | null
      | undefined
    if (!ts?.start_at) continue
    await processTradeSessionForfeitures(admin, {
      id: tradeSessionId,
      session_slot: String(ts.session_slot ?? "morning"),
      start_at: ts.start_at,
    })
  }
}

async function completeTradeSessionBotRow(
  admin: SupabaseClient,
  row: {
    id: string
    userId: string
    stakeUsd: number
    tradeSessionId: string
    participationWeight: number
    sessionStartAt: string
    sessionEndAt: string
    sessionSlot: string
    forceFullParticipation?: boolean
  },
): Promise<{ profitUsd: number } | null> {
  const now = new Date().toISOString()
  const stake = roundUsd2(row.stakeUsd)
  const weight = row.forceFullParticipation
    ? 1
    : row.participationWeight > 0
      ? row.participationWeight
      : computeParticipationWeight({
          sessionStartAt: row.sessionStartAt,
          sessionEndAt: row.sessionEndAt,
          joinedAt: now,
        })

  const { profitUsd } = await settleTradeSessionParticipation(admin, {
    userId: row.userId,
    tradeSessionId: row.tradeSessionId,
    sessionStartAt: row.sessionStartAt,
    sessionSlot: row.sessionSlot,
    capitalUsd: stake,
    participationWeight: weight,
    forceFullParticipation: row.forceFullParticipation,
  })
  const totalCredit = roundUsd2(stake + profitUsd)

  const { error: uErr } = await admin
    .from("nexus_bot_sessions")
    .update({
      status: "completed",
      settled_at: now,
      display_phase: "profit_released",
      profit_released_usd: profitUsd,
      participation_weight: weight,
    })
    .eq("id", row.id)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
  if (uErr) return null

  if (totalCredit > 0) {
    await casCreditNexusMainOnly(admin, row.userId, totalCredit)
  }

  const historySummary = closedTradeHistorySummary(profitUsd)

  await recordFinancialEvent({
    userId: row.userId,
    eventType: "nexus_trade_session_complete",
    category: "container",
    amount: totalCredit,
    balanceSource: "nexus_bot_session",
    balanceDestination: "available_balance",
    status: "completed",
    actorType: "system",
    actorId: row.userId,
    relatedSessionId: row.id,
    summary: historySummary,
    metadata: {
      session_id: row.id,
      trade_session_id: row.tradeSessionId,
      profit_usd: profitUsd,
      stake_returned_usd: stake,
      participation_weight: weight,
      earnings_source: "monthly_reserve_v1",
      ...(row.forceFullParticipation ? { settlement_mode: "full_session_target" } : {}),
    },
  })

  await awardPerformancePoints(admin, {
    userId: row.userId,
    ruleKey: "session_complete",
    idempotencyKey: `session_complete:${row.userId}:${row.tradeSessionId}`,
    reason: "Completed a trade session",
    source: "trade_session",
    sessionReference: row.tradeSessionId,
  })
  await incrementCompletedSessions(admin, row.userId)
  return { profitUsd: profitUsd }
}

export async function activateTradeSessionBot(
  admin: SupabaseClient,
  params: {
    userId: string
    verificationId: string
    code: string
    stakeUsd: number
    confirmed: boolean
  },
): Promise<{
  sessionId: string
  endsAt: string
  startAt: string
  status: string
  phaseKey: TradeSessionPhaseKey
  participationWeight: number
  available_balance: number
}> {
  if (!params.confirmed) throw new Error("CONFIRMATION_REQUIRED")
  const stake = roundUsd2(params.stakeUsd)
  if (!(stake > 0)) throw new Error("INVALID_STAKE")

  const verified = await consumeTradeSessionVerification(
    admin,
    params.userId,
    params.verificationId,
    params.code,
  )

  const tradeSession = await findActiveTradeSessionByCode(admin, verified.code)
  if (!tradeSession || tradeSession.id !== verified.tradeSessionId) {
    throw new Error("CODE_INVALID_OR_EXPIRED")
  }

  const now = new Date()
  const endMs = new Date(tradeSession.endAt).getTime()
  if (endMs <= now.getTime()) throw new Error("SESSION_EXPIRED")

  const { data: existing } = await admin
    .from("nexus_bot_sessions")
    .select("id")
    .eq("user_id", params.userId)
    .eq("trade_session_id", tradeSession.id)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
    .maybeSingle()
  if (existing) throw new Error("SESSION_ALREADY_JOINED")

  const { data: otherActive } = await admin
    .from("nexus_bot_sessions")
    .select("id")
    .eq("user_id", params.userId)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
    .limit(1)
  if ((otherActive ?? []).length > 0) throw new Error("BOT_SESSION_ALREADY_ACTIVE")

  const reserved = await casReserveCopyTradeStake(admin, params.userId, stake)
  if (!reserved.ok) throw new Error("INSUFFICIENT_BALANCE")

  const queuedAt = now.toISOString()
  const startMs = new Date(tradeSession.startAt).getTime()
  const initialStatus = now.getTime() < startMs ? "booked" : "running"
  const participationWeight = computeParticipationWeight({
    sessionStartAt: tradeSession.startAt,
    sessionEndAt: tradeSession.endAt,
    joinedAt: queuedAt,
  })
  const phaseKey: TradeSessionPhaseKey =
    initialStatus === "booked"
      ? "booked"
      : resolveTradeSessionPhaseKey({
          status: "running",
          startAt: tradeSession.startAt,
          endAt: tradeSession.endAt,
          now,
        })

  const { data: ins, error: insErr } = await admin
    .from("nexus_bot_sessions")
    .insert({
      user_id: params.userId,
      session_kind: "signal",
      trade_session_id: tradeSession.id,
      stake_usd: stake,
      status: initialStatus,
      strategy_title: "Trade Session",
      confidence: "High",
      ends_at: tradeSession.endAt,
      display_phase: phaseKey,
      code_verified_at: verified.verifiedAt,
      queued_at: queuedAt,
      user_confirmed_at: queuedAt,
      participation_weight: participationWeight,
      metadata: {
        stake_reserved_usd: stake,
        trade_code: tradeSession.code,
        verification_id: params.verificationId,
        scheduled_start_at: tradeSession.startAt,
        scheduled_end_at: tradeSession.endAt,
        activated_at: queuedAt,
      },
    })
    .select("id")
    .single()
  if (insErr) {
    await casCreditNexusMainOnly(admin, params.userId, stake)
    if (insErr.code === "23505") throw new Error("SESSION_ALREADY_JOINED")
    throw new Error(insErr.message)
  }

  await ensureUserTradeSessionReserve(admin, params.userId, stake, new Date(tradeSession.startAt))

  await recordFinancialEvent({
    userId: params.userId,
    eventType: "nexus_trade_session_open",
    category: "container",
    amount: stake,
    balanceSource: "available_balance",
    balanceDestination: "nexus_bot_session",
    status: "pending",
    actorType: "user",
    actorId: params.userId,
    relatedSessionId: String(ins.id),
    summary: "Trade booked successfully — capital reserved until session completes.",
    metadata: {
      trade_session_id: tradeSession.id,
      session_id: ins.id,
      participation_weight: participationWeight,
      queued_at: queuedAt,
      code_verified_at: verified.verifiedAt,
    },
  })

  await awardPerformancePoints(admin, {
    userId: params.userId,
    ruleKey: "session_join",
    idempotencyKey: `session_join:${params.userId}:${tradeSession.id}`,
    reason: "Joined a valid trade session",
    source: "trade_session",
    sessionReference: tradeSession.id,
  })

  return {
    sessionId: String(ins.id),
    endsAt: tradeSession.endAt,
    startAt: tradeSession.startAt,
    status: initialStatus,
    phaseKey,
    participationWeight,
    available_balance: reserved.available_balance,
  }
}

export async function findPendingProfitCelebration(
  admin: SupabaseClient,
  userId: string,
): Promise<{ sessionId: string; profitUsd: number; summary: string } | null> {
  const { data } = await admin
    .from("nexus_bot_sessions")
    .select("id,profit_released_usd,profit_celebrated_at,settled_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("trade_session_id", "is", null)
    .is("profit_celebrated_at", null)
    .gt("profit_released_usd", 0)
    .order("settled_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const profitUsd = roundUsd2(Number(data.profit_released_usd ?? 0))
  if (!(profitUsd > 0)) return null
  return {
    sessionId: String(data.id),
    profitUsd,
    summary: closedTradeHistorySummary(profitUsd),
  }
}

export async function acknowledgeProfitCelebration(
  admin: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await admin
    .from("nexus_bot_sessions")
    .update({ profit_celebrated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "completed")
  if (error) throw new Error(error.message)
}

/** Admin-only: close session code early; all participants settled at full session weight. */
export async function terminateTradeSessionByAdmin(
  admin: SupabaseClient,
  params: { tradeSessionId: string; actorId: string },
): Promise<{
  tradeSessionId: string
  code: string
  participantsSettled: number
  totalProfitUsd: number
  totalStakeUsd: number
}> {
  const { data: ts, error: tsErr } = await admin
    .from("trade_sessions")
    .select("id,code,status,start_at,end_at,session_slot")
    .eq("id", params.tradeSessionId)
    .maybeSingle()
  if (tsErr) throw new Error(tsErr.message)
  if (!ts || String(ts.status) !== "active") throw new Error("SESSION_NOT_ACTIVE")

  const now = new Date().toISOString()
  const { data: rows, error: rowsErr } = await admin
    .from("nexus_bot_sessions")
    .select("id,user_id,stake_usd,participation_weight")
    .eq("trade_session_id", params.tradeSessionId)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
  if (rowsErr) throw new Error(rowsErr.message)

  let participantsSettled = 0
  let totalProfitUsd = 0
  let totalStakeUsd = 0

  for (const row of rows ?? []) {
    const result = await completeTradeSessionBotRow(admin, {
      id: String(row.id),
      userId: String(row.user_id),
      stakeUsd: Number(row.stake_usd ?? 0),
      tradeSessionId: params.tradeSessionId,
      participationWeight: Number(row.participation_weight ?? 1),
      sessionStartAt: String(ts.start_at),
      sessionEndAt: String(ts.end_at),
      sessionSlot: String(ts.session_slot ?? "morning"),
      forceFullParticipation: true,
    })
    if (result) {
      participantsSettled += 1
      totalProfitUsd += result.profitUsd
      totalStakeUsd += roundUsd2(Number(row.stake_usd ?? 0))
    }
  }

  const { error: expireErr } = await admin
    .from("trade_sessions")
    .update({
      status: "expired",
      expired_at: now,
      admin_terminated_at: now,
      admin_terminated_by: params.actorId,
    })
    .eq("id", params.tradeSessionId)
    .eq("status", "active")
  if (expireErr) throw new Error(expireErr.message)

  await admin
    .from("trade_session_verifications")
    .update({ consumed_at: now })
    .eq("trade_session_id", params.tradeSessionId)
    .is("consumed_at", null)

  await processTradeSessionForfeitures(admin, {
    id: params.tradeSessionId,
    session_slot: String(ts.session_slot ?? "morning"),
    start_at: String(ts.start_at),
  })

  return {
    tradeSessionId: params.tradeSessionId,
    code: String(ts.code),
    participantsSettled,
    totalProfitUsd: roundUsd2(totalProfitUsd),
    totalStakeUsd: roundUsd2(totalStakeUsd),
  }
}

export async function getTradeSessionParticipantCounts(
  admin: SupabaseClient,
  tradeSessionIds: string[],
): Promise<Record<string, { active: number; completed: number }>> {
  if (tradeSessionIds.length === 0) return {}
  const { data, error } = await admin
    .from("nexus_bot_sessions")
    .select("trade_session_id,status")
    .in("trade_session_id", tradeSessionIds)
  if (error) throw new Error(error.message)
  const out: Record<string, { active: number; completed: number }> = {}
  for (const id of tradeSessionIds) out[id] = { active: 0, completed: 0 }
  for (const r of data ?? []) {
    const id = String(r.trade_session_id)
    if (!out[id]) out[id] = { active: 0, completed: 0 }
    const st = String(r.status)
    if (["booked", "ready", "pending", "running", "active"].includes(st)) out[id].active += 1
    if (st === "completed") out[id].completed += 1
  }
  return out
}

export async function activateNexusBotSession(
  admin: SupabaseClient,
  params: {
    userId: string
    sessionKind: "signal" | "auto"
    stakeUsd: number
    planKey?: string | null
    signalCodeId?: string | null
    strategyTitle: string
    confidence?: string
    durationHours: number
  },
): Promise<{ sessionId: string; endsAt: string; available_balance: number }> {
  const stake = roundUsd2(params.stakeUsd)
  if (!(stake > 0)) throw new Error("INVALID_STAKE")

  const { data: active } = await admin
    .from("nexus_bot_sessions")
    .select("id")
    .eq("user_id", params.userId)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
    .limit(1)
  if ((active ?? []).length > 0) throw new Error("BOT_SESSION_ALREADY_ACTIVE")

  if (params.sessionKind === "auto") {
    const pk = params.planKey ?? ""
    if (!isNexusAutoTradePlanKey(pk)) throw new Error("INVALID_AUTO_PLAN")
    const grants = await getAutoTradeGrantsMap(admin, params.userId)
    if (!grants[pk]) throw new Error("AUTO_TRADE_NOT_GRANTED")
  }

  const reserved = await casReserveCopyTradeStake(admin, params.userId, stake)
  if (!reserved.ok) throw new Error("INSUFFICIENT_BALANCE")

  const endsAt = new Date(Date.now() + params.durationHours * 3_600_000).toISOString()
  const { data: ins, error: insErr } = await admin
    .from("nexus_bot_sessions")
    .insert({
      user_id: params.userId,
      session_kind: params.sessionKind,
      plan_key: params.planKey ?? null,
      signal_code_id: params.signalCodeId ?? null,
      stake_usd: stake,
      status: "active",
      strategy_title: params.strategyTitle,
      confidence: params.confidence ?? "High",
      ends_at: endsAt,
      metadata: { stake_reserved_usd: stake },
    })
    .select("id")
    .single()
  if (insErr) {
    await casCreditNexusMainOnly(admin, params.userId, stake)
    throw new Error(insErr.message)
  }

  await recordFinancialEvent({
    userId: params.userId,
    eventType: params.sessionKind === "auto" ? "nexus_auto_trade_open" : "nexus_signal_session_open",
    category: "container",
    amount: stake,
    balanceSource: "available_balance",
    balanceDestination: "nexus_bot_session",
    status: "pending",
    actorType: "user",
    actorId: params.userId,
    summary:
      params.sessionKind === "auto"
        ? "Auto Trade session activated."
        : "Nexus signal session activated.",
    metadata: { plan_key: params.planKey, signal_code_id: params.signalCodeId },
  })

  return {
    sessionId: String(ins.id),
    endsAt,
    available_balance: reserved.available_balance,
  }
}

export async function completeDueNexusBotSessions(
  admin: SupabaseClient,
  userId?: string,
): Promise<number> {
  await syncTradeSessionBotStates(admin, userId)

  const now = new Date().toISOString()
  let q = admin
    .from("nexus_bot_sessions")
    .select("id,user_id,stake_usd,status,trade_session_id")
    .eq("status", "active")
    .is("trade_session_id", null)
    .lte("ends_at", now)
  if (userId) q = q.eq("user_id", userId)
  const { data, error } = await q.limit(200)
  if (error) throw new Error(error.message)

  let n = 0
  for (const row of data ?? []) {
    const stake = roundUsd2(Number(row.stake_usd ?? 0))
    const uid = String(row.user_id)
    const { error: uErr } = await admin
      .from("nexus_bot_sessions")
      .update({ status: "completed", settled_at: now })
      .eq("id", row.id)
      .eq("status", "active")
    if (uErr) continue
    if (stake > 0) await casCreditNexusMainOnly(admin, uid, stake)
    await recordFinancialEvent({
      userId: uid,
      eventType: "nexus_bot_session_complete",
      category: "container",
      amount: stake,
      balanceSource: "nexus_bot_session",
      balanceDestination: "available_balance",
      status: "completed",
      actorType: "system",
      actorId: uid,
      summary: "Nexus Bot session ended — reserved stake returned to Nexus Main.",
      metadata: { session_id: row.id },
    })
    n += 1
  }
  return n
}
