import { NextRequest, NextResponse } from "next/server"
import { makeId, phase2Store } from "@/lib/expert/phase2-store"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { symbol?: string; timeWindowSeconds?: number }
  const symbol = body.symbol?.trim().toUpperCase()
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 })
  const analysisId = makeId("analysis")
  const windowSec = Math.max(60, Math.min(600, body.timeWindowSeconds ?? 300))
  const now = Date.now()
  const next = new Date(now + 300_000).toISOString()
  phase2Store.joelin = phase2Store.joelin.map((coin) =>
    coin.symbol !== symbol
      ? coin
      : {
          ...coin,
          confidence: Math.max(40, Math.min(98, Math.round(coin.confidence + (Math.random() - 0.5) * 15))),
          lastAnalysis: new Date(now).toISOString(),
          nextAnalysis: next,
        }
  )
  return NextResponse.json({ analysisId, estimatedTimeMs: windowSec * 1000 })
}
