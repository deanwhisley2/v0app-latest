import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { casCreditNexusMainOnly } from "@/lib/server/nexus-main-enforcement"
import { estimateCopyForcePulloutUsd } from "@/lib/copy-trade-policy"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { getTradingUserLevel } from "@/lib/server/security-authz"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2) {
      return NextResponse.json(
        { error: "Retailer accounts are operational liquidity desks and cannot manage copy-trade sessions." },
        { status: 403 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string
      floatingPnLUsd?: number
      coinImpactFraction?: number
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    }

    const floatingPnLUsd = Number(body.floatingPnLUsd ?? 0)
    const coinImpactFraction =
      body.coinImpactFraction !== undefined ? Number(body.coinImpactFraction) : 0

    const admin = createAdminClient()
    const { data: row, error: fErr } = await admin
      .from("copy_trade_sessions")
      .select("id,user_id,stake_amount,status")
      .eq("id", sessionId)
      .maybeSingle()
    if (fErr) throw new Error(fErr.message)
    if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (row.status !== "active") {
      return NextResponse.json({ error: "Session already closed" }, { status: 400 })
    }

    const stakeUsd = roundUsd2(Number(row.stake_amount ?? 0))
    const settlement = estimateCopyForcePulloutUsd({
      stakeUsd,
      floatingPnLUsd: Number.isFinite(floatingPnLUsd) ? floatingPnLUsd : 0,
      coinImpactFraction: Number.isFinite(coinImpactFraction) ? coinImpactFraction : 0,
    })

    const netToMain = settlement.netToMainUsd
    const now = new Date().toISOString()

    const { data: claimed, error: claimErr } = await admin
      .from("copy_trade_sessions")
      .update({ settled_at: now })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("settled_at", null)
      .select("id")
      .maybeSingle()
    if (claimErr) throw new Error(claimErr.message)
    if (!claimed) {
      return NextResponse.json({ error: "Session is already being settled or was closed." }, { status: 409 })
    }

    let credited: Awaited<ReturnType<typeof casCreditNexusMainOnly>>
    try {
      credited = await casCreditNexusMainOnly(admin, user.id, netToMain)
    } catch (creditErr) {
      await admin.from("copy_trade_sessions").update({ settled_at: null }).eq("id", sessionId).eq("user_id", user.id)
      throw creditErr
    }

    const { error: upErr } = await admin
      .from("copy_trade_sessions")
      .update({ status: "closed", closed_at: now })
      .eq("id", sessionId)
      .eq("user_id", user.id)
    if (upErr) throw new Error(upErr.message)

    await recordFinancialEvent({
      userId: user.id,
      eventType: "copy_trade_session_settled",
      category: "trade",
      amount: roundUsd2(netToMain),
      feeAmount: roundUsd2(settlement.cancelFeeUsd + settlement.withdrawFeeUsd),
      balanceSource: "copy_trade_session_lock",
      balanceDestination: "available_balance",
      status: "completed",
      relatedTradeId: sessionId,
      actorType: "user",
      actorId: user.id,
      summary: `Copy-trade closed — net ${roundUsd2(netToMain)} USD credited to Nexus Main after modeled fees.`,
      metadata: {
        stakeUsd,
        floatingPnLUsd,
        coinImpactFraction,
        grossBeforeFeesUsd: settlement.grossBeforeFeesUsd,
        cancelFeeUsd: settlement.cancelFeeUsd,
        withdrawFeeUsd: settlement.withdrawFeeUsd,
      },
    })

    return NextResponse.json({
      ok: true,
      settlement: {
        stakeUsd,
        grossBeforeFeesUsd: settlement.grossBeforeFeesUsd,
        cancelFeeUsd: settlement.cancelFeeUsd,
        withdrawFeeUsd: settlement.withdrawFeeUsd,
        netToMainUsd: settlement.netToMainUsd,
      },
      balances: { available_balance: credited.available_balance },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
