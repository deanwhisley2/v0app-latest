import { NextResponse } from "next/server"
import type { JoelinResponse } from "@/lib/expert/phase2-types"
import { phase2Store } from "@/lib/expert/phase2-store"

function refreshCoins() {
  const now = Date.now()
  const next = new Date(now + 300_000).toISOString()
  phase2Store.joelin = phase2Store.joelin.map((coin) => {
    const swing = (Math.random() - 0.5) * 8
    const confidence = Math.max(35, Math.min(98, Math.round(coin.confidence + swing)))
    const action = confidence > 70 ? (Math.random() > 0.45 ? "BUY" : "SELL") : "HOLD"
    const safetyLevel = confidence >= 78 ? "HIGH" : confidence >= 62 ? "MEDIUM" : "LOW"
    const tradableLevel = Math.max(0, Math.min(100, Math.round(confidence * 0.7 + (Math.random() * 30))))
    return {
      ...coin,
      action,
      confidence,
      safetyLevel,
      tradableLevel,
      lastAnalysis: new Date(now).toISOString(),
      nextAnalysis: next,
      price: Math.max(0.000001, coin.price * (1 + (Math.random() - 0.5) * 0.02)),
      volatility: Math.max(0.1, coin.volatility + (Math.random() - 0.5) * 0.8),
    }
  })
}

export async function GET() {
  refreshCoins()
  const now = new Date()
  const response: JoelinResponse = {
    coins: phase2Store.joelin,
    lastUpdated: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 300_000).toISOString(),
  }
  return NextResponse.json(response)
}
