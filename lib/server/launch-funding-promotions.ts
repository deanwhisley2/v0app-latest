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

/** @deprecated Use applyLaunchFundingPromotions wrapper. */
export async function tryCreditReferrerFirstDepositBonus(
  sb: SupabaseClient,
  refereeUserId: string,
  depositAmountUsd: number,
): Promise<void> {
  await applyFirstDepositBonus(sb, refereeUserId, depositAmountUsd, "legacy_retail_settlement")
}
