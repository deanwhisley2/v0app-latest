import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { assertRealTradeApiSecret } from "@/lib/server/trade-api-auth"
import {
  getBinanceCredentialsFromEnv,
  binanceMarketSellBase,
  waitOrderTerminal,
  binanceCancelOrder,
} from "@/lib/server/binance-signed-order"

/**
 * POST /api/trade/close
 * Body: { symbol, orderId? } — if orderId, cancel that open order; else MARKET SELL baseQuantity (or free balance stub: require baseQuantity).
 */
export async function POST(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    assertRealTradeApiSecret(request)
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Auth" }, { status })
  }

  if (process.env.NEXUS_REAL_TRADING !== "1") {
    return NextResponse.json({ ok: false, error: "NEXUS_REAL_TRADING=1 required" }, { status: 403 })
  }

  let body: { symbol?: string; orderId?: number; baseQuantity?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : ""
  const pair = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`
  if (!pair) return NextResponse.json({ ok: false, error: "symbol required" }, { status: 400 })

  const creds = getBinanceCredentialsFromEnv()
  if (!creds) return NextResponse.json({ ok: false, error: "Binance keys missing" }, { status: 500 })

  if (body.orderId != null && Number.isFinite(Number(body.orderId))) {
    await binanceCancelOrder(pair, Number(body.orderId), creds.apiKey, creds.apiSecret)
    return NextResponse.json({ ok: true, cancelled: body.orderId })
  }

  const qty = body.baseQuantity
  if (!qty || !Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json(
      { ok: false, error: "Provide orderId to cancel, or baseQuantity for MARKET SELL" },
      { status: 400 }
    )
  }

  const raw = await binanceMarketSellBase(pair, String(qty), creds.apiKey, creds.apiSecret)
  const terminal = await waitOrderTerminal(pair, raw.orderId, creds.apiKey, creds.apiSecret, 90_000)
  console.log("[api/trade/close] MARKET SELL", pair, terminal)
  return NextResponse.json({ ok: terminal.status === "FILLED", binance: terminal })
}
