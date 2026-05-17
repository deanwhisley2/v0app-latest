/**
 * Bitget spot balances (read-only). Uses Bitget V2 REST + HMAC-SHA256 + Base64 signature.
 * Keys: request body, or server env BITGET_API_KEY + BITGET_API_SECRET + BITGET_PASSPHRASE.
 *
 * @see https://www.bitget.com/api-doc/common/signature
 */

import { NextRequest, NextResponse } from "next/server"
import { bitgetPrivateRequest } from "@/lib/bitget-request"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { getExchangeBalanceUsdPrices } from "@/lib/server/exchange-balance-usd-prices"

async function getUsdPrices(): Promise<Record<string, number>> {
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

type BitgetAssetsResponse = {
  code?: string | number
  msg?: string
  data?: Array<{
    coin?: string
    available?: string
    frozen?: string
  }>
}

export async function POST(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  try {
    const body = await request.json().catch(() => ({}))
    const envKey = process.env.BITGET_API_KEY?.trim()
    const envSecret =
      process.env.BITGET_API_SECRET?.trim() ||
      process.env.BITGET_SECRET_KEY?.trim() ||
      process.env.BITGET_API_SECRET_KEY?.trim()
    const envPass = process.env.BITGET_PASSPHRASE?.trim()

    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    let apiSecret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : ""
    let apiPassphrase = typeof body.apiPassphrase === "string" ? body.apiPassphrase.trim() : ""

    if (!apiKey || !apiSecret || !apiPassphrase) {
      if (envKey && envSecret && envPass) {
        apiKey = envKey
        apiSecret = envSecret
        apiPassphrase = envPass
      } else {
        return NextResponse.json(
          {
            error:
              "Bitget requires apiKey, apiSecret, and apiPassphrase in the JSON body, or set BITGET_API_KEY, BITGET_API_SECRET (or BITGET_SECRET_KEY), and BITGET_PASSPHRASE on the server.",
          },
          { status: 400 }
        )
      }
    }

    const result = await bitgetPrivateRequest<BitgetAssetsResponse>({
      method: "GET",
      requestPath: "/api/v2/spot/account/assets",
      apiKey,
      apiSecret,
      apiPassphrase,
    })

    const ok = String(result?.code ?? "") === "00000"
    if (!ok || !result?.data) {
      return NextResponse.json(
        { error: result?.msg || "Failed to fetch Bitget balance" },
        { status: 400 }
      )
    }

    const prices = await getUsdPrices()
    const assets = result.data

    const exchangeAssets = assets
      .filter((a) => {
        const available = parseFloat(a.available || "0")
        const frozen = parseFloat(a.frozen || "0")
        return available > 0 || frozen > 0
      })
      .map((a) => {
        const available = parseFloat(a.available || "0")
        const frozen = parseFloat(a.frozen || "0")
        const sym = (a.coin || "").toUpperCase()
        const price = prices[sym] || 0
        const usdValue = (available + frozen) * price
        return {
          coin: sym,
          free: a.available || "0",
          locked: a.frozen || "0",
          usdValue,
        }
      })

    const totalUsd = exchangeAssets.reduce((sum, row) => sum + row.usdValue, 0)

    return NextResponse.json({
      exchangeId: "bitget",
      exchangeName: "Bitget",
      totalUsd,
      assets: exchangeAssets,
      timestamp: Date.now(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error"
    console.error("Bitget balance error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
