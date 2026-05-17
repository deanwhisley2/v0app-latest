/**
 * Binance Exchange Balance API
 * 
 * Fetches REAL account balance from Binance using their authenticated API.
 * Uses HMAC-SHA256 signature for authentication.
 * READ-ONLY - Only fetches account balances, never places trades.
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { getExchangeBalanceUsdPrices } from "@/lib/server/exchange-balance-usd-prices"

const BINANCE_BASE = "https://api.binance.com"

// ============================================================
// Binance API Signature Generation
// ============================================================

/**
 * Generate a Binance API signature using HMAC-SHA256.
 */
function generateSignature(queryString: string, secretKey: string): string {
  return crypto
    .createHmac("sha256", secretKey)
    .update(queryString)
    .digest("hex")
}

// ============================================================
// Coin prices cache (updated every 60s)
// ============================================================

async function getPrices(): Promise<Record<string, number>> {
  try {
    const prices = await getExchangeBalanceUsdPrices()
    return {
      ...prices,
      USDT: 1,
      USDC: 1,
      DAI: 1,
      BUSD: 1,
      FDUSD: 1,
      TUSD: 1,
      USDP: 1,
    }
  } catch {
    return { USDT: 1, USDC: 1 }
  }
}

// ============================================================
// Request Handler
// ============================================================

export async function POST(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    const body = await request.json().catch(() => ({}))
    const envKey = process.env.BINANCE_API_KEY?.trim()
    const envSecret =
      process.env.BINANCE_SECRET_KEY?.trim() || process.env.BINANCE_API_SECRET?.trim()
    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    let apiSecret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : ""
    if (!apiKey || !apiSecret) {
      if (envKey && envSecret) {
        apiKey = envKey
        apiSecret = envSecret
      } else {
        return NextResponse.json(
          {
            error:
              "Missing apiKey/apiSecret in body, or set BINANCE_API_KEY and BINANCE_SECRET_KEY on the server.",
          },
          { status: 400 }
        )
      }
    }

    // Build query parameters for Binance account endpoint
    const params = new URLSearchParams()
    params.set("timestamp", Date.now().toString())

    // Generate signature
    const queryString = params.toString()
    const signature = generateSignature(queryString, apiSecret)
    params.set("signature", signature)

    // Fetch account info from Binance
    const url = `${BINANCE_BASE}/api/v3/account?${params.toString()}`
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

    // Get prices for USD conversion
    const prices = await getPrices()

    // Filter and map balances to the standard format
    const assets = (data.balances || [])
      .filter((b: any) => {
        const free = parseFloat(b.free || "0")
        const locked = parseFloat(b.locked || "0")
        return free > 0 || locked > 0
      })
      .map((b: any) => {
        const free = parseFloat(b.free || "0")
        const locked = parseFloat(b.locked || "0")
        const price = prices[b.asset] || 0
        const usdValue = (free + locked) * price
        return {
          coin: b.asset,
          free: b.free || "0",
          locked: b.locked || "0",
          usdValue,
        }
      })

    const totalUsd = assets.reduce((sum: number, a: any) => sum + a.usdValue, 0)

    return NextResponse.json({
      exchangeId: "binance",
      exchangeName: "Binance",
      totalUsd,
      assets,
      timestamp: Date.now(),
    })
  } catch (error: any) {
    console.error("Binance balance error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
