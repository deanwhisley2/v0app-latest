import type { SupabaseClient } from "@supabase/supabase-js"
import {
  notifyLiquidityAdminsSupportQueue,
  notifyLiquidityAdminsSupportQueueHighRisk,
} from "@/lib/support-thread-notifications"

export type OperationalLinkedKind =
  | "retailer_fund_request"
  | "withdrawal_request"
  | "crypto_deposit_request"
  | "trade_session"
  | "copy_trade_session"

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
  | "payout_dispute"
  | "stuck_trade"
  | "settlement_failure"
  | "locked_balance"
  | "verification_complaint"

export type EscalationSource =
  | "funding_appeal"
  | "withdrawal_dispute"
  | "crypto_verify"
  | "transaction_review"
  | "assistant"
  | "user_desk"
  | "system"
  | "payout_dispute"
  | "stuck_trade"
  | "settlement_failure"
  | "locked_balance"

export type OperationalPriority = "normal" | "high" | "urgent"

type EnsureThreadParams = {
  userId: string
  category: OperationalThreadCategory
  linkedKind?: OperationalLinkedKind | null
  linkedId?: string | null
  escalated?: boolean
  escalationSource?: EscalationSource | null
  priority?: OperationalPriority
  searchKey?: string | null
  auditMeta?: Record<string, unknown>
}

async function findThreadByLink(
  admin: SupabaseClient,
  linkedKind: OperationalLinkedKind,
  linkedId: string,
) {
  const { data, error } = await admin
    .from("operational_support_threads")
    .select("id,status,locked_at")
    .eq("linked_kind", linkedKind)
    .eq("linked_id", linkedId)
    .maybeSingle()
  if (error) throw error
  return data as { id: string; status: string; locked_at: string | null } | null
}

export async function ensureOperationalThread(
  admin: SupabaseClient,
  params: EnsureThreadParams,
): Promise<string> {
  const linkedKind = params.linkedKind ?? null
  const linkedId = params.linkedId ?? null
  if (linkedKind && linkedId) {
    const existing = await findThreadByLink(admin, linkedKind, linkedId)
    if (existing?.id) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        escalated: params.escalated ?? true,
      }
      if (params.escalationSource) patch.escalation_source = params.escalationSource
      if (params.priority) patch.priority = params.priority
      if (params.searchKey) patch.search_key = params.searchKey
      await admin.from("operational_support_threads").update(patch).eq("id", existing.id)
      return existing.id
    }
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
      escalation_source: params.escalationSource ?? null,
      priority: params.priority ?? "normal",
      search_key: params.searchKey ?? null,
      audit_meta: params.auditMeta ?? {},
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
      if (retry?.id) return retry.id
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
    attachmentMeta?: Record<string, unknown>
  },
): Promise<string> {
  const body = params.body.trim()
  if (!body) throw new Error("Message body is required.")

  const { data: thread, error: loadErr } = await admin
    .from("operational_support_threads")
    .select("id,locked_at,status")
    .eq("id", params.threadId)
    .maybeSingle()
  if (loadErr) throw loadErr
  if (!thread?.id) throw new Error("Thread not found.")
  if (thread.locked_at && params.senderRole === "user") {
    throw new Error("Thread is closed to new customer messages.")
  }

  const { data: msg, error: mErr } = await admin
    .from("operational_support_messages")
    .insert({
      thread_id: params.threadId,
      sender_user_id: params.senderUserId,
      sender_role: params.senderRole,
      body,
      attachment_meta: params.attachmentMeta ?? {},
    })
    .select("id")
    .single()
  if (mErr || !msg?.id) throw new Error(mErr?.message ?? "Failed to append message.")

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    last_message_at: now,
    updated_at: now,
  }
  if (params.senderRole === "admin") {
    patch.status = "answered"
    patch.unread_for_admin = false
    if (params.bumpUnreadForUser) patch.unread_for_user = true
  } else {
    patch.status = "pending_admin"
    if (params.bumpUnreadForAdmin) patch.unread_for_admin = true
    if (params.bumpUnreadForUser) patch.unread_for_user = false
  }

  const { error: tErr } = await admin
    .from("operational_support_threads")
    .update(patch)
    .eq("id", params.threadId)
  if (tErr) throw tErr

  return msg.id as string
}

