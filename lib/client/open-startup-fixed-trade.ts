import { refreshLiveBalanceBeforeAction } from "@/lib/client/refresh-live-balance"
import { readJsonSafe } from "@/lib/client/mutation-api-feedback"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

export type OpenStartupFixedTradeParams = {
  commitUsd: number
  traderPersonaId: string
  fixPeriodMonths?: 1 | 3 | 6
  riskClass?: "Low" | "Medium" | "High"
}

export type OpenStartupFixedTradeResult =
  | { ok: true; sessionId?: string }
  | { ok: false; error: string }

export async function openStartupFixedTrade(
  params: OpenStartupFixedTradeParams,
): Promise<OpenStartupFixedTradeResult> {
  const grossCommitUsd = roundUsd2(params.commitUsd)
  if (!(grossCommitUsd > 0)) {
    return { ok: false, error: "Invalid allocation amount." }
  }

  const refreshed = await refreshLiveBalanceBeforeAction()
  if (!refreshed.ok) return { ok: false, error: refreshed.error }

  if (grossCommitUsd > refreshed.balance.available_balance) {
    return { ok: false, error: "Insufficient Nexus Main balance for this allocation." }
  }

  const res = await fetch("/api/user/fixed-trade/open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshed.token}`,
    },
    body: JSON.stringify({
      commitUsd: grossCommitUsd,
      principalUsd: grossCommitUsd,
      riskClass: params.riskClass ?? "Low",
      fixPeriodMonths: params.fixPeriodMonths ?? 1,
      traderPersonaId: params.traderPersonaId,
    }),
  })

  const out = (await readJsonSafe(res)) as { success?: boolean; error?: string; sessionId?: string }
  if (!res.ok || out?.success === false) {
    const msg =
      typeof out?.error === "string" && out.error.length > 0
        ? out.error
        : "Could not open fixed trade. Try again from Container Mode."
    return { ok: false, error: msg }
  }

  return { ok: true, sessionId: out.sessionId }
}

export { toastMutationError }