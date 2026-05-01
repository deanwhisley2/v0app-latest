import { NextRequest, NextResponse } from "next/server"

/**
 * Bitget Exchange Balance API
 * 
 * Fetches REAL account balance from Bitget using their API.
 * Uses HMAC-SHA256 signature for authentication.
 */

const BITGET_API_BASE = "https://api.bitget.com"

/**
 * Bitget V2 API signature generation
 * V2 uses base64-encoded HMAC-SHA256 signature
 * The string to sign is: timestamp + method + requestPath + body (if any)
 */
async function generateBitgetSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  bodyStr: string,
  secretKey: string
): Promise<string> {
  const message = timestamp + method.toUpperCase() + requestPath + bodyStr
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  )
  // V2 uses base64 encoding, not hex
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return base64Sig
}

async function bitgetRequest(
  method: string,
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  apiPassphrase: string,
  body?: Record<string, any>
) {
  const timestamp = Date.now().toString()
  const bodyStr = body ? JSON.stringify(body) : ""
  
  // Generate V2 signature (base64 encoded)
  const signature = await generateBitgetSignature(
    timestamp,
    method,
    endpoint,
    bodyStr,
    apiSecret
  )

  const headers: Record<string, string> = {
    "ACCESS-KEY": apiKey,
    "ACCESS-SIGN": signature,
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": apiPassphrase,
    "Content-Type": "application/json",
    "locale": "en-US",
  }

  const url = `${BITGET_API_BASE}${endpoint}`
  
  const response = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
  })

  const data = await response.json()
  return data
}


// Coin prices cache (updated every 60s)
let pricesCache: Record<string, number> = {}
let lastPriceFetch = 0

async function getPrices(): Promise<Record<string, number>> {
  const now = Date.now()
  if (now - lastPriceFetch < 60000 && Object.keys(pricesCache).length > 0) {
    return pricesCache
  }

  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,cardano,polkadot,dogecoin,avalanche-2,chainlink,matic-network,tron,litecoin,uniswap,cosmos,stellar,filecoin,aptos,arbitrum,optimism,pepe,shiba-inu&vs_currencies=usd", {
      signal: AbortSignal.timeout(5000),
    })
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
    
    // Add USDT and USDC as $1
    prices["USDT"] = 1
    prices["USDC"] = 1
    prices["DAI"] = 1
    prices["BUSD"] = 1
    prices["FDUSD"] = 1
    
    pricesCache = prices
    lastPriceFetch = now
    return prices
  } catch {
    return pricesCache
  }
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, apiSecret, apiPassphrase } = await request.json()

    if (!apiKey || !apiSecret || !apiPassphrase) {
      return NextResponse.json(
        { error: "Missing required fields: apiKey, apiSecret, apiPassphrase" },
        { status: 400 }
      )
    }

    // Fetch account assets from Bitget using V2 API
    const result = await bitgetRequest(
      "GET",
      "/api/v2/spot/account/assets",
      apiKey,
      apiSecret,
      apiPassphrase
    )

    if (!result || result.code !== "00000") {
      return NextResponse.json(
        { error: result?.msg || "Failed to fetch Bitget balance" },
        { status: 400 }
      )
    }

    const prices = await getPrices()
    const assets = result.data || []
    
    const exchangeAssets = assets
      .filter((a: any) => {
        const available = parseFloat(a.available || "0")
        const frozen = parseFloat(a.frozen || "0")
        return available > 0 || frozen > 0
      })
      .map((a: any) => {
        const available = parseFloat(a.available || "0")
        const frozen = parseFloat(a.frozen || "0")
        const price = prices[a.coin] || 0
        const usdValue = (available + frozen) * price
        return {
          coin: a.coin,
          free: a.available || "0",
          locked: a.frozen || "0",
          usdValue,
        }
      })


    const totalUsd = exchangeAssets.reduce(
      (sum: number, a: any) => sum + a.usdValue,
      0
    )

    return NextResponse.json({
      exchangeId: "bitget",
      exchangeName: "Bitget",
      totalUsd,
      assets: exchangeAssets,
      timestamp: Date.now(),
    })
  } catch (error: any) {
    console.error("Bitget balance error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
