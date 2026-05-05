/**
 * Server-safe fast paths (no "use client") — Binance public REST only.
 */

export interface OrderBookImbalance {
  imbalance: number
  bidDepth: number
  askDepth: number
}

export type FundingSignal = "BULLISH" | "BEARISH" | "NEUTRAL"

export interface FundingRateData {
  rate: number
  isAnomaly: boolean
  signal: FundingSignal
}

export function toBinanceSymbol(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (s.endsWith("USDT")) return s
  return `${s}USDT`
}

export async function getOrderBookImbalance(
  symbol: string,
  depth = 50,
  abortSignal?: AbortSignal
): Promise<OrderBookImbalance> {
  const pair = toBinanceSymbol(symbol)
  try {
    const url = `https://api.binance.com/api/v3/depth?symbol=${pair}&limit=${depth}`
    const response = await fetch(url, { signal: abortSignal, cache: "no-store" })
    if (!response.ok) return { imbalance: 0, bidDepth: 0, askDepth: 0 }
    const data = (await response.json()) as { bids?: string[][]; asks?: string[][] }

    let bidDepth = 0
    let askDepth = 0
    const n = Math.min(10, data.bids?.length ?? 0, data.asks?.length ?? 0)
    for (let i = 0; i < n; i++) {
      bidDepth += parseFloat(data.bids?.[i]?.[1] ?? "0")
      askDepth += parseFloat(data.asks?.[i]?.[1] ?? "0")
    }
    const total = bidDepth + askDepth
    const imbalance = total === 0 ? 0 : (bidDepth - askDepth) / total
    return { imbalance, bidDepth, askDepth }
  } catch (e) {
    console.error("[fast-paths-core] order book failed:", e)
    return { imbalance: 0, bidDepth: 0, askDepth: 0 }
  }
}

export async function getFundingRateAnomaly(
  symbol: string,
  abortSignal?: AbortSignal
): Promise<FundingRateData> {
  const pair = toBinanceSymbol(symbol)
  try {
    const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`
    const response = await fetch(url, { signal: abortSignal, cache: "no-store" })
    if (!response.ok) return { rate: 0, isAnomaly: false, signal: "NEUTRAL" }
    const data = (await response.json()) as { lastFundingRate?: string }
    const rate = parseFloat(data.lastFundingRate ?? "0")
    const isAnomaly = Math.abs(rate) > 0.0005

    let signal: FundingSignal = "NEUTRAL"
    if (rate < -0.0005) signal = "BULLISH"
    if (rate > 0.0005) signal = "BEARISH"

    return { rate, isAnomaly, signal }
  } catch (e) {
    console.error("[fast-paths-core] funding rate failed:", e)
    return { rate: 0, isAnomaly: false, signal: "NEUTRAL" }
  }
}
