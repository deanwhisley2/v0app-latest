import type { SupabaseClient } from "@supabase/supabase-js"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"

/** User: funding settled by ops (wording differs slightly by rail). */
export async function notifyCustomerFundingOperational(
  admin: SupabaseClient,
  params: { userId: string; requestId: string; viaTreasury: boolean },
): Promise<void> {
  const body = params.viaTreasury
    ? "Funding approved successfully — company treasury liquidity was used for this settlement."
    : "Funding approved successfully by operational support."
  const nav: NexusNotificationNav = { kind: "wallet" }
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.userId,
      source_kind: "l5_funding_settled",
      source_id: `${params.requestId}:${params.viaTreasury ? "treasury" : "retailer"}`,
      notification_type: "financial",
      title: "Funding approved",
      body,
      nav,
      metadata: { requestId: params.requestId, rail: params.viaTreasury ? "treasury_pool" : "retailer_retail_balance" },
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) console.warn("[l5-funding-notify] customer notify failed:", error.message)
}

/** Retailer desk user: admin approved using their Retail Balance. */
export async function notifyRetailerOverrideDebit(
  admin: SupabaseClient,
  params: { retailerUserId: string; requestId: string; amountUsd: number },
): Promise<void> {
  const nav: NexusNotificationNav = { kind: "wallet" }
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.retailerUserId,
      source_kind: "l5_retailer_override_debit",
      source_id: params.requestId,
      notification_type: "system",
      title: "Admin approved funding on your behalf",
      body: "Admin approved funding request on your behalf. Your Retail Balance was debited.",
      nav,
      metadata: { requestId: params.requestId, retailerDebitedUsdEquivalent: params.amountUsd },
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) console.warn("[l5-funding-notify] retailer notify failed:", error.message)
}
