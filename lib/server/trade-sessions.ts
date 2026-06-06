import type { SupabaseClient } from "@supabase/supabase-js"
import { computeTradeSessionSettlementMonitoring } from "@/lib/server/trade-session-settlement-monitoring"
import {
  generateTradeCodeCandidate,
  isValidTradeCodeFormat,
  normalizeTradeCode,
} from "@/lib/nexus-bot/trade-code"
import {
  resolveMatrixYieldPercent,
  TRADE_SESSION_YIELD_MATRIX_SOURCE,
  yieldMatrixDayIndex,
} from "@/lib/nexus-bot/trade-session-yield-matrix"
import {
  buildYieldSessionPreview,
  validateMaxYieldPercent,
  YIELD_DISTRIBUTION_LINEAR,
} from "@/lib/server/time-weighted-yield-engine"

export type RegisteredTradeSession = {
  sessionId: string
  code: string
  sessionName: string
  sessionSlot: string
  startAt: string
  endAt: string
  status: "draft" | "active"
  displayLabel: string
  maxYieldPercent: number
  yieldDistributionMode: string
}

function parseRequiredInstant(raw: string, field: string): Date {
  const d = new Date(String(raw ?? "").trim())
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`INVALID_${field.toUpperCase()}`)
  }
  return d
}

export async function generateTradeCodes(
  admin: SupabaseClient,
  actorId: string,
  count = 3,
): Promise<string[]> {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = normalizeTradeCode(generateTradeCodeCandidate())
      const { error } = await admin.from("trade_code_generations").insert({
        code,
        generated_by: actorId,
      })
      if (!error) {
        out.push(code)
        break
      }
      if (error.code !== "23505") throw new Error(error.message)
    }
  }
  return out
}

export async function registerTradeSession(
  admin: SupabaseClient,
  params: {
    actorId: string
    code: string
    sessionName: string
    sessionSlot: string
    startAt: string
    endAt: string
    status: "draft" | "active"
    displayLabel?: string
  },
): Promise<RegisteredTradeSession> {
  const code = normalizeTradeCode(params.code)
  if (!isValidTradeCodeFormat(code)) throw new Error("CODE_FORMAT_INVALID")

  const sessionName = params.sessionName.trim()
  if (!sessionName) throw new Error("SESSION_NAME_REQUIRED")

  const sessionSlot = params.sessionSlot.trim() || "morning"
  const start = parseRequiredInstant(params.startAt, "start_at")
  const end = parseRequiredInstant(params.endAt, "end_at")
  if (!(end.getTime() > start.getTime())) throw new Error("INVALID_TIME_WINDOW")

  const { data: gen, error: genErr } = await admin
    .from("trade_code_generations")
    .select("id,trade_session_id")
    .eq("code", code)
    .maybeSingle()
  if (genErr) throw new Error(genErr.message)
  if (!gen) throw new Error("CODE_NOT_GENERATED")
  if (gen.trade_session_id) throw new Error("CODE_ALREADY_REGISTERED")

  const displayLabel = params.displayLabel?.trim() || sessionName
  const maxYieldPercent = validateMaxYieldPercent(
    resolveMatrixYieldPercent(start, sessionSlot),
  )

  const { data: session, error: sErr } = await admin
    .from("trade_sessions")
    .insert({
      code,
      session_name: sessionName,
      session_slot: sessionSlot,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: params.status,
      display_label: displayLabel,
      registered_by: params.actorId,
      max_yield_percent: maxYieldPercent,
      yield_distribution_mode: YIELD_DISTRIBUTION_LINEAR,
      profit_mode: "fixed",
      profit_percentage: maxYieldPercent,
    })
    .select(
      "id,code,session_name,session_slot,start_at,end_at,status,display_label,max_yield_percent,yield_distribution_mode",
    )
    .single()
  if (sErr) {
    if (sErr.code === "23505") throw new Error("CODE_ALREADY_REGISTERED")
    throw new Error(sErr.message)
  }

  const { data: linked, error: gErr } = await admin
    .from("trade_code_generations")
    .update({ trade_session_id: session.id })
    .eq("id", gen.id)
    .is("trade_session_id", null)
    .select("id")
    .maybeSingle()
  if (gErr) throw new Error(gErr.message)
  if (!linked) {
    await admin.from("trade_sessions").delete().eq("id", session.id)
    throw new Error("CODE_ALREADY_REGISTERED")
  }

  return {
    sessionId: String(session.id),
    code: String(session.code),
    sessionName: String(session.session_name),
    sessionSlot: String(session.session_slot),
    startAt: String(session.start_at),
    endAt: String(session.end_at),
    status: params.status,
    displayLabel: String(session.display_label ?? sessionName),
    maxYieldPercent: Number(session.max_yield_percent ?? maxYieldPercent),
    yieldDistributionMode: String(session.yield_distribution_mode ?? YIELD_DISTRIBUTION_LINEAR),
  }
}

