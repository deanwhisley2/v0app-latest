/**
 * Binance Exchange Balance API
 * 
 * Fetches REAL account balance from Binance using their authenticated API.
 * Uses HMAC-SHA256 signature for authentication.
 * READ-ONLY - Only fetches account balances, never places trades.
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

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

let pricesCache: Record<string, number> = {}
let lastPriceFetch = 0

async function getPrices(): Promise<Record<string, number>> {
  const now = Date.now()
  if (now - lastPriceFetch < 60000 && Object.keys(pricesCache).length > 0) {
    return pricesCache
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,cardano,polkadot,dogecoin,avalanche-2,chainlink,matic-network,tron,litecoin,uniswap,cosmos,stellar,filecoin,aptos,arbitrum,optimism,pepe,shiba-inu&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) }
    )
    const data = await response.json()

    const coinToSymbol: Record<string, string> = {
      bitcoin: "BTC",
      ethereum: "ETH",
      solana: "SOL",
      ripple: "XRP",
      cardano: "ADA",
      polkadot: "DOT",
      dogecoin: "DOGE",
      "avalanche-2": "AVAX",
      chainlink: "LINK",
      "matic-network": "MATIC",
      tron: "TRX",
      litecoin: "LTC",
      uniswap: "UNI",
      cosmos: "ATOM",
      stellar: "XLM",
      filecoin: "FIL",
      aptos: "APT",
      arbitrum: "ARB",
      optimism: "OP",
      pepe: "PEPE",
      "shiba-inu": "SHIB",
    }

    const prices: Record<string, number> = {}
    for (const [coinId, symbol] of Object.entries(coinToSymbol)) {
      if (data[coinId]?.usd) {
        prices[symbol] = data[coinId].usd
      }
    }

    // Add stablecoins as $1
    prices["USDT"] = 1
    prices["USDC"] = 1
    prices["DAI"] = 1
    prices["BUSD"] = 1
    prices["FDUSD"] = 1
    prices["TUSD"] = 1
    prices["USDP"] = 1

    pricesCache = prices
    lastPriceFetch = now
    return prices
  } catch {
    return pricesCache
  }
}

// ============================================================
// Request Handler
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { apiKey, apiSecret } = await request.json()

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "Missing required fields: apiKey, apiSecret" },
        { status: 400 }
      )
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
