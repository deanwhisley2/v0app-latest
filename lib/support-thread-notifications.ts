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
  await notifyLiquidityAdminsSupportQueueInternal(admin, {
    ...params,
    sourceKind: "support_thread_queue",
    metadata: {},
  })
}

/** High-risk operational events: repeated disputes, crypto mismatch, urgent priority. */
export async function notifyLiquidityAdminsSupportQueueHighRisk(
  admin: SupabaseClient,
  params: { threadId: string; title: string; body: string; repeatCount?: number },
) {
  const prefix = params.repeatCount && params.repeatCount >= 3 ? `[Repeat x${params.repeatCount}] ` : "[Priority] "
  await notifyLiquidityAdminsSupportQueueInternal(admin, {
    threadId: params.threadId,
    title: `${prefix}${params.title}`,
    body: params.body,
    sourceKind: "support_thread_queue_high",
    metadata: { repeat_count: params.repeatCount ?? 0, high_risk: true },
  })
}

async function notifyLiquidityAdminsSupportQueueInternal(
  admin: SupabaseClient,
  params: {
    threadId: string
    title: string
    body: string
    sourceKind: string
    metadata: Record<string, unknown>
  },
) {
  const { data: admins, error } = await admin.from("profiles").select("id").eq("trading_user_level", 5).limit(500)
  if (error) throw error
  const nav = navSupport(params.threadId)
  for (const row of admins ?? []) {
    const { error: ie } = await admin.from("user_account_notifications").upsert(
      {
        user_id: row.id,
        source_kind: params.sourceKind,
        source_id: params.threadId,
        notification_type: "system",
        title: params.title,
        body: truncateBody(params.body, 900),
        nav,
        metadata: params.metadata,
      },
      { onConflict: "user_id,source_kind,source_id" },
    )
    if (ie) throw ie
  }
}
