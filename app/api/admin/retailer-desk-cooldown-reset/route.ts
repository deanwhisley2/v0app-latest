import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

/** Level 5: clear payment-numbers edit cooldown so retailer can update MoMo lines before 7 days (support escalation). */
export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)
    const body = (await request.json().catch(() => ({}))) as { retailerUserId?: string }
    const retailerUserId = typeof body.retailerUserId === "string" ? body.retailerUserId.trim() : ""
    if (!retailerUserId) {
      return NextResponse.json({ error: "retailerUserId required." }, { status: 400 })
    }
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { error } = await admin
      .from("retailer_profiles")
      .update({ payment_numbers_updated_at: null, updated_at: now })
      .eq("user_id", retailerUserId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
