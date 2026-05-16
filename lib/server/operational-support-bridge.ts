import type { SupabaseClient } from "@supabase/supabase-js"
import { notifyLiquidityAdminsSupportQueue } from "@/lib/support-thread-notifications"

export type OperationalLinkedKind =
  | "retailer_fund_request"
  | "withdrawal_request"
  | "crypto_deposit_request"

export type OperationalThreadCategory =
  | "general"
  | "funding_dispute"
  | "withdrawal_dispute"
  | "appeal"
  | "security"
  | "retailer"
  | "crypto_dispute"
  | "assistant_escalation"
  | "transaction_review"
  | "operational_complaint"

type EnsureThreadParams = {
  userId: string
  category: OperationalThreadCategory
  linkedKind?: OperationalLinkedKind | null
  linkedId?: string | null
  escalated?: boolean
}

async function findThreadByLink(
  admin: SupabaseClient,
  linkedKind: OperationalLinkedKind,
  linkedId: string,
) {
  const { data, error } = await admin
    .from("operational_support_threads")
    .select("id")
    .eq("linked_kind", linkedKind)
    .eq("linked_id", linkedId)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export async function ensureOperationalThread(
  admin: SupabaseClient,
  params: EnsureThreadParams,
): Promise<string> {
  const linkedKind = params.linkedKind ?? null
  const linkedId = params.linkedId ?? null
  if (linkedKind && linkedId) {
    const existing = await findThreadByLink(admin, linkedKind, linkedId)
    if (existing) return existing
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("operational_support_threads")
    .insert({
      user_id: params.userId,
      category: params.category,
      status: "pending_admin",
      linked_kind: linkedKind,
      linked_id: linkedId,
      escalated: params.escalated ?? true,
      unread_for_admin: true,
      unread_for_user: false,
      last_message_at: now,
      updated_at: now,
    })
    .select("id")
    .single()
  if (error || !data?.id) {
    if (linkedKind && linkedId && error?.code === "23505") {
      const retry = await findThreadByLink(admin, linkedKind, linkedId)
      if (retry) return retry
    }
    throw new Error(error?.message ?? "Failed to create operational thread.")
  }
  return data.id as string
}

export async function appendOperationalMessage(
  admin: SupabaseClient,
  params: {
    threadId: string
    senderUserId: string
    senderRole: "user" | "admin" | "system"
    body: string
    bumpUnreadForAdmin?: boolean
    bumpUnreadForUser?: boolean
  },
): Promise<string> {
  const body = params.body.trim()
  if (!body) throw new Error("Message body is required.")

  const { data: msg, error: mErr } = await admin
    .from("operational_support_messages")
    .insert({
      thread_id: params.threadId,
      sender_user_id: params.senderUserId,
      sender_role: params.senderRole,
      body,
    })
    .select("id")
    .single()
  if (mErr || !msg?.id) throw new Error(mErr?.message ?? "Failed to append message.")

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    last_message_at: now,
    updated_at: now,
    status: params.senderRole === "admin" ? "answered" : "pending_admin",
  }
  if (params.bumpUnreadForAdmin) patch.unread_for_admin = true
  if (params.bumpUnreadForUser) patch.unread_for_user = true
  if (params.senderRole === "admin") patch.unread_for_admin = false

  const { error: tErr } = await admin
    .from("operational_support_threads")
    .update(patch)
    .eq("id", params.threadId)
  if (tErr) throw tErr

  return msg.id as string
}

export async function notifyAdminsOperationalThread(
  admin: SupabaseClient,
  params: { threadId: string; title: string; body: string },
) {
  await notifyLiquidityAdminsSupportQueue(admin, params)
}

/** Funding appeal: persist desk row + unified operational thread (admin Human support inbox). */
export async function bridgeFundingAppeal(
  admin: SupabaseClient,
  params: { userId: string; requestId: string; appealNote: string },
): Promise<{ threadId: string; fundUpdated: boolean }> {
  const { data: fundRow, error: loadErr } = await admin
    .from("retailer_fund_requests")
    .select("id,tx_reference,amount,status")
    .eq("id", params.requestId)
    .eq("user_id", params.userId)
    .maybeSingle()
  if (loadErr) throw loadErr
  if (!fundRow?.id) {
    throw new Error("Funding request not found.")
  }

  const status = String(fundRow.status ?? "")
  const appealable = ["rejected", "under_review", "pending", "appealed", "escalated"].includes(status)
  if (!appealable) {
    throw new Error("This funding request cannot be appealed in its current state.")
  }

  const now = new Date().toISOString()
  let fundUpdated = false
  if (status !== "appealed" && status !== "escalated") {
    const { data: updated, error } = await admin
      .from("retailer_fund_requests")
      .update({
        appeal_note: params.appealNote,
        status: "appealed",
        escalated_to_admin: true,
        escalated_note: params.appealNote,
        escalation_at: now,
        updated_at: now,
      })
      .eq("id", params.requestId)
      .eq("user_id", params.userId)
      .in("status", ["rejected", "under_review", "pending"])
      .select("id")
    if (error) throw error
    fundUpdated = (updated?.length ?? 0) > 0
    if (!fundUpdated) {
      throw new Error("Appeal could not be recorded. Refresh and try again.")
    }
  } else {
    const { error: reErr } = await admin
      .from("retailer_fund_requests")
      .update({
        appeal_note: params.appealNote,
        escalated_note: params.appealNote,
        escalated_to_admin: true,
        updated_at: now,
      })
      .eq("id", params.requestId)
      .eq("user_id", params.userId)
    if (reErr) throw reErr
    fundUpdated = true
  }

  const txRef = String(fundRow.tx_reference ?? "").slice(0, 48)
  const amount = Number(fundRow.amount ?? 0)
  const threadId = await ensureOperationalThread(admin, {
    userId: params.userId,
    category: "funding_dispute",
    linkedKind: "retailer_fund_request",
    linkedId: params.requestId,
    escalated: true,
  })

  const header = `Funding appeal · ref ${txRef || params.requestId.slice(0, 8)} · ${amount.toFixed(2)}`
  await appendOperationalMessage(admin, {
    threadId,
    senderUserId: params.userId,
    senderRole: "user",
    body: `${header}\n\n${params.appealNote}`,
    bumpUnreadForAdmin: true,
  })

  await notifyAdminsOperationalThread(admin, {
    threadId,
    title: "Funding appeal",
    body: params.appealNote,
  })

  return { threadId, fundUpdated }
}

export async function bridgeUserOperationalEscalation(
  admin: SupabaseClient,
  params: {
    userId: string
    body: string
    category?: OperationalThreadCategory
    linkedKind?: OperationalLinkedKind | null
    linkedId?: string | null
    source?: "assistant" | "user"
  },
): Promise<{ threadId: string; created: boolean }> {
  const category =
    params.category ??
    (params.source === "assistant" ? "assistant_escalation" : "general")
  const linkedKind = params.linkedKind ?? null
  const linkedId = params.linkedId ?? null

  let threadId: string
  let created = false
  if (linkedKind && linkedId) {
    const existing = await findThreadByLink(admin, linkedKind, linkedId)
    if (existing) {
      threadId = existing
    } else {
      threadId = await ensureOperationalThread(admin, {
        userId: params.userId,
        category,
        linkedKind,
        linkedId,
        escalated: true,
      })
      created = true
    }
  } else {
    threadId = await ensureOperationalThread(admin, {
      userId: params.userId,
      category,
      linkedKind: null,
      linkedId: null,
      escalated: true,
    })
    created = true
  }

  await appendOperationalMessage(admin, {
    threadId,
    senderUserId: params.userId,
    senderRole: params.source === "assistant" ? "system" : "user",
    body: params.body,
    bumpUnreadForAdmin: true,
  })

  await notifyAdminsOperationalThread(admin, {
    threadId,
    title: params.source === "assistant" ? "Assistant escalation" : "New operational thread",
    body: params.body,
  })

  return { threadId, created }
}
