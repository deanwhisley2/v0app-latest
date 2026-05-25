import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { appendOperationalMessage } from "@/lib/server/operational-support-bridge"
import { transitionOperationalThread, type InstitutionalThreadStatus } from "@/lib/server/operational-support-system"
import { notifyUserSupportReply } from "@/lib/support-thread-notifications"

/** L5: lifecycle — resolve, reopen, assign, priority, status transitions, close. */
export async function PATCH(request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { threadId } = await ctx.params
    const tid = typeof threadId === "string" ? threadId.trim() : ""
    if (!tid) return NextResponse.json({ error: "threadId required." }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      resolutionNote?: string
      priority?: string
      assignedAdminId?: string | null
      status?: string
    }
    const action = typeof body.action === "string" ? body.action.trim() : ""
    const admin = createAdminClient()
    const now = new Date().toISOString()

    const { data: thread, error: te } = await admin
      .from("operational_support_threads")
      .select("id,user_id,status,audit_meta,locked_at,escalated")
      .eq("id", tid)
      .maybeSingle()
    if (te) return NextResponse.json({ error: te.message }, { status: 500 })
    if (!thread?.id) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const audit = (thread.audit_meta as Record<string, unknown>) ?? {}

    const setStatus = async (
      status: InstitutionalThreadStatus,
      extra?: Record<string, unknown>,
      systemBody?: string,
    ) => {
      await transitionOperationalThread(admin, {
        threadId: tid,
        actorUserId: actor.id,
        status,
        systemBody,
        patch: { unread_for_admin: false, unread_for_user: true, ...extra },
      })
      return NextResponse.json({ ok: true, status })
    }

    if (action === "pending_user") {
      return setStatus("pending_user", {}, "Awaiting your response.")
    }

    if (action === "pending_admin") {
      return setStatus("pending_admin", { unread_for_admin: true, unread_for_user: false })
    }

    if (action === "under_review") {
      return setStatus("under_review", {}, "Admin marked this issue under review.")
    }

    if (action === "escalate") {
      await transitionOperationalThread(admin, {
        threadId: tid,
        actorUserId: actor.id,
        status: "under_review",
        escalated: true,
        systemBody: "This case has been escalated for priority handling.",
        patch: { unread_for_admin: true, unread_for_user: true, priority: "urgent" },
      })
      return NextResponse.json({ ok: true, status: "under_review", escalated: true })
    }

    if (action === "open") {
      return setStatus("open", { locked_at: null, unread_for_admin: true })
    }

    if (action === "resolve") {
      const note = typeof body.resolutionNote === "string" ? body.resolutionNote.trim() : ""
      const { error } = await admin
        .from("operational_support_threads")
        .update({
          status: "resolved",
          resolution_note: note || null,
          resolved_at: now,
          resolved_by_admin_id: actor.id,
          locked_at: null,
          unread_for_admin: false,
          unread_for_user: true,
          updated_at: now,
          audit_meta: { ...audit, resolved_at: now, resolved_by: actor.id },
        })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await transitionOperationalThread(admin, {
        threadId: tid,
        actorUserId: actor.id,
        status: "resolved",
        systemBody: note ? `Conversation resolved.\n\n${note}` : "Conversation resolved.",
        patch: { unread_for_user: true },
      })
      try {
        const { data: lastMsg } = await admin
          .from("operational_support_messages")
          .select("id")
          .eq("thread_id", tid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (thread.user_id && lastMsg?.id) {
          await notifyUserSupportReply(admin, {
            userId: thread.user_id,
            threadId: tid,
            preview: note || "Your support case was resolved.",
            messageId: lastMsg.id,
          })
        }
      } catch (ne) {
        console.error("[support] resolve notify failed:", ne)
      }
      return NextResponse.json({ ok: true, status: "resolved" })
    }

    if (action === "reopen") {
      const history = Array.isArray(audit.reopen_history) ? audit.reopen_history : []
      await transitionOperationalThread(admin, {
        threadId: tid,
        actorUserId: actor.id,
        status: "pending_admin",
        systemBody: "Conversation reopened.",
        patch: {
          locked_at: null,
          resolved_at: null,
          resolved_by_admin_id: null,
          resolution_note: null,
          unread_for_admin: true,
          audit_meta: { ...audit, reopen_history: [...history, { at: now, by: actor.id }] },
        },
      })
      return NextResponse.json({ ok: true, status: "pending_admin" })
    }

    if (action === "assign") {
      const assignee =
        typeof body.assignedAdminId === "string" && body.assignedAdminId.trim()
          ? body.assignedAdminId.trim()
          : actor.id
      const { error } = await admin
        .from("operational_support_threads")
        .update({ assigned_admin_id: assignee, updated_at: now })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await appendOperationalMessage(admin, {
        threadId: tid,
        senderUserId: actor.id,
        senderRole: "system",
        body: "Case assigned to an operations specialist.",
        isSystem: true,
      })
      return NextResponse.json({ ok: true, assigned_admin_id: assignee })
    }

    if (action === "priority") {
      const p = body.priority === "urgent" || body.priority === "high" ? body.priority : "normal"
      const { error } = await admin
        .from("operational_support_threads")
        .update({ priority: p, updated_at: now })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, priority: p })
    }

    if (action === "close" || action === "lock") {
      await transitionOperationalThread(admin, {
        threadId: tid,
        actorUserId: actor.id,
        status: "closed",
        systemBody: "Conversation closed.",
        patch: { locked_at: now, unread_for_admin: false },
      })
      return NextResponse.json({ ok: true, status: "closed" })
    }

    if (action === "mute") {
      const { error } = await admin
        .from("operational_support_threads")
        .update({
          audit_meta: { ...audit, muted: true, muted_at: now, muted_by: actor.id },
          updated_at: now,
        })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, muted: true })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
