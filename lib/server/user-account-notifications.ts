import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"
import { mapCustomerNotification } from "@/lib/notifications/notification-mapper"

/** Inserts a durable notification row (idempotent on user_id + source_kind + source_id). */
export async function appendUserAccountNotification(
  admin: SupabaseClient,
  row: {
    userId: string
    sourceKind: string
    sourceId: string
    notificationType: string
    title: string
    body: string
    nav?: Record<string, unknown> | null
    metadata?: Record<string, unknown> | null
  }
): Promise<void> {
  const fallback = "Your account was updated."
  const mapped = mapCustomerNotification({
    notificationType: row.notificationType,
    title: row.title,
    body: row.body,
    metadata: row.metadata,
  })
  const title = sanitizeCustomerNotificationText(mapped?.title ?? row.title, fallback)
  const body = sanitizeCustomerNotificationText(mapped?.body ?? row.body, fallback)
  const metaRaw = row.metadata ?? {}
  const { friendly_detail: _stripFriendly, ...metaRest } = metaRaw as {
    friendly_detail?: unknown
  }
  const friendly =
    typeof metaRaw.friendly_detail === "string"
      ? sanitizeCustomerNotificationText(metaRaw.friendly_detail, "")
      : undefined

  const { error } = await admin.from("user_account_notifications").insert({
    user_id: row.userId,
    source_kind: row.sourceKind,
    source_id: row.sourceId,
    notification_type: row.notificationType,
    title,
    body,
    nav: row.nav ?? null,
    metadata: {
      ...metaRest,
      ...(friendly ? { friendly_detail: friendly } : {}),
    },
  })
  if (error) {
    if (error.code === "23505") return
    console.warn("[user_account_notifications] insert failed:", error.message, error.code)
  }
}
