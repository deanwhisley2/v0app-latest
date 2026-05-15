import type { SupabaseClient } from "@supabase/supabase-js"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"

/** User: funding settled by ops (wording differs slightly by rail). */
export async function notifyCustomerFundingOperational(
  admin: SupabaseClient,
  params: { userId: string; requestId: string; viaTreasury: boolean },
): Promise<void> {
  const body = params.viaTreasury
    ? "Your top-up went through using our company treasury. It should already show on your main balance."
    : "Your top-up went through with help from our operations team. It should already show on your main balance."
  const friendly = params.viaTreasury
    ? "Your retailer or desk added money to your main account. You can use it for trades or move it whenever you are ready."
    : "Your funding was approved. The money should be on your main account — use it or transfer it whenever you like."
  const nav: NexusNotificationNav = { kind: "notifications" }
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.userId,
      source_kind: "l5_funding_settled",
      source_id: `${params.requestId}:${params.viaTreasury ? "treasury" : "retailer"}`,
      notification_type: "financial",
      title: "Money added to your account",
      body,
      nav,
      metadata: {
        requestId: params.requestId,
        rail: params.viaTreasury ? "treasury_pool" : "retailer_retail_balance",
        friendly_detail: friendly,
      },
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
  const nav: NexusNotificationNav = { kind: "notifications" }
  const friendly =
    "This matches a customer top-up you already approved. Your desk balance was reduced so their account could be credited — nothing extra beyond what you agreed to."
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.retailerUserId,
      source_kind: "l5_retailer_override_debit",
      source_id: params.requestId,
      notification_type: "system",
      title: "Desk payment approved",
      body: "We used your desk balance to cover a customer top-up you approved.",
      nav,
      metadata: {
        requestId: params.requestId,
        retailerDebitedUsdEquivalent: params.amountUsd,
        friendly_detail: friendly,
      },
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) console.warn("[l5-funding-notify] retailer notify failed:", error.message)
}
