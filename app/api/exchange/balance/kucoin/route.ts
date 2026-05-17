/**
 * KuCoin spot account list (read-only). GET /api/v1/accounts?type=trade
 * Credentials: JSON body or env KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE
 * Optional: KUCOIN_KEY_VERSION=1|2 (default 2)
 */

import { NextRequest, NextResponse } from "next/server"
import { kucoinPrivateGet } from "@/lib/kucoin-request"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { getExchangeBalanceUsdPrices } from "@/lib/server/exchange-balance-usd-prices"

async function getUsdPrices(): Promise<Record<string, number>> {
  try {
    const prices = await getExchangeBalanceUsdPrices()
    return { ...prices, USDT: 1, USDC: 1, DAI: 1, BUSD: 1, TUSD: 1 }
  } catch {
    return { USDT: 1, USDC: 1 }
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
