import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Automatic funding promotions are disabled.
 * Approved auto-incentives: startup capital (registration) + referral first-trade reward.
 */
export async function applyLaunchFundingPromotions(
  sb: SupabaseClient,
  userId: string,
  depositUsd: number,
  sourceRef: string,
): Promise<void> {
  void sb
  void userId
  void depositUsd
  void sourceRef
}

/** @deprecated First deposit bonus disabled — no-op for legacy callers. */
export async function tryCreditReferrerFirstDepositBonus(
  sb: SupabaseClient,
  refereeUserId: string,
  depositAmountUsd: number,
): Promise<void> {
  void sb
  void refereeUserId
  void depositAmountUsd
}
