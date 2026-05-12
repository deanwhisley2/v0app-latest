import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

export async function POST(request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { threadId } = await ctx.params
    const tid = typeof threadId === "string" ? threadId.trim() : ""
    const body = (await request.json().catch(() => ({}))) as { body?: string }
    const text = typeof body.body === "string" ? body.body.trim() : ""
    if (!tid || !text || text.length > 12_000) {
      return NextResponse.json({ error: "threadId and body are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: thread, error: te } = await admin.from("operational_support_threads").select("id").eq("id", tid).maybeSingle()
    if (te) return NextResponse.json({ error: te.message }, { status: 500 })
    if (!thread) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const now = new Date().toISOString()
    const { error: me } = await admin.from("operational_support_messages").insert({
      thread_id: tid,
      sender_user_id: actor.id,
      sender_role: "admin",
      body: text,
    })
    if (me) return NextResponse.json({ error: me.message }, { status: 500 })

    const { error: ue } = await admin
      .from("operational_support_threads")
      .update({
        unread_for_user: true,
        unread_for_admin: false,
        assigned_admin_id: actor.id,
        last_message_at: now,
        updated_at: now,
        status: "answered",
      })
      .eq("id", tid)
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
