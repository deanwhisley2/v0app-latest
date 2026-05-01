/**
 * Binance API Proxy Route
 * 
 * This server-side route proxies requests to Binance's public API,
 * bypassing browser CORS restrictions. All endpoints are READ-ONLY.
 * 
 * Usage: GET /api/binance?endpoint=/api/v3/ticker/price&symbol=BTCUSDT
 */

import { NextRequest, NextResponse } from "next/server"

const BINANCE_BASE = "https://api.binance.com"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get("endpoint")

  if (!endpoint) {
    return NextResponse.json({ error: "Missing 'endpoint' query parameter" }, { status: 400 })
  }

  // SAFETY: Only allow GET endpoints (read-only)
  const allowedPrefixes = [
    "/api/v3/ticker/price",
    "/api/v3/ticker/24hr",
    "/api/v3/klines",
    "/api/v3/depth",
    "/api/v3/trades",
    "/api/v3/exchangeInfo",
    "/api/v3/time",
    "/api/v3/avgPrice",
  ]

  const isAllowed = allowedPrefixes.some((prefix) => endpoint.startsWith(prefix))
  if (!isAllowed) {
    return NextResponse.json({ error: "Endpoint not allowed (read-only mode)" }, { status: 403 })
  }

  // Forward all query params except 'endpoint'
  const params = new URLSearchParams()
  for (const [key, value] of searchParams.entries()) {
    if (key !== "endpoint") {
      params.set(key, value)
    }
  }

  const queryString = params.toString()
  const url = `${BINANCE_BASE}${endpoint}${queryString ? `?${queryString}` : ""}`

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Binance HTTP ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch from Binance" },
      { status: 502 }
    )
  }
}
