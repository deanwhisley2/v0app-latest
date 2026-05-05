/**
 * Bitget public API proxy (read-only GET).
 * Forwards to https://api.bitget.com so the browser avoids CORS.
 *
 * Usage: GET /api/bitget?endpoint=/api/v2/spot/market/tickers&symbol=BTCUSDT
 *
 * Private (signed) calls use /api/exchange/balance/bitget or extend with a dedicated auth route.
 */

import { NextRequest, NextResponse } from "next/server"
import { BITGET_API_BASE } from "@/lib/bitget-request"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"

/** Only GET paths that are public market / utility data. */
const ALLOWED_PREFIXES = [
  "/api/v2/public/time",
  "/api/v2/spot/market/tickers",
  "/api/v2/spot/market/candles",
  "/api/v2/spot/market/history-candles",
  "/api/v2/spot/market/orderbook",
  "/api/v2/spot/market/merge-depth",
  "/api/v2/spot/market/fills",
  "/api/v2/spot/market/fills-history",
  "/api/v2/spot/market/support-symbols",
  "/api/v2/mix/market/ticker",
  "/api/v2/mix/market/tickers",
  "/api/v2/mix/market/candles",
  "/api/v2/mix/market/orderbook",
] as const

export async function GET(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get("endpoint")

  if (!endpoint) {
    return NextResponse.json({ error: "Missing 'endpoint' query parameter" }, { status: 400 })
  }

  const allowed = ALLOWED_PREFIXES.some((prefix) => endpoint.startsWith(prefix))
  if (!allowed) {
    return NextResponse.json({ error: "Endpoint not allowed (read-only public paths only)" }, { status: 403 })
  }

  const params = new URLSearchParams()
  for (const [key, value] of searchParams.entries()) {
    if (key !== "endpoint") params.set(key, value)
  }
  const qs = params.toString()
  const url = `${BITGET_API_BASE}${endpoint}${qs ? `?${qs}` : ""}`

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })

    const text = await response.text()
    let data: unknown
    try {
      data = JSON.parse(text) as unknown
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from Bitget", raw: text.slice(0, 200) },
        { status: 502 }
      )
    }

    if (!response.ok) {
      return NextResponse.json(
        typeof data === "object" && data !== null && "msg" in data
          ? data
          : { error: `Bitget HTTP ${response.status}`, data },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch from Bitget"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