export function previewRegisteredTradeSessionYield(
  startAt: string,
  endAt: string,
  sessionSlot: string,
) {
  const maxYieldPercent = resolveMatrixYieldPercent(new Date(startAt), sessionSlot)
  return {
    matrixDayIndex: yieldMatrixDayIndex(new Date(startAt)),
    matrixSource: TRADE_SESSION_YIELD_MATRIX_SOURCE,
    maxYieldPercent,
    ...buildYieldSessionPreview(new Date(startAt), new Date(endAt), maxYieldPercent),
  }
}

export async function findActiveTradeSessionByCode(
  admin: SupabaseClient,
  codeRaw: string,
  now = new Date(),
): Promise<{
  id: string
  code: string
  sessionName: string
  displayLabel: string
  sessionSlot: string
  startAt: string
  endAt: string
  status: string
  maxYieldPercent: number | null
} | null> {
  const code = normalizeTradeCode(codeRaw)
  const { data, error } = await admin
    .from("trade_sessions")
    .select("id,code,session_name,display_label,session_slot,start_at,end_at,status,max_yield_percent,yield_distribution_mode")
    .eq("code", code)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.status !== "active") return null
  const end = new Date(String(data.end_at))
  if (end.getTime() <= now.getTime()) return null
  const maxYield = data.max_yield_percent != null ? Number(data.max_yield_percent) : null
  if (!(maxYield != null && maxYield > 0)) return null
  return {
    id: String(data.id),
    code: String(data.code),
    sessionName: String(data.session_name),
    displayLabel: String(data.display_label ?? data.session_name),
    sessionSlot: String(data.session_slot),
    startAt: String(data.start_at),
    endAt: String(data.end_at),
    status: String(data.status),
    maxYieldPercent: maxYield,
  }
}

export async function getTradeSessionByCode(
  admin: SupabaseClient,
  codeRaw: string,
): Promise<RegisteredTradeSession | null> {
  const code = normalizeTradeCode(codeRaw)
  const { data, error } = await admin
    .from("trade_sessions")
    .select("id,code,session_name,session_slot,start_at,end_at,status,display_label,max_yield_percent,yield_distribution_mode")
    .eq("code", code)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    sessionId: String(data.id),
    code: String(data.code),
    sessionName: String(data.session_name),
    sessionSlot: String(data.session_slot),
    startAt: String(data.start_at),
    endAt: String(data.end_at),
    status: data.status === "draft" ? "draft" : data.status === "active" ? "active" : "draft",
    displayLabel: String(data.display_label ?? data.session_name),
    maxYieldPercent: Number(data.max_yield_percent ?? 0),
    yieldDistributionMode: String(data.yield_distribution_mode ?? YIELD_DISTRIBUTION_LINEAR),
  }
}

export async function expireDueTradeSessions(admin: SupabaseClient): Promise<number> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("trade_sessions")
    .select("id,session_slot,start_at")
    .eq("status", "active")
    .lt("end_at", now)
  if (error) throw new Error(error.message)
  let n = 0
  for (const row of data ?? []) {
    const { error: uErr } = await admin
      .from("trade_sessions")
      .update({ status: "expired", expired_at: now })
      .eq("id", row.id)
      .eq("status", "active")
    if (!uErr) {
      n += 1
    }
  }
  return n
}

