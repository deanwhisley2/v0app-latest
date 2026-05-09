import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"

function parsePnL(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Bot / server scripts: header `x-trade-secret` must match PROCESS_TRADE_SECRET. */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    const secret = process.env.PROCESS_TRADE_SECRET
    const headerSecret = request.headers.get("x-trade-secret")
    if (!secret || headerSecret !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const userId = typeof body.user_id === "string" ? body.user_id.trim() : ""
    const pnl = parsePnL(body.pnl ?? body.net_profit ?? body.profit_loss)
    const stakeDeltaRaw = body.current_stake_delta
    const stakeDelta =
      stakeDeltaRaw === undefined ? 0 : parsePnL(stakeDeltaRaw)

    const symbol = typeof body.symbol === "string" ? body.symbol.trim() || null : null
    const strategy = typeof body.strategy === "string" ? body.strategy.trim() || null : null
    const externalRef =
      typeof body.external_ref === "string" ? body.external_ref.trim() || null : null
    const metadata =
      body.metadata !== undefined && body.metadata !== null && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : null

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 })
    }
    if (pnl === null) {
      return NextResponse.json({ error: "pnl must be a finite number" }, { status: 400 })
    }
    if (stakeDelta === null) {
      return NextResponse.json({ error: "current_stake_delta must be a finite number" }, { status: 400 })
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    const { error: ledgerErr } = await admin.from("bot_trade_records").insert({
      user_id: userId,
      pnl,
      current_stake_delta: stakeDelta,
      symbol,
      strategy,
      external_ref: externalRef,
      metadata,
    })

    if (ledgerErr) {
      if (ledgerErr.code === "23505") {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          message: "Trade already recorded for this external_ref.",
        })
      }
      const skipLedger =
        ledgerErr.code === "42P01" ||
        (ledgerErr.message ?? "").includes("bot_trade_records") ||
        (ledgerErr.message ?? "").includes("does not exist")
      if (skipLedger) {
        console.warn(
          "bot_trade_records unavailable — balances still updated. Apply supabase/trading_platform_schema.sql:",
          ledgerErr.message
        )
      } else {
        console.error("bot_trade_records insert:", ledgerErr)
        return NextResponse.json({ error: "Could not record trade row" }, { status: 500 })
      }
    }

    const { data: existing, error: selErr } = await admin
      .from("user_balances")
      .select("total_earnings, current_stake, available_balance")
      .eq("user_id", userId)
      .maybeSingle()

    if (selErr) {
      console.error("trades/record select:", selErr)
      return NextResponse.json({ error: "Balance lookup failed" }, { status: 500 })
    }

    const totalEarnings = Number(existing?.total_earnings ?? 0) + pnl
    const available = Number(existing?.available_balance ?? 0) + pnl
    const stake = Number(existing?.current_stake ?? 0) + stakeDelta

    const { error: upsertErr } = await admin.from("user_balances").upsert(
      {
        user_id: userId,
        total_earnings: totalEarnings,
        available_balance: available,
        current_stake: stake,
        last_updated: nowIso,
      },
      { onConflict: "user_id" }
    )

    if (upsertErr) {
      console.error("trades/record upsert:", upsertErr)
      return NextResponse.json({ error: "Could not record trade" }, { status: 500 })
    }

    await recordFinancialEvent({
      userId,
      eventType: pnl >= 0 ? "trade_completed_profit" : "trade_completed_loss",
      category: "trade",
      amount: Math.abs(pnl),
      feeAmount: 0,
      balanceSource: pnl >= 0 ? "trade_session" : "available_balance",
      balanceDestination: pnl >= 0 ? "available_balance" : "trade_loss",
      status: "completed",
      actorType: "bot",
      actorId: "trade-recorder",
      transactionRef: externalRef,
      relatedTradeId: externalRef,
      summary: `Trade ${pnl >= 0 ? "profit" : "loss"} posted for ${symbol ?? "unknown"} (${pnl.toFixed(2)}).`,
      metadata: { strategy, stakeDelta },
    })

    return NextResponse.json({
      ok: true,
      total_earnings: totalEarnings,
      available_balance: available,
      current_stake: stake,
      last_updated: nowIso,
    })
  } catch (e) {
    console.error("/api/trades/record:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
