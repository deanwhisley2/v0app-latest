import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { appendOperationalMessage } from "@/lib/server/operational-support-bridge"
import { applyApprovedSecurityChange } from "@/lib/server/user-security-profile-service"

/** L5: approve/reject security change appeals — applies payout fields on approve. */
export async function PATCH(request: Request, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { requestId } = await ctx.params
    const rid = typeof requestId === "string" ? requestId.trim() : ""
    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      new_value_plain?: string
      admin_notes?: string
      resolution_note?: string
    }
    const action = typeof body.action === "string" ? body.action.trim() : ""
    const admin = createAdminClient()
    const now = new Date().toISOString()

    const { data: req, error: re } = await admin
      .from("security_change_requests")
      .select("*")
      .eq("id", rid)
      .maybeSingle()
    if (re) return NextResponse.json({ error: re.message }, { status: 500 })
    if (!req) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const userId = req.user_id as string
    const threadId = req.thread_id as string | null

    if (action === "verifying" || action === "pending_code_confirmation") {
      const status = action === "verifying" ? "verifying" : "pending_code_confirmation"
      await admin
        .from("security_change_requests")
        .update({ status, assigned_admin_id: actor.id, updated_at: now })
        .eq("id", rid)
      if (threadId) {
        await appendOperationalMessage(admin, {
          threadId,
          senderUserId: actor.id,
          senderRole: "system",
          body: `Status: ${status.replace(/_/g, " ")}.`,
          isSystem: true,
        })
      }
      return NextResponse.json({ ok: true, status })
    }

    if (action === "approve") {
      const plain =
        typeof body.new_value_plain === "string" && body.new_value_plain.trim()
          ? body.new_value_plain.trim()
          : null
      if (!plain && req.request_type !== "payout_method") {
        return NextResponse.json({ error: "new_value_plain required for approval." }, { status: 400 })
      }
      await applyApprovedSecurityChange(admin, {
        userId,
        requestType: req.request_type as string,
        newValuePlain: plain ?? "mobile_money",
        adminId: actor.id,
      })
      await admin
        .from("security_change_requests")
        .update({
          status: "approved",
          assigned_admin_id: actor.id,
          admin_notes: body.admin_notes ?? null,
          resolution_note: body.resolution_note ?? null,
          resolved_at: now,
          updated_at: now,
        })
        .eq("id", rid)
      if (threadId) {
        await appendOperationalMessage(admin, {
          threadId,
          senderUserId: actor.id,
          senderRole: "system",
          body: "Your security update was approved. Sensitive details on your account have been updated.",
          isSystem: true,
          bumpUnreadForUser: true,
        })
        await admin
          .from("operational_support_threads")
          .update({ status: "resolved", unread_for_user: true, updated_at: now })
          .eq("id", threadId)
      }
      return NextResponse.json({ ok: true, status: "approved" })
    }

    if (action === "reject" || action === "close") {
      const status = action === "reject" ? "rejected" : "closed"
      await admin
        .from("security_change_requests")
        .update({
          status,
          assigned_admin_id: actor.id,
          resolution_note: body.resolution_note ?? null,
          resolved_at: now,
          updated_at: now,
        })
        .eq("id", rid)
      if (threadId) {
        await appendOperationalMessage(admin, {
          threadId,
          senderUserId: actor.id,
          senderRole: "system",
          body:
            body.resolution_note?.trim() ||
            (action === "reject"
              ? "Your security update request was not approved."
              : "This security appeal was closed."),
          isSystem: true,
          bumpUnreadForUser: true,
        })
        await admin
          .from("operational_support_threads")
          .update({ status: "closed", updated_at: now })
          .eq("id", threadId)
      }
      return NextResponse.json({ ok: true, status })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
