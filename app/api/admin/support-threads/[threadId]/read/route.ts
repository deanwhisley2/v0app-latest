import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

/** Level 5: mark thread read for admin queue (unread_for_admin = false). */
export async function PATCH(request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { threadId } = await ctx.params
    const tid = typeof threadId === "string" ? threadId.trim() : ""
    if (!tid) return NextResponse.json({ error: "threadId required." }, { status: 400 })

    const now = new Date().toISOString()
    const admin = createAdminClient()
    const { error } = await admin
      .from("operational_support_threads")
      .update({ unread_for_admin: false, updated_at: now })
      .eq("id", tid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
