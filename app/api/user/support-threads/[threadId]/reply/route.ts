import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function POST(request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const { threadId } = await ctx.params
    const tid = typeof threadId === "string" ? threadId.trim() : ""
    const body = (await request.json().catch(() => ({}))) as { body?: string }
    const text = typeof body.body === "string" ? body.body.trim() : ""
    if (!tid || !text || text.length > 12_000) {
      return NextResponse.json({ error: "threadId and body are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: thread, error: te } = await admin
      .from("operational_support_threads")
      .select("id")
      .eq("id", tid)
      .eq("user_id", user.id)
      .maybeSingle()
    if (te) return NextResponse.json({ error: te.message }, { status: 500 })
    if (!thread) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const now = new Date().toISOString()
    const { error: me } = await admin.from("operational_support_messages").insert({
      thread_id: tid,
      sender_user_id: user.id,
      sender_role: "user",
      body: text,
    })
    if (me) return NextResponse.json({ error: me.message }, { status: 500 })

    const { error: ue } = await admin
      .from("operational_support_threads")
      .update({
        unread_for_admin: true,
        unread_for_user: false,
        last_message_at: now,
        updated_at: now,
        status: "pending_admin",
      })
      .eq("id", tid)
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
