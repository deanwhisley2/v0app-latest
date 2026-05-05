/**
 * BINANCE AUTHENTICATED API PROXY
 * 
 * This server-side route proxies authenticated requests to Binance's API.
 * It signs requests with the user's API key/secret for read-only endpoints.
 * 
 * SAFETY: Only allows GET endpoints (read-only).
 * NO TRADE COMMANDS ARE EVER SENT THROUGH THIS PROXY.
 * 
 * Usage: GET /api/binance-auth?endpoint=/api/v3/account
 * Optional query: apiKey, secretKey (otherwise server uses BINANCE_API_KEY + BINANCE_SECRET_KEY from .env.local).
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"

const BINANCE_BASE = "https://api.binance.com"

// ============================================================
// SAFETY: Only these endpoints are allowed (READ-ONLY)
// ============================================================

const ALLOWED_ENDPOINTS = [
  "/api/v3/account",
  "/api/v3/allOrders",
  "/api/v3/myTrades",
  "/api/v3/account/status",
  "/api/v3/depth",
  "/api/v3/klines",
  "/api/v3/ticker/price",
  "/api/v3/ticker/24hr",
  "/api/v3/time",
  "/api/v3/exchangeInfo",
  "/api/v3/avgPrice",
  "/api/v3/ping",
]

// ============================================================
// Binance API Signature Generation
// ============================================================

/**
 * Generate a Binance API signature using HMAC-SHA256.
 * This is required for authenticated endpoints.
 */
function generateSignature(queryString: string, secretKey: string): string {
  return crypto
    .createHmac("sha256", secretKey)
    .update(queryString)
    .digest("hex")
}

// ============================================================
// Request Handler
// ============================================================

export async function GET(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get("endpoint")
  const envKey = process.env.BINANCE_API_KEY?.trim()
  const envSecret =
    process.env.BINANCE_SECRET_KEY?.trim() || process.env.BINANCE_API_SECRET?.trim()
  const apiKey = searchParams.get("apiKey")?.trim() || envKey || ""
  const secretKey = searchParams.get("secretKey")?.trim() || envSecret || ""

  // Validate required parameters
  if (!endpoint) {
    return NextResponse.json({ error: "Missing 'endpoint' query parameter" }, { status: 400 })
  }

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      {
        error:
          "Missing API credentials. Use /api-settings in the browser, or set BINANCE_API_KEY and BINANCE_SECRET_KEY (or BINANCE_API_SECRET) on the server.",
      },
      { status: 401 }
    )
  }

  // SAFETY: Validate endpoint is allowed
  const isAllowed = ALLOWED_ENDPOINTS.some((prefix) => endpoint.startsWith(prefix))
  if (!isAllowed) {
    return NextResponse.json(
      {
        error: `Endpoint '${endpoint}' is not allowed (read-only mode)`,
        allowedEndpoints: ALLOWED_ENDPOINTS,
      },
      { status: 403 }
    )
  }

  // Build query parameters (exclude endpoint, apiKey, secretKey)
  const params = new URLSearchParams()
  for (const [key, value] of searchParams.entries()) {
    if (key !== "endpoint" && key !== "apiKey" && key !== "secretKey") {
      params.set(key, value)
    }
  }

  // Add timestamp (required for authenticated endpoints)
  params.set("timestamp", Date.now().toString())

  // Generate signature
  const queryString = params.toString()
  const signature = generateSignature(queryString, secretKey)
  params.set("signature", signature)

  // Build the full URL
  const url = `${BINANCE_BASE}${endpoint}?${params.toString()}`

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-MBX-APIKEY": apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.msg || `Binance HTTP ${response.status}` },
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

// ============================================================
// SAFETY: Block all non-GET methods
// ============================================================

export async function POST() {
  return NextResponse.json(
    { error: "POST requests are not allowed (read-only mode)" },
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: "DELETE requests are not allowed (read-only mode)" },
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: "PUT requests are not allowed (read-only mode)" },
    { status: 405 }
  )
}
