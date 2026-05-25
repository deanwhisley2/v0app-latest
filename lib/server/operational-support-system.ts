import type { SupabaseClient } from "@supabase/supabase-js"
import { appendOperationalMessage } from "@/lib/server/operational-support-bridge"

export type InstitutionalThreadStatus =
  | "open"
  | "pending_user"
  | "pending_admin"
  | "under_review"
  | "resolved"
  | "closed"

const SYSTEM_COPY: Record<string, string> = {
  open: "Your conversation is open and queued for review.",
  pending_user: "Awaiting your response — please reply when you can.",
  pending_admin: "Your message was received. Our team will respond shortly.",
  under_review: "This issue is under review by operations.",
  escalated: "This case has been escalated for priority handling.",
  resolved: "This conversation has been marked resolved.",
  closed: "This conversation is closed.",
  reopened: "This conversation has been reopened.",
}

export function systemMessageForStatus(status: string, escalated?: boolean): string {
  if (escalated && (status === "open" || status === "pending_admin" || status === "under_review")) {
    return SYSTEM_COPY.escalated
  }
  return SYSTEM_COPY[status] ?? SYSTEM_COPY.pending_admin
}

/** Append a system lifecycle message and optionally patch thread status. */
export async function transitionOperationalThread(
  admin: SupabaseClient,
  params: {
    threadId: string
    actorUserId: string
    status?: InstitutionalThreadStatus
    escalated?: boolean
    systemBody?: string
    patch?: Record<string, unknown>
  },
): Promise<void> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    updated_at: now,
    ...params.patch,
  }
  if (params.status) patch.status = params.status
  if (typeof params.escalated === "boolean") patch.escalated = params.escalated

  const { error: uErr } = await admin
    .from("operational_support_threads")
    .update(patch)
    .eq("id", params.threadId)
  if (uErr) throw uErr

  const body =
    params.systemBody?.trim() ||
    systemMessageForStatus(params.status ?? "pending_admin", params.escalated)

  await appendOperationalMessage(admin, {
    threadId: params.threadId,
    senderUserId: params.actorUserId,
    senderRole: "system",
    body,
    isSystem: true,
    bumpUnreadForUser: params.status === "pending_user" || params.status === "resolved",
    bumpUnreadForAdmin: params.status === "pending_admin" || params.status === "open",
  })
}
