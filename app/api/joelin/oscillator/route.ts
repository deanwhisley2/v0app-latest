import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import type { JoelinResponse } from "@/lib/expert/phase2-types"
import { pickTradableNow } from "@/lib/expert/joelin-ranking"
import { phase2Store } from "@/lib/expert/phase2-store"
import { getFundingRateAnomaly, getOrderBookImbalance, toBinanceSymbol } from "@/lib/server/fast-paths-core"

async function fetchTicker(symbol: string) {
  const pair = toBinanceSymbol(symbol)
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    return {
      price: 0,
      volume24h: 0,
      changePercent: 0,
    }
  }
  const data = (await res.json()) as { lastPrice?: string; quoteVolume?: string; priceChangePercent?: string }
  return {
    price: Number(data.lastPrice ?? 0),
    volume24h: Number(data.quoteVolume ?? 0),
    changePercent: Number(data.priceChangePercent ?? 0),
  }
}

async function refreshCoins() {
  const now = Date.now()
  const next = new Date(now + 300_000).toISOString()
  const updated = await Promise.all(
    phase2Store.joelin.map(async (coin) => {
      const [ticker, ob, fr] = await Promise.all([
        fetchTicker(coin.symbol),
        getOrderBookImbalance(coin.symbol, 50),
        getFundingRateAnomaly(coin.symbol),
      ])
      const imbalanceScore = Math.min(40, Math.abs(ob.imbalance) * 120)
      const fundingScore = fr.signal === "NEUTRAL" ? 15 : 30
      const momentumScore = Math.min(30, Math.abs(ticker.changePercent))
      const confidence = Math.max(35, Math.min(98, Math.round(30 + imbalanceScore + fundingScore + momentumScore)))
      const directional =
        ob.imbalance > 0.1 || fr.signal === "BULLISH"
          ? "BUY"
          : ob.imbalance < -0.1 || fr.signal === "BEARISH"
            ? "SELL"
            : "HOLD"
      const safetyLevel = confidence >= 78 ? "HIGH" : confidence >= 62 ? "MEDIUM" : "LOW"
      const tradableLevel = Math.max(0, Math.min(100, Math.round(confidence * 0.7 + Math.abs(ticker.changePercent) * 0.3)))
      return {
        ...coin,
        action: directional,
        confidence,
        safetyLevel,
        tradableLevel,
        lastAnalysis: new Date(now).toISOString(),
        nextAnalysis: next,
        price: ticker.price > 0 ? ticker.price : coin.price,
        volume24h: ticker.volume24h > 0 ? ticker.volume24h : coin.volume24h,
        volatility: Math.max(0.1, Math.abs(ticker.changePercent)),
      }
    })
  )
  phase2Store.joelin = updated
}

export async function GET(_req: NextRequest) {
  await refreshCoins()
  const now = new Date()
  const coins = phase2Store.joelin
  const tradableNow = pickTradableNow(coins, 10)
  const response: JoelinResponse = {
    coins,
    tradableNow,
    lastUpdated: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 300_000).toISOString(),
  }
  return NextResponse.json(response)
}
