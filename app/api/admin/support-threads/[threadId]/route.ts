import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

export async function GET(request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { threadId } = await ctx.params
    const tid = typeof threadId === "string" ? threadId.trim() : ""
    if (!tid) return NextResponse.json({ error: "threadId required." }, { status: 400 })

    const admin = createAdminClient()
    const { data: thread, error: te } = await admin.from("operational_support_threads").select("*").eq("id", tid).maybeSingle()
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
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
