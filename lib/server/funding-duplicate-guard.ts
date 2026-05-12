import type { SupabaseClient } from "@supabase/supabase-js"

/** User-visible copy for funding duplicate guard (exact match pending). */
export const DUPLICATE_PENDING_TOPUP_MESSAGE =
  "You already have a similar pending float request under review. Wait for ops to approve or reject it before submitting another with the same amount."

export const DUPLICATE_PENDING_FUNDING_MESSAGE =
  "You already have a similar pending funding request currently under review. Wait for approval or rejection before submitting again."

export function roundFundingAmount(n: number): number {
  return Math.round(n * 100) / 100
}

/** Blocks another pending top-up with the same USD amount from the same retailer (ignores explorer ref). */
export async function assertNoDuplicatePendingRetailerTopup(
  sb: SupabaseClient,
  retailerUserId: string,
  amountUsd: number,
): Promise<void> {
  const target = roundFundingAmount(amountUsd)
  const { data, error } = await sb
    .from("retailer_admin_topup_requests")
    .select("id,amount_requested")
    .eq("retailer_user_id", retailerUserId)
    .in("status", ["pending", "under_review"])

  if (error) throw new Error(error.message)
  const dup = (data ?? []).some((row: { amount_requested?: unknown }) => {
    const a = Number(row.amount_requested ?? 0)
    return roundFundingAmount(a) === target
  })
  if (dup) throw new DuplicatePendingError(DUPLICATE_PENDING_TOPUP_MESSAGE)
}

export class DuplicatePendingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DuplicatePendingError"
  }
}

/**
 * Blocks duplicate user funding submissions: same user, rounded amount, same channel,
 * same mobile_network key (normalized), while a prior row is still in an open lifecycle state.
 */
export async function assertNoDuplicatePendingUserFunding(
  sb: SupabaseClient,
  userId: string,
  amountUsd: number,
  fundChannel: string,
  mobileNetwork: string | null,
): Promise<void> {
  const target = roundFundingAmount(amountUsd)
  const channel = fundChannel.trim() || "local_mobile"
  const netKey = (mobileNetwork ?? "").trim()

  const { data, error } = await sb
    .from("retailer_fund_requests")
    .select("id,amount,amount_usd_locked,fund_channel,mobile_network,status")
    .eq("user_id", userId)
    .in("status", ["pending", "under_review", "appealed"])

  if (error) throw new Error(error.message)

  const dup = (data ?? []).some((row: {
    amount?: unknown
    amount_usd_locked?: unknown
    fund_channel?: string | null
    mobile_network?: string | null
  }) => {
    const ledgerUsd = Number(row.amount_usd_locked ?? row.amount ?? 0)
    const amt = roundFundingAmount(ledgerUsd)
    const ch = String(row.fund_channel ?? "local_mobile")
    const mob = String(row.mobile_network ?? "").trim()
    return amt === target && ch === channel && mob === netKey
  })

  if (dup) throw new DuplicatePendingError(DUPLICATE_PENDING_FUNDING_MESSAGE)
}
