import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { settleCopyTradeSessionForUser } from "@/lib/server/copy-trade-settle"
import { settleFixedTradeEarlyExitForUser } from "@/lib/server/fixed-trade-early-exit-settle"
import { recordFinancialEvent } from "@/lib/server/financial-events"

export type LegacyReleaseSummary = {
  copySessionsClosed: number
  fixedSessionsClosed: number
  liquidTransferredUsd: number
  errors: string[]
}

/**
 * Close all active copy/fixed container sessions and move container liquid earnings to Nexus Main.
 * Uses existing settlement RPCs — never raw balance bumps.
 */
export async function releaseLegacyContainerSessionsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<LegacyReleaseSummary> {
  const errors: string[] = []
  let copySessionsClosed = 0
  let fixedSessionsClosed = 0
  let liquidTransferredUsd = 0

  const { data: copies, error: cErr } = await admin
    .from("copy_trade_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
  if (cErr) throw new Error(cErr.message)

  for (const row of copies ?? []) {
    try {
      await settleCopyTradeSessionForUser(admin, {
        userId,
        sessionId: String(row.id),
        floatingPnLUsd: 0,
        coinImpactFraction: 0,
        kind: "force",
        financialActorType: "system",
      })
      copySessionsClosed += 1
    } catch (e) {
      errors.push(`copy:${row.id}:${e instanceof Error ? e.message : "error"}`)
    }
  }

  const { data: fixes, error: fErr } = await admin
    .from("fixed_trade_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
  if (fErr) throw new Error(fErr.message)

  for (const row of fixes ?? []) {
    try {
      await settleFixedTradeEarlyExitForUser(admin, { userId, sessionId: String(row.id) })
      fixedSessionsClosed += 1
    } catch (e) {
      errors.push(`fix:${row.id}:${e instanceof Error ? e.message : "error"}`)
    }
  }

  const { data: bal, error: bErr } = await admin
    .from("user_balances")
    .select("available_balance, container_withdrawable_earnings")
    .eq("user_id", userId)
    .maybeSingle()
  if (bErr) throw new Error(bErr.message)

  const withdrawable = roundUsd2(Number(bal?.container_withdrawable_earnings ?? 0))
  if (withdrawable > 0 && bal) {
    const available = roundUsd2(Number(bal.available_balance ?? 0))
    const nextAvailable = roundUsd2(available + withdrawable)
    const { error: uErr } = await admin
      .from("user_balances")
      .update({
        available_balance: nextAvailable,
        container_withdrawable_earnings: 0,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", userId)
    if (uErr) throw new Error(uErr.message)
    liquidTransferredUsd = withdrawable
    await recordFinancialEvent({
      userId,
      eventType: "withdrawable_to_main",
      category: "internal_transfer",
      amount: withdrawable,
      feeAmount: 0,
      balanceSource: "container_withdrawable_earnings",
      balanceDestination: "available_balance",
      status: "completed",
      actorType: "system",
      actorId: userId,
      summary: "Legacy container liquid released during Nexus Bot migration.",
      metadata: { migration: "nexus_bot_v1" },
    })
  }

  return { copySessionsClosed, fixedSessionsClosed, liquidTransferredUsd, errors }
}
