import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildTradeSignalPublicView,
  type TradeSignalPublicState,
  type TradeSignalPublicView,
} from "@/lib/nexus-bot/trade-signal-share"
import { isValidTradeCodeFormat, normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import { expireDueTradeSessions } from "@/lib/server/trade-sessions"
import { getPublicSiteOrigin } from "@/lib/site-public-url"

function resolveState(row: {
  status: string
  end_at: string
  admin_terminated_at?: string | null
}): TradeSignalPublicState {
  if (row.admin_terminated_at) return "unavailable"
  const status = String(row.status)
  const endMs = new Date(String(row.end_at)).getTime()
  if (status === "expired" || endMs <= Date.now()) return "expired"
  if (status !== "active") return "unregistered"
  return "active"
}

export async function resolvePublicTradeSignal(
  admin: SupabaseClient,
  codeRaw: string,
  requestUrl?: string,
): Promise<TradeSignalPublicView> {
  await expireDueTradeSessions(admin)

  const code = normalizeTradeCode(codeRaw)
  const origin = getPublicSiteOrigin(requestUrl)

  if (!isValidTradeCodeFormat(code)) {
    return buildTradeSignalPublicView({ codeRaw: code, state: "unregistered", origin })
  }

  const { data, error } = await admin
    .from("trade_sessions")
    .select("code,session_slot,status,end_at,admin_terminated_at")
    .eq("code", code)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (!data) {
    return buildTradeSignalPublicView({ codeRaw: code, state: "unregistered", origin })
  }

  const state = resolveState({
    status: String(data.status),
    end_at: String(data.end_at),
    admin_terminated_at: data.admin_terminated_at,
  })

  return buildTradeSignalPublicView({
    codeRaw: code,
    state,
    sessionSlot: String(data.session_slot ?? ""),
    origin,
  })
}
