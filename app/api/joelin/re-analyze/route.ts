import { NextRequest, NextResponse } from "next/server"
import { makeId, phase2Store } from "@/lib/expert/phase2-store"
import { timeBoundAnalysis } from "@/lib/analysis/time-bound-analysis"
import { binanceBookTicker } from "@/lib/server/binance-signed-order"

function calculateTradableLevel(confidence: number, imbalance: number, fundingRate: number): number {
  const raw = confidence * 0.7 + Math.min(100, Math.abs(imbalance) * 100) * 0.2 + Math.min(100, Math.abs(fundingRate) * 10000) * 0.1
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function calculateSafetyLevel(confidence: number, imbalance: number): "HIGH" | "MEDIUM" | "LOW" {
  if (confidence >= 80 && Math.abs(imbalance) >= 0.15) return "HIGH"
  if (confidence >= 65 && Math.abs(imbalance) >= 0.08) return "MEDIUM"
  return "LOW"
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { symbol?: string; timeWindowSeconds?: number }
  const symbol = body.symbol?.trim().toUpperCase()
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 })
  const analysisId = makeId("analysis")
  const windowSec = Math.max(60, Math.min(600, body.timeWindowSeconds ?? 300))
  const now = Date.now()
  const next = new Date(now + 300_000).toISOString()
  const result = await timeBoundAnalysis.startAnalysis({
    symbol,
    timeWindowMs: windowSec * 1000,
    includeGrok: process.env.NEXUS_GROK_ENABLED === "1",
  })
  const ticker = await binanceBookTicker(symbol).catch(() => null)
  const px = ticker ? Number.parseFloat(ticker.bidPrice || ticker.askPrice || "0") : 0
  const tradable = calculateTradableLevel(
    result.fusedDecision.confidence,
    result.fastPaths.orderBookImbalance,
    result.fastPaths.fundingRate
  )
  const safety = calculateSafetyLevel(result.fusedDecision.confidence, result.fastPaths.orderBookImbalance)

  phase2Store.joelin = phase2Store.joelin.map((coin) =>
    coin.symbol !== symbol
      ? coin
      : {
          ...coin,
          action: result.fusedDecision.action,
          confidence: result.fusedDecision.confidence,
          tradableLevel: tradable,
          safetyLevel: safety,
          price: Number.isFinite(px) && px > 0 ? px : coin.price,
          lastAnalysis: new Date(now).toISOString(),
          nextAnalysis: next,
        }
  )
  return NextResponse.json({
    analysisId,
    estimatedTimeMs: windowSec * 1000,
    result: {
      action: result.fusedDecision.action,
      confidence: result.fusedDecision.confidence,
      reasons: result.fusedDecision.reasons,
    },
  })
}
