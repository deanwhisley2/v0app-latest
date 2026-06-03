import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTradeCodeCandidate, normalizeTradeCode } from "@/lib/nexus-bot/trade-code"

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
): Promise<{ sessionId: string; code: string }> {
  const code = normalizeTradeCode(params.code)
  const { data: gen } = await admin
    .from("trade_code_generations")
    .select("id,trade_session_id")
    .eq("code", code)
    .maybeSingle()
  if (!gen) throw new Error("CODE_NOT_GENERATED")
  if (gen.trade_session_id) throw new Error("CODE_ALREADY_REGISTERED")

  const start = new Date(params.startAt)
  const end = new Date(params.endAt)
  if (!(end.getTime() > start.getTime())) throw new Error("INVALID_TIME_WINDOW")

  const { data: session, error: sErr } = await admin
    .from("trade_sessions")
    .insert({
      code,
      session_name: params.sessionName.trim(),
      session_slot: params.sessionSlot.trim() || "morning",
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: params.status,
      display_label: params.displayLabel?.trim() || params.sessionName.trim(),
      registered_by: params.actorId,
    })
    .select("id,code")
    .single()
  if (sErr) throw new Error(sErr.message)

  const { error: gErr } = await admin
    .from("trade_code_generations")
    .update({ trade_session_id: session.id })
    .eq("id", gen.id)
  if (gErr) throw new Error(gErr.message)

  return { sessionId: String(session.id), code: String(session.code) }
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
} | null> {
  const code = normalizeTradeCode(codeRaw)
  const { data, error } = await admin
    .from("trade_sessions")
    .select("id,code,session_name,display_label,session_slot,start_at,end_at,status")
    .eq("code", code)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.status !== "active") return null
  const end = new Date(String(data.end_at))
  if (end.getTime() <= now.getTime()) return null
  return {
    id: String(data.id),
    code: String(data.code),
    sessionName: String(data.session_name),
    displayLabel: String(data.display_label ?? data.session_name),
    sessionSlot: String(data.session_slot),
    startAt: String(data.start_at),
    endAt: String(data.end_at),
    status: String(data.status),
  }
}

export async function expireDueTradeSessions(admin: SupabaseClient): Promise<number> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("trade_sessions")
    .select("id")
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
    if (!uErr) n += 1
  }
  return n
}

export async function getTradeSessionAdminStats(admin: SupabaseClient) {
  const [gens, sessions, participants, activeBot] = await Promise.all([
    admin.from("trade_code_generations").select("id", { count: "exact", head: true }),
    admin.from("trade_sessions").select("id,status", { count: "exact" }),
    admin
      .from("nexus_bot_sessions")
      .select("stake_usd,profit_released_usd,status")
      .not("trade_session_id", "is", null),
    admin.from("trade_sessions").select("id").eq("status", "active"),
  ])

  let totalStake = 0
  let totalProfit = 0
  let participantCount = 0
  for (const r of participants.data ?? []) {
    if (["pending", "running", "active", "completed"].includes(String(r.status))) {
      participantCount += 1
      totalStake += Number(r.stake_usd ?? 0)
      totalProfit += Number(r.profit_released_usd ?? 0)
    }
  }

  const expired =
    sessions.data?.filter((s) => String(s.status) === "expired").length ?? 0
  const active = activeBot.data?.length ?? 0

  return {
    generatedCodes: gens.count ?? 0,
    registeredSessions: sessions.count ?? 0,
    activeSessions: active,
    expiredSessions: expired,
    participants: participantCount,
    totalCapitalAllocatedUsd: Math.round(totalStake * 100) / 100,
    totalReleasedProfitUsd: Math.round(totalProfit * 100) / 100,
  }
}
