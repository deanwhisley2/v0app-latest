import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"
import { localizeStoredNotificationTitle } from "@/lib/notifications/localize-stored-notification"
import { customerNotifyForUser } from "@/lib/server/customer-ui-language"
import { notifyUserPushIfAllowed } from "@/lib/server/nexus-push-notify"

/** Lightweight in-app inbox row for approvals (reuses NotificationRecord schema). */
export async function notifyUserFundingDecision(
  sb: SupabaseClient,
  params: {
    userId: string
    headline: string
    relatedId: string
  },
): Promise<void> {
  const nowIso = new Date().toISOString()
  try {
    const { t } = await customerNotifyForUser(sb, params.userId)
    const localizedHeadline = localizeStoredNotificationTitle(params.headline.trim(), t)
    const fallback = t("notifications.inbox.accountUpdateTitle")
    const safeHeadline = sanitizeCustomerNotificationText(localizedHeadline, fallback).slice(0, 120)
    const { error } = await sb.from("NotificationRecord").insert({
      id: randomUUID(),
      userId: params.userId,
      analysisId: params.relatedId,
      symbol: "NEXUS_OPS",
      action: safeHeadline,
      confidence: 0,
      read: false,
      deleted: false,
      createdAt: nowIso,
    })
    if (error) console.warn("[approval-inbox-notify]", error.message)

    try {
      await notifyUserPushIfAllowed(sb, {
        userId: params.userId,
        headline: safeHeadline,
        title: safeHeadline,
        body: safeHeadline,
        tag: `funding:${params.relatedId}`,
        url: "/dashboard",
      })
    } catch {
      /* optional */
    }
  } catch (e) {
    console.warn("[approval-inbox-notify]", e)
  }
}
