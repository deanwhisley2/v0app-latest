import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  isNexusAutoTradePlanKey,
  normalizeSignalCode,
  planByKey,
  type NexusSignalSlot,
} from "@/lib/nexus-bot/plans"
import { casCreditNexusMainOnly, casReserveCopyTradeStake } from "@/lib/server/nexus-main-enforcement"
import { recordFinancialEvent } from "@/lib/server/financial-events"

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
    .eq("status", "active")
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
  const now = new Date().toISOString()
  let q = admin
    .from("nexus_bot_sessions")
    .select("id,user_id,stake_usd,status")
    .eq("status", "active")
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
