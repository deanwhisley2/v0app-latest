import { NextRequest, NextResponse } from "next/server"
import { timeBoundAnalysis } from "@/lib/analysis/time-bound-analysis"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { regimeBucketForTradeMemory, resolveAuthoritativeMarketState } from "@/lib/market-state-authority"
import { computeAnalysisTtlSeconds } from "@/lib/expert/analysis-ttl"
import { createAnalysis, createNotification, makeId } from "@/lib/expert/phase2-store"
import { calibrateConfidence } from "@/lib/confidence-calibration"
import {
  behaviorIntelligenceToReasons,
  buildFocusUniverse,
  deriveBehaviorIntelligence,
  deriveSignalRhythmLifecycle,
  signalRhythmToReasons,
} from "@/lib/behavior-market-intelligence"
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/expert/phase2-types"

export async function POST(req: NextRequest) {
  const userOrRes = await requireExpertUserId()
  if (userOrRes instanceof NextResponse) return userOrRes
  const userId = userOrRes

  let body: AnalyzeRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const symbol = body.symbol?.trim().toUpperCase()
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 })
  if (!Number.isFinite(body.timeWindowSeconds) || body.timeWindowSeconds < 300 || body.timeWindowSeconds > 900) {
    return NextResponse.json({ error: "timeWindowSeconds must be 300-900" }, { status: 400 })
  }
  if (body.cancelToken) {
    const cancelled: AnalyzeResponse = {
      analysisId: body.cancelToken,
      status: "cancelled",
    }
    return NextResponse.json(cancelled)
  }

  const analysisId = makeId("analysis")
  const result = await timeBoundAnalysis.startAnalysis({
    symbol,
    timeWindowMs: body.timeWindowSeconds * 1000,
    includeGrok: Boolean(body.useNex),
    fastMode: Boolean(body.fastMode),
  })

  const ttlSeconds = computeAnalysisTtlSeconds({
    mode: result.mode,
    timeWindowSeconds: body.timeWindowSeconds,
  })
  const rawConfidence = result.fusedDecision.confidence
  const configuredFocus = buildFocusUniverse(
    process.env.NEXUS_FOCUS_SYMBOLS?.split(",").map((s) => s.trim()).filter(Boolean),
    process.env.NEXUS_FOCUS_INCLUDE_GOLD === "1"
  )
  const normalizedSymbol = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`
  const isFocusUniverseMember = configuredFocus.includes(normalizedSymbol)
  const executionAction = isFocusUniverseMember ? result.fusedDecision.action : "HOLD"
  const liveMarket = await resolveAuthoritativeMarketState({
    consumer: "expert-analyze",
    minRefreshMs: 45_000,
  })
  const calibration = await calibrateConfidence({
    userId,
    symbol,
    decision: executionAction,
    rawConfidence,
    marketRegime: regimeBucketForTradeMemory(liveMarket.marketRegime),
    liveMarketRegimeForPenalty: liveMarket.degraded ? "UNKNOWN" : liveMarket.marketRegime,
  })
  const calibratedConfidence = calibration.final
  const behaviorIntel = deriveBehaviorIntelligence(result, {
    observationWindowSec: body.timeWindowSeconds,
    signalFreshnessSec: 0,
  })
  const rhythm = deriveSignalRhythmLifecycle(result)
  const behaviorReasons = behaviorIntelligenceToReasons(behaviorIntel)
  const rhythmReasons = signalRhythmToReasons(rhythm)
  const focusReasons = isFocusUniverseMember
    ? ["FOCUS_UNIVERSE_MEMBER"]
    : ["NO_FORCE_OUTSIDE_FOCUS_UNIVERSE", "FOCUS_UNIVERSE_REQUIRED"]

  await createAnalysis({
    id: analysisId,
    userId,
    symbol,
    timeWindow: body.timeWindowSeconds,
    action: executionAction,
    // Legacy transitional field named `confidence`; now written as canonical calibrated confidence.
    confidence: calibratedConfidence,
    rawConfidence,
    calibratedConfidence,
    confidenceExplanation: calibration,
    reasons: [...result.fusedDecision.reasons, ...behaviorReasons, ...rhythmReasons, ...focusReasons],
    entryPrice: undefined,
    tradeExecuted: false,
    ttlSeconds,
  })
  await createNotification({
    id: makeId("notif"),
    userId,
    analysisId,
    symbol,
    action: executionAction,
    confidence: calibratedConfidence,
    read: false,
    deleted: false,
    createdAt: new Date().toISOString(),
  })

  const response: AnalyzeResponse = {
    analysisId,
    status: "completed",
    result: {
      action: executionAction,
      confidence: calibratedConfidence,
      rawConfidence,
      calibratedConfidence,
      uiDisplayConfidence: calibratedConfidence,
      confidenceExplanation: calibration,
      reasons: [...result.fusedDecision.reasons, ...behaviorReasons, ...rhythmReasons, ...focusReasons],
      entryPrice: undefined,
    },
  }
  return NextResponse.json(response)
}
