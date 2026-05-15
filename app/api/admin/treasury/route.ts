import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
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
import { roundUsd2 } from "@/lib/nexus-financial-policy"

async function poolSnapshot(wallet: "MAIN_TREASURY" | "OPERATIONAL") {
  const usd = await treasury.getTreasuryBalance(wallet)
  return {
    usd,
    usdFormatted: currencyEngine.formatForUser(usd, "USD"),
    label: treasuryPoolLabel(wallet),
    pool: wallet,
  }
}

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const autoUsd = await treasury.getTreasuryBalance(TREASURY_POOL_AUTO_APPROVAL)

    const currencies = ["UGX", "KES", "NGN"]
    const localEquivalents: Record<string, string> = {}
    for (const c of currencies) {
      const localAmount = await currencyEngine.toLocal(autoUsd, c)
      localEquivalents[c] = currencyEngine.formatForUser(localAmount, c)
    }

    const autoSnap = await poolSnapshot(TREASURY_POOL_AUTO_APPROVAL)
    const reserveSnap = await poolSnapshot(TREASURY_POOL_RESERVE)

    return NextResponse.json({
      pools: {
        MAIN_TREASURY: autoSnap,
        OPERATIONAL: reserveSnap,
      },
      treasury: {
        ...autoSnap,
        localEquivalents,
      },
      message:
        "Company treasury: auto-approval float (MAIN_TREASURY) for credits and approvals; reserve (OPERATIONAL) for bulk liquidity. Not your personal Nexus Main balance.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}

/** Level 5: credit USD to reserve (default) or auto-approval float. */
export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      amountUsd?: number
      reason?: string
      targetPool?: string
    }
    const amountUsd = roundUsd2(Number(body.amountUsd ?? 0))
    if (!(amountUsd > 0)) {
      return NextResponse.json({ error: "amountUsd must be positive." }, { status: 400 })
    }
    const targetRaw = String(body.targetPool ?? TREASURY_POOL_RESERVE).trim()
    if (!isTreasuryPoolWallet(targetRaw)) {
      return NextResponse.json(
        { error: "targetPool must be MAIN_TREASURY or OPERATIONAL." },
        { status: 400 },
      )
    }
    const reason = (body.reason ?? "Level-5 treasury funding").trim().slice(0, 240)

    const tr = await treasury.mutateTreasury(
      "CREDIT",
      amountUsd,
      `l5_treasury_fund:${randomUUID()}`,
      reason,
      actor.id,
      targetRaw,
    )
    if (!tr.success) {
      return NextResponse.json({ error: tr.error ?? "Treasury credit failed." }, { status: 409 })
    }

    const autoSnap = await poolSnapshot(TREASURY_POOL_AUTO_APPROVAL)
    const reserveSnap = await poolSnapshot(TREASURY_POOL_RESERVE)

    return NextResponse.json({
      ok: true,
      creditedUsd: amountUsd,
      targetPool: targetRaw,
      pools: {
        MAIN_TREASURY: autoSnap,
        OPERATIONAL: reserveSnap,
      },
      treasury: autoSnap,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}

