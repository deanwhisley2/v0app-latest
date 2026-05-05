/**
 * KuCoin public REST proxy (read-only GET).
 * GET /api/kucoin?endpoint=/api/v1/market/stats&symbol=BTC-USDT
 */

import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"

const KUCOIN_PUBLIC_BASE = "https://api.kucoin.com"

const ALLOWED_PREFIXES = [
  "/api/v1/market/stats",
  "/api/v1/market/orderbook/level2_20",
  "/api/v1/market/orderbook/level2_100",
  "/api/v1/market/candles",
  "/api/v1/market/histories",
  "/api/v1/timestamp",
  "/api/v1/symbols",
  "/api/v1/market/allTickers",
] as const

export async function GET(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get("endpoint")
  if (!endpoint) {
    return NextResponse.json({ error: "Missing 'endpoint' query parameter" }, { status: 400 })
  }

  const allowed = ALLOWED_PREFIXES.some((p) => endpoint.startsWith(p))
  if (!allowed) {
    return NextResponse.json({ error: "Endpoint not allowed (read-only public paths only)" }, { status: 403 })
  }

  const params = new URLSearchParams()
  for (const [k, v] of searchParams.entries()) {
    if (k !== "endpoint") params.set(k, v)
  }
  const qs = params.toString()
  const url = `${KUCOIN_PUBLIC_BASE}${endpoint}${qs ? `?${qs}` : ""}`

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })
    const text = await response.text()
    let data: unknown
    try {
      data = JSON.parse(text) as unknown
    } catch {
      return NextResponse.json({ error: "Invalid JSON from KuCoin", raw: text.slice(0, 200) }, { status: 502 })
    }
    if (!response.ok) {
      return NextResponse.json(
        typeof data === "object" && data !== null ? data : { error: `KuCoin HTTP ${response.status}` },
        { status: response.status }
      )
    }
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch from KuCoin"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