export async function getTradeSessionAdminStats(admin: SupabaseClient) {
  const [
    gens,
    sessions,
    participants,
    activeBot,
    botExpired,
    botCompleted,
    botOpen,
    pendingCelebrations,
    openBotRows,
    reconcileEvents,
  ] = await Promise.all([
    admin.from("trade_code_generations").select("id", { count: "exact", head: true }),
    admin.from("trade_sessions").select("id,status", { count: "exact" }),
    admin
      .from("nexus_bot_sessions")
      .select("stake_usd,profit_released_usd,status")
      .not("trade_session_id", "is", null),
    admin.from("trade_sessions").select("id").eq("status", "active"),
    admin
      .from("nexus_bot_sessions")
      .select("id", { count: "exact", head: true })
      .not("trade_session_id", "is", null)
      .eq("status", "expired"),
    admin
      .from("nexus_bot_sessions")
      .select("id", { count: "exact", head: true })
      .not("trade_session_id", "is", null)
      .eq("status", "completed"),
    admin
      .from("nexus_bot_sessions")
      .select("id", { count: "exact", head: true })
      .not("trade_session_id", "is", null)
      .in("status", ["booked", "ready", "pending", "running", "active"]),
    admin
      .from("nexus_bot_sessions")
      .select("id", { count: "exact", head: true })
      .not("trade_session_id", "is", null)
      .eq("status", "completed")
      .is("profit_celebrated_at", null),
    admin
      .from("nexus_bot_sessions")
      .select("id,trade_sessions(end_at)")
      .not("trade_session_id", "is", null)
      .in("status", ["booked", "ready", "pending", "running", "active"])
      .limit(500),
    admin
      .from("container_balance_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "nexus_trade_session_reconcile_topup"),
  ])

  let totalStake = 0
  let totalProfit = 0
  let participantCount = 0
  for (const r of participants.data ?? []) {
    if (["booked", "pending", "running", "active", "completed"].includes(String(r.status))) {
      participantCount += 1
      totalStake += Number(r.stake_usd ?? 0)
      totalProfit += Number(r.profit_released_usd ?? 0)
    }
  }

  const expired =
    sessions.data?.filter((s) => String(s.status) === "expired").length ?? 0
  const active = activeBot.data?.length ?? 0
  const nowMs = Date.now()
  let failedSettlementsStuckOpen = 0
  for (const row of openBotRows.data ?? []) {
    const ts = row.trade_sessions as { end_at?: string } | null
    const endMs = ts?.end_at ? new Date(ts.end_at).getTime() : NaN
    if (Number.isFinite(endMs) && endMs < nowMs) failedSettlementsStuckOpen += 1
  }

  const strandedMonitoring = await computeTradeSessionSettlementMonitoring(admin)

  return {
    generatedCodes: gens.count ?? 0,
    registeredSessions: sessions.count ?? 0,
    activeSessions: active,
    expiredSessions: expired,
    participants: participantCount,
    totalCapitalAllocatedUsd: Math.round(totalStake * 100) / 100,
    totalReleasedProfitUsd: Math.round(totalProfit * 100) / 100,
    settlementMonitoring: {
      activeBotParticipants: botOpen.count ?? 0,
      settledBotParticipants: botCompleted.count ?? 0,
      expiredBotParticipants: botExpired.count ?? 0,
      pendingCelebrations: pendingCelebrations.count ?? 0,
      failedSettlementsStuckOpen,
      reconciliationTopUpEvents: reconcileEvents.count ?? 0,
      ...strandedMonitoring,
    },
  }
}

export function humanizeTradeSessionError(code: string): string {
  switch (code) {
    case "CODE_NOT_GENERATED":
      return "Generate this code in admin history first, then register it here."
    case "CODE_ALREADY_REGISTERED":
      return "This code is already registered and cannot be reused."
    case "CODE_FORMAT_INVALID":
      return "Code must match NXP-XXXX-XXXX (generate one above)."
    case "SESSION_NAME_REQUIRED":
      return "Enter a session name before registering."
    case "INVALID_TIME_WINDOW":
      return "End time must be after start time."
    case "INVALID_START_AT":
    case "INVALID_END_AT":
      return "Set valid start and end times before registering."
    case "PROFIT_PERCENTAGE_INVALID":
      return "Enter a fixed profit percentage between 0.01 and 100."
    case "PROFIT_RANGE_INVALID":
      return "Enter a valid profit range (min ≤ max, both between 0.01 and 100)."
    case "PROFIT_PERCENTAGE_NOT_CONFIGURED":
      return "This trade session has no profit percentage configured."
    case "PROFIT_RANGE_NOT_CONFIGURED":
      return "This trade session has no profit range configured."
    case "MAX_YIELD_PERCENT_INVALID":
      return "Enter max yield between 0.01 and 100 (%)."
    case "PARTICIPANT_YIELD_RECORD_MISSING":
      return "Participant yield record missing — settlement requires stored expected profit."
    case "LEGACY_EARNINGS_DISABLED":
      return "Legacy earnings system disabled. Sessions use the static 30-day yield matrix only."
    case "MAX_YIELD_NOT_CONFIGURED":
      return "This session has no matrix yield configured. Re-register the session."
    default:
      return code
  }
}
