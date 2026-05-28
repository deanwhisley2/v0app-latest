import type { SupabaseClient } from "@supabase/supabase-js"
import { applyFirstDepositBonus } from "@/lib/server/platform-incentives"

/**
 * Legacy compatibility wrapper.
 * Promotions are replaced by stable platform incentive policy.
 */
export async function applyLaunchFundingPromotions(
  sb: SupabaseClient,
  userId: string,
  depositUsd: number,
  sourceRef: string,
): Promise<void> {
  await applyFirstDepositBonus(sb, userId, depositUsd, sourceRef)
}

/**
 * @deprecated Legacy launch treasury helper is retired with campaign cleanup.
 * Kept only for old call sites; returns false so legacy grants do not run.
 */
export async function creditUserFromLaunchTreasury(
  _sb: SupabaseClient,
  _params: {
    userId: string
    amountUsd: number
    referenceId: string
    reason: string
    eventType: string
    summary: string
    metadata: Record<string, unknown>
    notificationTitle: string
    notificationBody: string
  },
): Promise<boolean> {
  return false
}

/** @deprecated Use applyLaunchFundingPromotions wrapper. */
export async function tryCreditReferrerFirstDepositBonus(
  sb: SupabaseClient,
  refereeUserId: string,
  depositAmountUsd: number,
): Promise<void> {
  await applyFirstDepositBonus(sb, refereeUserId, depositAmountUsd, "legacy_retail_settlement")
}
