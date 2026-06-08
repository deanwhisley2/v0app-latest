import type { SupabaseClient } from "@supabase/supabase-js"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import { buildWithdrawalRejectedCustomerCopy } from "@/lib/notifications/customer-notification-language"
import { customerNotifyForUser } from "@/lib/server/customer-ui-language"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"

/** Customer: withdrawal declined by admin — includes optional resolution note in account log. */
export async function notifyCustomerWithdrawalDeclined(
  admin: SupabaseClient,
  params: {
    userId: string
    requestId: string
    resolutionNote?: string | null
    amountUsd?: number
  },
): Promise<void> {
  const { t } = await customerNotifyForUser(admin, params.userId)
  const { title, body } = buildWithdrawalRejectedCustomerCopy(params.resolutionNote, t)
  const nav: NexusNotificationNav = { kind: "notifications" }
  const cleanNote = params.resolutionNote?.trim() || null

  await appendUserAccountNotification(admin, {
    userId: params.userId,
    sourceKind: "withdrawal_status",
    sourceId: `${params.requestId}:rejected`,
    notificationType: "withdrawal",
    title,
    body,
    nav,
    metadata: {
      requestId: params.requestId,
      resolution_note: cleanNote,
      note: cleanNote,
      amount_usd: params.amountUsd ?? null,
      ops_audit: { status: "rejected", withdrawal_request_id: params.requestId },
      ...(cleanNote ? { friendly_detail: cleanNote } : {}),
    },
  })
}
