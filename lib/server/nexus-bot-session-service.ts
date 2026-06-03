import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { USER_SESSION_PHASES, type UserSessionPhase } from "@/lib/nexus-bot/trade-code"
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
import { findActiveTradeSessionByCode } from "@/lib/server/trade-sessions"

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic session profit — never shown to users as a formula. */
export function tradeSessionProfitUsd(sessionId: string, stakeUsd: number): number {
  const h = hashSeed(sessionId)
  const rate = 0.025 + (h % 31) / 1000
  return roundUsd2(stakeUsd * rate)
}

export function resolveUserDisplayPhase(params: {
  status: string
  startAt: string
  endAt: string
  displayPhase?: string | null
  now?: Date
}): UserSessionPhase {
  if (params.displayPhase && USER_SESSION_PHASES.includes(params.displayPhase as UserSessionPhase)) {
    return params.displayPhase as UserSessionPhase
  }
  const now = params.now ?? new Date()
  const start = new Date(params.startAt).getTime()
  const end = new Date(params.endAt).getTime()
  const t = now.getTime()
  if (params.status === "completed") return "Trade completed"
  if (params.status === "expired") return "Waiting for session"
  if (t < start) return "Waiting for session"
  if (t >= end) return "Capturing profit"
  const progress = (t - start) / Math.max(1, end - start)
  if (progress < 0.15) return "Analyzing market"
  if (progress < 0.3) return "Preparing entry"
  if (progress < 0.45) return "Trade active"
  if (progress < 0.75) return "Managing position"
  return "Capturing profit"
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
    .select("id,user_id,status,trade_session_id,stake_usd,trade_sessions(start_at,end_at)")
    .not("trade_session_id", "is", null)
    .in("status", ["pending", "running", "active"])
  if (userId) q = q.eq("user_id", userId)
  const { data, error } = await q.limit(200)
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const ts = row.trade_sessions as { start_at?: string; end_at?: string } | null
    if (!ts?.start_at || !ts?.end_at) continue
    const startMs = new Date(ts.start_at).getTime()
    const endMs = new Date(ts.end_at).getTime()
    const t = now.getTime()
    const phase = resolveUserDisplayPhase({
      status: String(row.status),
      startAt: ts.start_at,
      endAt: ts.end_at,
      now,
    })

    if (t >= endMs) {
      await completeTradeSessionBotRow(admin, {
        id: String(row.id),
        userId: String(row.user_id),
        stakeUsd: Number(row.stake_usd ?? 0),
        tradeSessionId: String(row.trade_session_id),
      })
      continue
    }

    const nextStatus = t < startMs ? "pending" : "running"
    if (String(row.status) !== nextStatus || phase) {
      await admin
        .from("nexus_bot_sessions")
        .update({ status: nextStatus, display_phase: phase })
        .eq("id", row.id)
        .in("status", ["pending", "running", "active"])
    }
  }

  await admin
    .from("nexus_bot_sessions")
    .update({ status: "expired" })
    .not("trade_session_id", "is", null)
    .in("status", ["pending"])
    .lt("ends_at", nowIso)
}

async function completeTradeSessionBotRow(
  admin: SupabaseClient,
  row: { id: string; userId: string; stakeUsd: number; tradeSessionId: string },
): Promise<void> {
  const now = new Date().toISOString()
  const stake = roundUsd2(row.stakeUsd)
  const profit = tradeSessionProfitUsd(row.id, stake)
  const totalCredit = roundUsd2(stake + profit)

  const { error: uErr } = await admin
    .from("nexus_bot_sessions")
    .update({
      status: "completed",
      settled_at: now,
      display_phase: "Profit released",
      profit_released_usd: profit,
    })
    .eq("id", row.id)
    .in("status", ["pending", "running", "active"])
  if (uErr) return

  if (totalCredit > 0) {
    await casCreditNexusMainOnly(admin, row.userId, totalCredit)
  }

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
    summary: "Trade session completed — capital and profit released to Nexus Main.",
    metadata: { session_id: row.id, trade_session_id: row.tradeSessionId, profit_usd: profit },
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
}

export async function activateTradeSessionBot(
  admin: SupabaseClient,
  params: {
    userId: string
    code: string
    stakeUsd: number
    confirmed: boolean
  },
): Promise<{
  sessionId: string
  endsAt: string
  startAt: string
  displayPhase: UserSessionPhase
  available_balance: number
}> {
  if (!params.confirmed) throw new Error("CONFIRMATION_REQUIRED")
  const stake = roundUsd2(params.stakeUsd)
  if (!(stake > 0)) throw new Error("INVALID_STAKE")

  const tradeSession = await findActiveTradeSessionByCode(admin, params.code)
  if (!tradeSession) throw new Error("CODE_INVALID_OR_EXPIRED")

  const now = new Date()
  const endMs = new Date(tradeSession.endAt).getTime()
  if (endMs <= now.getTime()) throw new Error("SESSION_EXPIRED")

  const { data: existing } = await admin
    .from("nexus_bot_sessions")
    .select("id")
    .eq("user_id", params.userId)
    .eq("trade_session_id", tradeSession.id)
    .in("status", ["pending", "running", "active"])
    .maybeSingle()
  if (existing) throw new Error("SESSION_ALREADY_JOINED")

  const { data: otherActive } = await admin
    .from("nexus_bot_sessions")
    .select("id")
    .eq("user_id", params.userId)
    .in("status", ["pending", "running", "active"])
    .limit(1)
  if ((otherActive ?? []).length > 0) throw new Error("BOT_SESSION_ALREADY_ACTIVE")

  const reserved = await casReserveCopyTradeStake(admin, params.userId, stake)
  if (!reserved.ok) throw new Error("INSUFFICIENT_BALANCE")

  const startMs = new Date(tradeSession.startAt).getTime()
  const initialStatus = now.getTime() < startMs ? "pending" : "running"
  const displayPhase = resolveUserDisplayPhase({
    status: initialStatus,
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
      strategy_title: tradeSession.displayLabel,
      confidence: "High",
      ends_at: tradeSession.endAt,
      display_phase: displayPhase,
      user_confirmed_at: now.toISOString(),
      metadata: { stake_reserved_usd: stake, trade_code: tradeSession.code },
    })
    .select("id")
    .single()
  if (insErr) {
    await casCreditNexusMainOnly(admin, params.userId, stake)
    if (insErr.code === "23505") throw new Error("SESSION_ALREADY_JOINED")
    throw new Error(insErr.message)
  }

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
    summary: "Trade session activated — capital reserved for session period.",
    metadata: { trade_session_id: tradeSession.id, session_id: ins.id },
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
    displayPhase,
    available_balance: reserved.available_balance,
  }
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
    .in("status", ["pending", "running", "active"])
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
