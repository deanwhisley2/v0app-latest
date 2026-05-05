import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { assertRealTradeApiSecret } from "@/lib/server/trade-api-auth"
import { getBinanceCredentialsFromEnv, binanceOpenOrders } from "@/lib/server/binance-signed-order"

export async function GET(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    assertRealTradeApiSecret(request)
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: e instanceof Error ? e.message : "Auth" }, { status })
  }

  const creds = getBinanceCredentialsFromEnv()
  if (!creds) {
    return NextResponse.json({ error: "Binance env keys missing" }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const sym = searchParams.get("symbol")?.trim()
  const orders = await binanceOpenOrders(sym || undefined, creds.apiKey, creds.apiSecret)
  return NextResponse.json({ ok: true, orders })
}
