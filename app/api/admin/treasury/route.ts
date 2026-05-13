import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { currencyEngine } from "@/lib/financial/currency-engine"
import { treasury } from "@/lib/financial/treasury-authority"

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const treasuryUsd = await treasury.getTreasuryBalance("MAIN_TREASURY")
    const currencies = ["UGX", "KES", "NGN"]
    const localEquivalents: Record<string, string> = {}
    for (const c of currencies) {
      const localAmount = await currencyEngine.toLocal(treasuryUsd, c)
      localEquivalents[c] = currencyEngine.formatForUser(localAmount, c)
    }

    return NextResponse.json({
      treasury: {
        usd: treasuryUsd,
        usdFormatted: currencyEngine.formatForUser(treasuryUsd, "USD"),
        localEquivalents,
      },
      message: "Treasury operates in USD. Local equivalents are informational only.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}

