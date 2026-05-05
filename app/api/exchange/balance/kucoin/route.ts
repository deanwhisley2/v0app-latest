/**
 * KuCoin spot account list (read-only). GET /api/v1/accounts?type=trade
 * Credentials: JSON body or env KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE
 * Optional: KUCOIN_KEY_VERSION=1|2 (default 2)
 */

import { NextRequest, NextResponse } from "next/server"
import { kucoinPrivateGet } from "@/lib/kucoin-request"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"

let pricesCache: Record<string, number> = {}
let lastPriceFetch = 0

async function getUsdPrices(): Promise<Record<string, number>> {
  const now = Date.now()
  if (now - lastPriceFetch < 60000 && Object.keys(pricesCache).length > 0) return pricesCache
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
    for (const [coinId, sym] of Object.entries(coinToSymbol)) {
      if (data[coinId]?.usd) prices[sym] = data[coinId].usd
    }
    prices.USDT = 1
    prices.USDC = 1
    prices.DAI = 1
    prices.BUSD = 1
    prices.TUSD = 1
    pricesCache = prices
    lastPriceFetch = now
    return prices
  } catch {
    return pricesCache
  }
}

type KucoinAccountsResp = {
  code?: string
  msg?: string
  data?: Array<{
    currency?: string
    balance?: string
    available?: string
    holds?: string
    type?: string
  }>
}

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  try {
    const body = await request.json().catch(() => ({}))
    const envKey = process.env.KUCOIN_API_KEY?.trim()
    const envSecret = process.env.KUCOIN_API_SECRET?.trim()
    const envPass = process.env.KUCOIN_API_PASSPHRASE?.trim()
    const envVer = (process.env.KUCOIN_KEY_VERSION?.trim() || "2") as "1" | "2"

    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    let apiSecret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : ""
    let apiPassphrase = typeof body.apiPassphrase === "string" ? body.apiPassphrase.trim() : ""
    const keyVersion = (typeof body.keyVersion === "string" ? body.keyVersion.trim() : envVer) as "1" | "2"

    if (!apiKey || !apiSecret || !apiPassphrase) {
      if (envKey && envSecret && envPass) {
        apiKey = envKey
        apiSecret = envSecret
        apiPassphrase = envPass
      } else {
        return NextResponse.json(
          {
            error:
              "KuCoin requires apiKey, apiSecret, apiPassphrase in JSON, or set KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE. Optional KUCOIN_KEY_VERSION=1|2 (default 2).",
          },
          { status: 400 }
        )
      }
    }

    const pathWithQuery = "/api/v1/accounts?type=trade"
    const res = await kucoinPrivateGet({
      pathWithQuery,
      apiKey,
      apiSecret,
      passphrase: apiPassphrase,
      keyVersion: keyVersion === "1" ? "1" : "2",
    })

    const json = (await res.json()) as KucoinAccountsResp
    if (!res.ok || json.code !== "200000" || !Array.isArray(json.data)) {
      return NextResponse.json(
        { error: json.msg || `KuCoin HTTP ${res.status}` },
        { status: res.ok ? 400 : res.status }
      )
    }

    const prices = await getUsdPrices()
    const byCoin = new Map<string, { free: number; locked: number }>()

    for (const row of json.data) {
      const c = (row.currency || "").toUpperCase()
      if (!c) continue
      const avail = parseFloat(row.available || "0")
      const holds = parseFloat(row.holds || "0")
      const prev = byCoin.get(c) || { free: 0, locked: 0 }
      byCoin.set(c, { free: prev.free + avail, locked: prev.locked + holds })
    }

    const exchangeAssets = [...byCoin.entries()]
      .filter(([, v]) => v.free > 0 || v.locked > 0)
      .map(([coin, v]) => {
        const price = prices[coin] || 0
        const usdValue = (v.free + v.locked) * price
        return {
          coin,
          free: String(v.free),
          locked: String(v.locked),
          usdValue,
        }
      })

    const totalUsd = exchangeAssets.reduce((s, a) => s + a.usdValue, 0)

    return NextResponse.json({
      exchangeId: "kucoin",
      exchangeName: "KuCoin",
      totalUsd,
      assets: exchangeAssets,
      timestamp: Date.now(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error"
    console.error("KuCoin balance error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
