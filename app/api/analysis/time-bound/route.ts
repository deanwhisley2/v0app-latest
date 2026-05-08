import { NextRequest, NextResponse } from "next/server"
import { timeBoundAnalysis } from "@/lib/analysis/time-bound-analysis"
import { calibrateConfidence } from "@/lib/confidence-calibration"
import { regimeBucketForTradeMemory, resolveAuthoritativeMarketState } from "@/lib/market-state-authority"

/**
 * Intentionally not gated by `NEXT_PUBLIC_DEV_LOCAL_ONLY`: fast paths only call
 * public Binance REST (depth + funding index). Grok runs only when includeGrok
 * is true. Live xAI calls also require the pipeline live and symbol in the quota pool
 * (`lib/grok-symbol-eligibility.ts`). This route does not accept `forceGrok` (public callers cannot bypass quota).
 */
export async function POST(request: NextRequest) {
  let body: { symbol?: string; timeWindowSeconds?: number; includeGrok?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : ""
  if (!symbol) {
    return NextResponse.json({ success: false, error: "symbol is required" }, { status: 400 })
  }

  const timeWindowSeconds =
    typeof body.timeWindowSeconds === "number" && Number.isFinite(body.timeWindowSeconds)
      ? Math.floor(body.timeWindowSeconds)
      : 300

  if (timeWindowSeconds < 60 || timeWindowSeconds > 600) {
    return NextResponse.json(
      {
        success: false,
        error: "timeWindowSeconds must be between 60 and 600 (1–10 minutes)",
      },
      { status: 400 }
    )
  }

  // Grok only when explicitly requested AND operator enables + subscription active + XAI key (see grok-pipeline-status).
  const includeGrok = body.includeGrok === true
  const timeWindowMs = timeWindowSeconds * 1000

  const result = await timeBoundAnalysis.startAnalysis({
    symbol,
    timeWindowMs,
    includeGrok,
    onPartialResult: (partial) => {
      console.log(
        `[api/analysis/time-bound] partial ${partial.phase} · Grok wait ${partial.waitingForGrok} · ${partial.timeRemainingMs}ms left`
      )
    },
    onFinalResult: (final) => {
      console.log(
        `[api/analysis/time-bound] final ${final.symbol} ${final.fusedDecision.action} (${final.fusedDecision.confidence}%) grok=${final.grokReceived}`
      )
    },
  })
  const rawConfidence = result.fusedDecision.confidence
  const liveMarket = await resolveAuthoritativeMarketState({
    consumer: "api-time-bound",
    minRefreshMs: 45_000,
  })
  const calibration = await calibrateConfidence({
    symbol: result.symbol,
    decision: result.fusedDecision.action,
    rawConfidence,
    marketRegime: regimeBucketForTradeMemory(liveMarket.marketRegime),
    liveMarketRegimeForPenalty: liveMarket.degraded ? "UNKNOWN" : liveMarket.marketRegime,
  })
  const calibratedConfidence = calibration.final
  result.fusedDecision.confidence = calibratedConfidence

  return NextResponse.json({
    success: true,
    result: {
      ...result,
      fusedDecision: {
        ...result.fusedDecision,
        confidence: calibratedConfidence,
        rawConfidence,
        calibratedConfidence,
        uiDisplayConfidence: calibratedConfidence,
        confidenceExplanation: calibration,
      },
    },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  if (!symbol) {
    return NextResponse.json({ error: "symbol query parameter required" }, { status: 400 })
  }
  const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const cached = timeBoundAnalysis.getLatestResult(key)
  const status = timeBoundAnalysis.getSessionStatus(key)
  return NextResponse.json({ symbol: key, cached, status })
}
