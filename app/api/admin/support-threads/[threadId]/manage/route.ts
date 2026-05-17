import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { appendOperationalMessage } from "@/lib/server/operational-support-bridge"

/** L5: resolve, reopen, assign, priority, lock thread. */
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
    }
    const action = typeof body.action === "string" ? body.action.trim() : ""
    const admin = createAdminClient()
    const now = new Date().toISOString()

    const { data: thread, error: te } = await admin
      .from("operational_support_threads")
      .select("id,user_id,status,audit_meta,locked_at")
      .eq("id", tid)
      .maybeSingle()
    if (te) return NextResponse.json({ error: te.message }, { status: 500 })
    if (!thread?.id) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const audit = (thread.audit_meta as Record<string, unknown>) ?? {}

    if (action === "resolve") {
      const note = typeof body.resolutionNote === "string" ? body.resolutionNote.trim() : ""
      const { error } = await admin
        .from("operational_support_threads")
        .update({
          status: "resolved",
          resolution_note: note || null,
          resolved_at: now,
          resolved_by_admin_id: actor.id,
          locked_at: now,
          unread_for_admin: false,
          unread_for_user: true,
          updated_at: now,
          audit_meta: {
            ...audit,
            resolved_at: now,
            resolved_by: actor.id,
          },
        })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (note) {
        await appendOperationalMessage(admin, {
          threadId: tid,
          senderUserId: actor.id,
          senderRole: "admin",
          body: `Resolved.\n\n${note}`,
          bumpUnreadForUser: true,
        })
      }
      return NextResponse.json({ ok: true, status: "resolved" })
    }

    if (action === "reopen") {
      const history = Array.isArray(audit.reopen_history) ? audit.reopen_history : []
      const { error } = await admin
        .from("operational_support_threads")
        .update({
          status: "pending_admin",
          locked_at: null,
          resolved_at: null,
          resolved_by_admin_id: null,
          resolution_note: null,
          unread_for_admin: true,
          updated_at: now,
          audit_meta: {
            ...audit,
            reopen_history: [...history, { at: now, by: actor.id }],
          },
        })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, status: "pending_admin" })
    }

    if (action === "assign") {
      const assignee =
        typeof body.assignedAdminId === "string" && body.assignedAdminId.trim()
          ? body.assignedAdminId.trim()
          : actor.id
      const { error } = await admin
        .from("operational_support_threads")
        .update({
          assigned_admin_id: assignee,
          updated_at: now,
        })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

    if (action === "lock") {
      const { error } = await admin
        .from("operational_support_threads")
        .update({ locked_at: now, status: "closed", updated_at: now })
        .eq("id", tid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, status: "closed" })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
