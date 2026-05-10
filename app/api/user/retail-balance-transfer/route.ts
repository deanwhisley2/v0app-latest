import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { transferRetailPoolInternal } from "@/lib/server/retailer-funding-helpers"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level !== 2) {
      return NextResponse.json({ error: "Retail Balance transfers are for Level 2 retailer accounts." }, { status: 403 })
    }
    const body = (await request.json().catch(() => ({}))) as {
      direction?: "to_retail" | "to_nexus"
      amount?: number
    }
    const direction = body.direction
    const amount = Number(body.amount ?? 0)
    if (direction !== "to_retail" && direction !== "to_nexus") {
      return NextResponse.json({ error: "direction must be to_retail or to_nexus." }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be > 0." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: desk } = await admin.from("retailer_profiles").select("id").eq("user_id", user.id).maybeSingle()
    if (!desk?.id) {
      return NextResponse.json({ error: "Configure your retailer desk before moving Retail Balance." }, { status: 400 })
    }

    const balances = await transferRetailPoolInternal(admin, user.id, direction, amount)
    await recordFinancialEvent({
      userId: user.id,
      eventType: direction === "to_retail" ? "retail_balance_topup_from_nexus" : "retail_balance_to_nexus_main",
      category: "internal_transfer",
      amount,
      balanceSource: direction === "to_retail" ? "nexus_main_available" : "retail_balance",
      balanceDestination: direction === "to_retail" ? "retail_balance" : "nexus_main_available",
      status: "completed",
      actorType: "retailer",
      actorId: user.id,
      summary:
        direction === "to_retail"
          ? "Moved liquidity from Nexus Main into Retail Balance (operational float)."
          : "Moved liquidity from Retail Balance back to Nexus Main.",
      metadata: { retailerProfileId: desk.id },
    })

    return NextResponse.json({ ok: true, ...balances })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 400 })
  }
}
