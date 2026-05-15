import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { currencyEngine } from "@/lib/financial/currency-engine"
import { treasury } from "@/lib/financial/treasury-authority"
import {
  isTreasuryPoolWallet,
  TREASURY_POOL_AUTO_APPROVAL,
  TREASURY_POOL_RESERVE,
  treasuryPoolLabel,
} from "@/lib/server/treasury-pool-types"
import { transferTreasuryBetweenPools } from "@/lib/server/treasury-pool-transfer"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      fromPool?: string
      toPool?: string
      amountUsd?: number
      reason?: string
    }

    const fromPool = String(body.fromPool ?? "").trim()
    const toPool = String(body.toPool ?? "").trim()
    if (!isTreasuryPoolWallet(fromPool) || !isTreasuryPoolWallet(toPool)) {
      return NextResponse.json(
        {
          error:
            "fromPool and toPool must be MAIN_TREASURY (auto-approval) or OPERATIONAL (reserve).",
        },
        { status: 400 },
      )
    }

    const amountUsd = roundUsd2(Number(body.amountUsd ?? 0))
    if (!(amountUsd > 0)) {
      return NextResponse.json({ error: "amountUsd must be positive." }, { status: 400 })
    }

    const reason =
      (body.reason ?? `L5 transfer ${treasuryPoolLabel(fromPool)} → ${treasuryPoolLabel(toPool)}`).trim().slice(0, 500)

    const admin = createAdminClient()
    const out = await transferTreasuryBetweenPools(admin, {
      fromPool,
      toPool,
      amountUsd,
      reason,
      initiatedBy: actor.id,
    })

    const autoUsd = await treasury.getTreasuryBalance(TREASURY_POOL_AUTO_APPROVAL)
    const reserveUsd = await treasury.getTreasuryBalance(TREASURY_POOL_RESERVE)

    return NextResponse.json({
      ok: true,
      transferredUsd: amountUsd,
      fromPool,
      toPool,
      balances: {
        MAIN_TREASURY: {
          usd: autoUsd,
          usdFormatted: currencyEngine.formatForUser(autoUsd, "USD"),
          label: treasuryPoolLabel(TREASURY_POOL_AUTO_APPROVAL),
        },
        OPERATIONAL: {
          usd: reserveUsd,
          usdFormatted: currencyEngine.formatForUser(reserveUsd, "USD"),
          label: treasuryPoolLabel(TREASURY_POOL_RESERVE),
        },
      },
      fromBalanceUsd: out.fromBalanceUsd,
      toBalanceUsd: out.toBalanceUsd,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
