import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

/**
 * Attribute copy-trade settlement net: principal-like return to Nexus Main first,
 * residual modeled profit to container liquid (DB `container_withdrawable_earnings`).
 * Conservation: mainCredit + liquidCredit === netUsd (2dp).
 */
export function splitCopySettlementMainVsLiquid(netUsd: number, stakeUsd: number): {
  mainCredit: number
  liquidCredit: number
} {
  const net = roundUsd2(netUsd)
  const stake = roundUsd2(stakeUsd)
  const liquidCredit = roundUsd2(Math.max(0, net - stake))
  const mainCredit = roundUsd2(net - liquidCredit)
  return { mainCredit, liquidCredit }
}

export async function applyCopyTradeSettlementCredits(
  admin: SupabaseClient,
  userId: string,
  mainCredit: number,
  liquidCredit: number,
): Promise<{ available_balance: number; container_withdrawable_earnings: number }> {
  const m = roundUsd2(mainCredit)
  const l = roundUsd2(liquidCredit)
  if (m < 0 || l < 0) throw new Error("Invalid settlement credit split.")

  const { data: row, error: rErr } = await admin
    .from("user_balances")
    .select("available_balance, container_withdrawable_earnings")
    .eq("user_id", userId)
    .maybeSingle()
  if (rErr) throw new Error(rErr.message)
  if (!row) throw new Error("Balance row not found for user.")

  const nextAvail = roundUsd2(Number(row.available_balance ?? 0) + m)
  const nextLiquid = roundUsd2(Number(row.container_withdrawable_earnings ?? 0) + l)
  const now = new Date().toISOString()

  const { error: uErr } = await admin
    .from("user_balances")
    .update({
      available_balance: nextAvail,
      container_withdrawable_earnings: nextLiquid,
      last_updated: now,
    })
    .eq("user_id", userId)
  if (uErr) throw new Error(uErr.message)

  return { available_balance: nextAvail, container_withdrawable_earnings: nextLiquid }
}
