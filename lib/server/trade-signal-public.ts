import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildTradeSignalPublicView,
  tradeSignalFailureCopy,
  type TradeSignalPublicState,
  type TradeSignalPublicView,
} from "@/lib/nexus-bot/trade-signal-share"
import { isValidTradeCodeFormat, normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import {
  diagnoseTradeSessionCode,
  expireDueTradeSessions,
  type TradeSessionCodeFailure,
} from "@/lib/server/trade-sessions"
import { getPublicSiteOrigin } from "@/lib/site-public-url"

function failureToPublicState(reason: TradeSessionCodeFailure): TradeSignalPublicState {
  if (reason === "expired") return "expired"
  if (reason === "terminated" || reason === "no_yield_config") return "unavailable"
  return "unregistered"
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
    const copy = tradeSignalFailureCopy("invalid_format")
    return buildTradeSignalPublicView({
      codeRaw: code,
      state: "unregistered",
      origin,
      headline: copy.headline,
      detail: copy.detail,
    })
  }

  const diagnosis = await diagnoseTradeSessionCode(admin, code)
  if (!diagnosis.ok) {
    const copy = tradeSignalFailureCopy(diagnosis.reason)
    return buildTradeSignalPublicView({
      codeRaw: code,
      state: failureToPublicState(diagnosis.reason),
      origin,
      headline: copy.headline,
      detail: copy.detail,
    })
  }

  return buildTradeSignalPublicView({
    codeRaw: code,
    state: "active",
    sessionSlot: diagnosis.session.sessionSlot,
    origin,
  })
}
