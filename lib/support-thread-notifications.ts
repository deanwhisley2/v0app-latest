import type { SupabaseClient } from "@supabase/supabase-js"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"

function truncateBody(s: string, max: number) {
  const t = s.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

const navSupport = (threadId: string): NexusNotificationNav => ({
  kind: "support_thread",
  threadId,
})

/** End-user: admin posted on their appeal/support thread. */
export async function notifyUserSupportReply(
  admin: SupabaseClient,
  params: { userId: string; threadId: string; preview: string; messageId: string },
) {
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.userId,
      source_kind: "support_admin_reply",
      source_id: params.messageId,
      notification_type: "system",
      title: "Support replied",
      body: truncateBody(params.preview, 900),
      nav: navSupport(params.threadId),
      metadata: {},
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) throw error
}

/** Liquidity admins (L5): queue alert for a thread (new appeal or user message). Deduped per admin per thread. */
export async function notifyLiquidityAdminsSupportQueue(
  admin: SupabaseClient,
  params: { threadId: string; title: string; body: string },
) {
  const { data: admins, error } = await admin.from("profiles").select("id").eq("trading_user_level", 5).limit(500)
  if (error) throw error
  const nav = navSupport(params.threadId)
  for (const row of admins ?? []) {
    const { error: ie } = await admin.from("user_account_notifications").upsert(
      {
        user_id: row.id,
        source_kind: "support_thread_queue",
        source_id: params.threadId,
        notification_type: "system",
        title: params.title,
        body: truncateBody(params.body, 900),
        nav,
        metadata: {},
      },
      { onConflict: "user_id,source_kind,source_id" },
    )
    if (ie) throw ie
  }
}
