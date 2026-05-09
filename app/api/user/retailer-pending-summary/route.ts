import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { sumPendingIncomingForRetailer } from "@/lib/server/retailer-funding-helpers"

/** Level 2 retailer: pending mobile-money requests block fix/withdraw per product rules. */
export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const level = await getTradingUserLevel(user.id)
    if (level !== 2) {
      return NextResponse.json({ pendingIncomingTotal: 0, hasRetailerProfile: false, opsBlocked: false })
    }
    const admin = createAdminClient()
    const { data: prof } = await admin.from("retailer_profiles").select("id").eq("user_id", user.id).maybeSingle()
    if (!prof?.id) {
      return NextResponse.json({ pendingIncomingTotal: 0, hasRetailerProfile: false, opsBlocked: false })
    }
    const pendingIncomingTotal = await sumPendingIncomingForRetailer(admin, prof.id)
    return NextResponse.json({
      pendingIncomingTotal,
      hasRetailerProfile: true,
      opsBlocked: pendingIncomingTotal > 0,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
