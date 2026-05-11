import type { SupabaseClient } from "@supabase/supabase-js"

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
  const { error } = await admin.from("user_account_notifications").insert({
    user_id: row.userId,
    source_kind: row.sourceKind,
    source_id: row.sourceId,
    notification_type: row.notificationType,
    title: row.title,
    body: row.body,
    nav: row.nav ?? null,
    metadata: row.metadata ?? {},
  })
  if (error) {
    if (error.code === "23505") return
    console.warn("[user_account_notifications] insert failed:", error.message, error.code)
  }
}