async function countRecentEscalations(admin: SupabaseClient, userId: string, hours = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const { count, error } = await admin
    .from("operational_support_threads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since)
  if (error) return 0
  return count ?? 0
}

export async function notifyAdminsOperationalThread(
  admin: SupabaseClient,
  params: {
    threadId: string
    title: string
    body: string
    priority?: OperationalPriority
    userId?: string
    highRisk?: boolean
  },
) {
  const recent = params.userId ? await countRecentEscalations(admin, params.userId) : 0
  const highRisk = params.highRisk || params.priority === "urgent" || recent >= 3
  if (highRisk) {
    await notifyLiquidityAdminsSupportQueueHighRisk(admin, {
      threadId: params.threadId,
      title: params.title,
      body: params.body,
      repeatCount: recent,
    })
  } else {
    await notifyLiquidityAdminsSupportQueue(admin, {
      threadId: params.threadId,
      title: params.title,
      body: params.body,
    })
  }
}

/** Single entry point for all operational escalations. */
export async function routeOperationalEscalation(
  admin: SupabaseClient,
  params: {
    userId: string
    body: string
    category: OperationalThreadCategory
    escalationSource: EscalationSource
    linkedKind?: OperationalLinkedKind | null
    linkedId?: string | null
    priority?: OperationalPriority
    searchKey?: string | null
    senderRole?: "user" | "system"
    auditMeta?: Record<string, unknown>
  },
): Promise<{ threadId: string; created: boolean }> {
  const linkedKind = params.linkedKind ?? null
  const linkedId = params.linkedId ?? null
  let created = false
  const existing = linkedKind && linkedId ? await findThreadByLink(admin, linkedKind, linkedId) : null
  const threadId = await ensureOperationalThread(admin, {
    userId: params.userId,
    category: params.category,
    linkedKind,
    linkedId,
    escalated: true,
    escalationSource: params.escalationSource,
    priority: params.priority ?? "normal",
    searchKey: params.searchKey,
    auditMeta: {
      ...(params.auditMeta ?? {}),
      last_escalation_at: new Date().toISOString(),
      escalation_source: params.escalationSource,
    },
  })
  created = !existing

  await appendOperationalMessage(admin, {
    threadId,
    senderUserId: params.userId,
    senderRole: params.senderRole ?? "user",
    body: params.body,
    bumpUnreadForAdmin: true,
  })

  await notifyAdminsOperationalThread(admin, {
    threadId,
    title: escalationTitle(params.category),
    body: params.body,
    priority: params.priority,
    userId: params.userId,
    highRisk: params.priority === "urgent" || params.priority === "high",
  })

  return { threadId, created }
}

function escalationTitle(category: OperationalThreadCategory): string {
  const map: Partial<Record<OperationalThreadCategory, string>> = {
    funding_dispute: "Funding appeal",
    withdrawal_dispute: "Withdrawal dispute",
    crypto_dispute: "Crypto verification",
    payout_dispute: "Payout dispute",
    assistant_escalation: "Assistant escalation",
    stuck_trade: "Trade issue",
    settlement_failure: "Settlement issue",
    locked_balance: "Balance issue",
  }
  return map[category] ?? "Operational thread"
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
  if (!fundRow?.id) throw new Error("Funding request not found.")

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
    if (!fundUpdated) throw new Error("Appeal could not be recorded. Refresh and try again.")
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
  const { threadId } = await routeOperationalEscalation(admin, {
    userId: params.userId,
    category: "funding_dispute",
    escalationSource: "funding_appeal",
    linkedKind: "retailer_fund_request",
    linkedId: params.requestId,
    searchKey: txRef.toLowerCase(),
    priority: "high",
    body: `Funding appeal · ref ${txRef || params.requestId.slice(0, 8)} · ${amount.toFixed(2)}\n\n${params.appealNote}`,
    auditMeta: { retailer_fund_request_id: params.requestId, tx_reference: txRef },
  })

  return { threadId, fundUpdated }
}

export async function bridgeCryptoDepositDispute(
  admin: SupabaseClient,
  params: { userId: string; depositId: string; reason: string; priority?: OperationalPriority },
): Promise<{ threadId: string }> {
  const { data: row, error } = await admin
    .from("crypto_deposit_requests")
    .select("id,tx_hash,status,amount_usd,failure_reason")
    .eq("id", params.depositId)
    .eq("user_id", params.userId)
    .maybeSingle()
  if (error) throw error
  if (!row?.id) throw new Error("Crypto deposit not found.")

  const txHash = String(row.tx_hash ?? "").slice(0, 64)
  const { threadId } = await routeOperationalEscalation(admin, {
    userId: params.userId,
    category: "crypto_dispute",
    escalationSource: "crypto_verify",
    linkedKind: "crypto_deposit_request",
    linkedId: params.depositId,
    searchKey: txHash.toLowerCase(),
    priority: params.priority ?? "high",
    body: `Crypto deposit · ${txHash.slice(0, 18)} · ${Number(row.amount_usd ?? 0).toFixed(2)} · ${row.status}\n\n${params.reason}`,
    auditMeta: { crypto_deposit_id: params.depositId, failure_reason: row.failure_reason },
  })
  return { threadId }
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
    escalationSource?: EscalationSource
    priority?: OperationalPriority
    searchKey?: string | null
  },
): Promise<{ threadId: string; created: boolean }> {
  const category =
    params.category ??
    (params.source === "assistant" ? "assistant_escalation" : "general")
  const escalationSource =
    params.escalationSource ??
    (params.source === "assistant" ? "assistant" : "user_desk")

  return routeOperationalEscalation(admin, {
    userId: params.userId,
    body: params.body,
    category,
    escalationSource,
    linkedKind: params.linkedKind ?? null,
    linkedId: params.linkedId ?? null,
    priority: params.priority ?? "normal",
    searchKey: params.searchKey,
    senderRole: params.source === "assistant" ? "system" : "user",
  })
}
