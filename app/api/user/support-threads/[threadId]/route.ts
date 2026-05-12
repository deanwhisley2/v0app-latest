import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

/** Single thread + messages for the owning user. */
export async function GET(request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const { threadId } = await ctx.params
    const tid = typeof threadId === "string" ? threadId.trim() : ""
    if (!tid) return NextResponse.json({ error: "threadId required." }, { status: 400 })

    const admin = createAdminClient()
    const { data: thread, error: te } = await admin
      .from("operational_support_threads")
      .select("*")
      .eq("id", tid)
      .eq("user_id", user.id)
      .maybeSingle()
    if (te) return NextResponse.json({ error: te.message }, { status: 500 })
    if (!thread) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const { data: messages, error: me } = await admin
      .from("operational_support_messages")
      .select("id,sender_user_id,sender_role,body,created_at")
      .eq("thread_id", tid)
      .order("created_at", { ascending: true })
      .limit(500)
    if (me) return NextResponse.json({ error: me.message }, { status: 500 })

    return NextResponse.json({ thread, messages: messages ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
