import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { casCreditNexusMainOnly, casReserveCopyTradeStake } from "@/lib/server/nexus-main-enforcement"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  assertCopyStakeUsd,
  resolvePersonaId,
} from "@/lib/server/container-governance"
import { buildCopyTradeLifecycle } from "@/lib/server/copy-trade-lifecycle"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const admin = createAdminClient()
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("trading_user_level, retailer_credit_seller")
      .eq("id", user.id)
      .maybeSingle()
    if (profErr) throw new Error(profErr.message)
    const tradingLv = Number(profile?.trading_user_level ?? 1)
    const retailerDesk = tradingLv === 2 && Boolean(profile?.retailer_credit_seller)
    if (tradingLv === 5 || retailerDesk) {
      return NextResponse.json(
        {
          error:
            "Designated retailer desks and Level-5 accounts cannot open copy-trade sessions.",
        },
        { status: 403 },
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      stakeUsd?: number
      traderPersonaId?: string
    }
    const stakeUsd = Number(body.stakeUsd ?? 0)
    const traderPersonaIdRaw = typeof body.traderPersonaId === "string" ? body.traderPersonaId.trim() : ""
    if (!Number.isFinite(stakeUsd) || !(stakeUsd > 0)) {
      return NextResponse.json({ error: "stakeUsd must be > 0" }, { status: 400 })
    }
    if (!traderPersonaIdRaw) {
      return NextResponse.json({ error: "traderPersonaId required" }, { status: 400 })
    }

    const minStake = assertCopyStakeUsd(stakeUsd)
    if (!minStake.ok) {
      return NextResponse.json({ error: minStake.message }, { status: 400 })
    }

    const persona = await resolvePersonaId(admin, traderPersonaIdRaw, "copy")
    if (!persona) {
      return NextResponse.json(
        { error: "Unknown or inactive copy-trade desk — refresh Container Mode." },
        { status: 400 },
      )
    }

    const reserved = await casReserveCopyTradeStake(admin, user.id, stakeUsd)
    if (!reserved.ok) {
      return NextResponse.json(
        {
          error:
            "Insufficient Nexus Main Account balance for copy-trade allocation. Only Nexus Main may fund desk stakes.",
          code: "INSUFFICIENT_NEXUS_MAIN",
          required: reserved.required,
          available_balance: reserved.available_balance,
        },
        { status: 400 },
      )
    }

    const { data: sessionRow, error: insErr } = await admin
      .from("copy_trade_sessions")
      .insert({
        user_id: user.id,
        trader_persona_id: persona.id,
        stake_amount: roundUsd2(stakeUsd),
        status: "active",
        metadata: { v: 1, ui: { autoAdjust: false }, canonicalPersonaId: persona.id },
      })
      .select("id,created_at")
      .single()

    if (insErr) {
      console.error("[copy-trade/open] session insert failed — refund stake", insErr)
      await casCreditNexusMainOnly(admin, user.id, stakeUsd)
      return NextResponse.json(
        {
          error:
            insErr.message.includes("copy_trade_sessions") || insErr.code === "42P01"
              ? "Database migration missing: apply copy_trade_sessions table (see supabase/migrations)."
              : insErr.message,
        },
        { status: 500 },
      )
    }

    const sessionIdForMeta = sessionRow?.id as string
    const lifecycle = buildCopyTradeLifecycle(roundUsd2(stakeUsd), sessionIdForMeta, user.id)
    const { error: lifeErr } = await admin
      .from("copy_trade_sessions")
      .update({
        metadata: {
          v: 1,
          ui: { autoAdjust: false },
          canonicalPersonaId: persona.id,
          lifecycle,
        },
      })
      .eq("id", sessionIdForMeta)
    if (lifeErr) {
      console.error("[copy-trade/open] lifecycle metadata update failed", lifeErr)
    }

    await recordFinancialEvent({
      userId: user.id,
      eventType: "copy_trade_stake_reserved",
      category: "trade",
      amount: roundUsd2(stakeUsd),
      feeAmount: 0,
      balanceSource: "available_balance",
      balanceDestination: "copy_trade_session_lock",
      status: "completed",
      relatedTradeId: sessionRow?.id as string,
      actorType: "user",
      actorId: user.id,
      summary: `Copy-trade stake reserved from Nexus Main (${roundUsd2(stakeUsd)} USD).`,
      metadata: { traderPersonaId: persona.id, sessionId: sessionRow?.id },
    })

    return NextResponse.json({
      ok: true,
      sessionId: sessionRow?.id as string,
      createdAt: sessionRow?.created_at as string,
      balances: { available_balance: reserved.available_balance },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
