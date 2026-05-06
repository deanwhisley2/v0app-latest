/**
 * Time-bound analysis: server fast paths + optional Grok (xAI), fused before deadline.
 * Partials: FAST_PATHS_COMPLETE then optional GROK_COMPLETE (for future SSE wiring).
 */

import { callGrok, type GrokResponse } from "@/lib/analysis/grok-client"
import { getFundingRateAnomaly, getOrderBookImbalance } from "@/lib/server/fast-paths-core"

export { toBinanceSymbol } from "@/lib/server/fast-paths-core"

export interface AnalysisRequest {
  symbol: string
  timeWindowMs: number
  includeGrok: boolean
  onPartialResult?: (result: PartialAnalysisResult) => void
  onFinalResult?: (result: FinalAnalysisResult) => void
}

export interface PartialAnalysisResult {
  phase: "FAST_PATHS_COMPLETE" | "GROK_COMPLETE"
  timestamp: string
  fastPaths?: FastPathsResult
  grokResult?: GrokResponse
  waitingForGrok: boolean
  timeRemainingMs: number
}

export interface FinalAnalysisResult {
  timestamp: string
  symbol: string
  totalTimeMs: number
  grokReceived: boolean
  grokTimeMs?: number
  fastPaths: FastPathsResult
  grok?: GrokResponse
  fusedDecision: FusedDecision
  /** Present when produced by `startAnalysis`: fast path vs full timed window. */
  mode?: "FAST" | "DEEP"
}

export interface FastPathsResult {
  orderBookImbalance: number
  bidDepth: number
  askDepth: number
  fundingRate: number
  fundingSignal: "BULLISH" | "BEARISH" | "NEUTRAL"
  liquidityWarfare: { sweepDetected: "BULLISH" | "BEARISH" | "NONE"; note?: string }
  sentimentWeapon: Record<string, unknown>
  raceCondition: Record<string, unknown>
  timestamp: string
}

export interface FusedDecision {
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  reasons: string[]
  grokInfluenced: boolean
}

function liquiditySweepFromImbalance(imbalance: number): FastPathsResult["liquidityWarfare"] {
  if (imbalance > 0.18) return { sweepDetected: "BULLISH", note: "Bid-heavy top-of-book" }
  if (imbalance < -0.18) return { sweepDetected: "BEARISH", note: "Ask-heavy top-of-book" }
  return { sweepDetected: "NONE", note: "No strong imbalance" }
}

function sleep(ms: number): Promise<null> {
  if (ms <= 0) return Promise.resolve(null)
  return new Promise((resolve) => setTimeout(() => resolve(null), ms))
}

function fuseDecision(
  symbol: string,
  startTime: number,
  fast: FastPathsResult,
  grok: GrokResponse | null,
  grokMissedWindow: boolean
): FinalAnalysisResult {
  let buyScore = 0
  let sellScore = 0
  const reasons: string[] = []

  if (fast.liquidityWarfare.sweepDetected === "BULLISH") {
    buyScore += 28
    reasons.push("Liquidity / book skew suggests bullish pressure")
  }
  if (fast.liquidityWarfare.sweepDetected === "BEARISH") {
    sellScore += 28
    reasons.push("Liquidity / book skew suggests bearish pressure")
  }

  if (fast.orderBookImbalance > 0.12) {
    buyScore += 18
    reasons.push(`Order book ${(fast.orderBookImbalance * 100).toFixed(0)}% bid-heavy`)
  }
  if (fast.orderBookImbalance < -0.12) {
    sellScore += 18
    reasons.push(`Order book ${(Math.abs(fast.orderBookImbalance) * 100).toFixed(0)}% ask-heavy`)
  }

  if (fast.fundingSignal === "BULLISH") {
    buyScore += 14
    reasons.push("Funding skew: negative / crowded-short tone")
  } else if (fast.fundingSignal === "BEARISH") {
    sellScore += 14
    reasons.push("Funding skew: positive / crowded-long tone")
  }

  const grokUsable = grok && !grok.mock && !grokMissedWindow
  let grokInfluenced = false

  if (grokUsable) {
    grokInfluenced = true
    if (grok.overallBias === "BULLISH") {
      buyScore += 22
      reasons.push(`Grok overall BULLISH (${grok.confidence}% conf)`)
    } else if (grok.overallBias === "BEARISH") {
      sellScore += 22
      reasons.push(`Grok overall BEARISH (${grok.confidence}% conf)`)
    }
    if (grok.newsSentiment === "POSITIVE") buyScore += 8
    if (grok.newsSentiment === "NEGATIVE") sellScore += 8
  } else if (grokMissedWindow) {
    reasons.push("Grok not available within the analysis window — fast paths only")
  } else if (grok?.mock) {
    reasons.push("Grok mock layer (no XAI_API_KEY or fallback) — not used for directional score")
  }

  let action: "BUY" | "SELL" | "HOLD" = "HOLD"
  let confidence = 50
  const diff = buyScore - sellScore
  if (diff > 14) {
    action = "BUY"
    confidence = Math.min(95, 52 + diff)
  } else if (diff < -14) {
    action = "SELL"
    confidence = Math.min(95, 52 + Math.abs(diff))
  } else {
    reasons.push("Insufficient directional separation — HOLD")
  }

  return {
    timestamp: new Date().toISOString(),
    symbol,
    totalTimeMs: Date.now() - startTime,
    grokReceived: !!grokUsable,
    grokTimeMs: grokUsable ? grok.analysisTimeMs : undefined,
    fastPaths: fast,
    grok: grok ?? undefined,
    fusedDecision: { action, confidence, reasons, grokInfluenced },
  }
}

class TimeBoundAnalysisManager {
  private readonly latestFinal = new Map<string, { final: FinalAnalysisResult; at: number }>()

  async startAnalysis(request: AnalysisRequest & { fastMode?: boolean }): Promise<FinalAnalysisResult> {
    const startTime = Date.now()
    const deadline = startTime + request.timeWindowMs
    const symbol = request.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
    const grokBudget = Math.max(500, deadline - startTime)
    const grokEnabled =
      request.includeGrok && process.env.NEXUS_GROK_ENABLED === "1"

    const fastPathsPromise = this.runFastPaths(symbol, deadline)
    const grokPromise =
      request.fastMode === true
        ? Promise.resolve(null)
        : grokEnabled
          ? callGrok(symbol, grokBudget).catch((err) => {
              console.error("[ANALYSIS] Grok failed:", err)
              return null
            })
          : Promise.resolve(null)

    const fastPaths = await fastPathsPromise

    if (request.fastMode === true) {
      request.onPartialResult?.({
        phase: "FAST_PATHS_COMPLETE",
        timestamp: fastPaths.timestamp,
        fastPaths,
        waitingForGrok: false,
        timeRemainingMs: Math.max(0, deadline - Date.now()),
      })
      const fastFinal = fuseDecision(symbol, startTime, fastPaths, null, false)
      const fastOut: FinalAnalysisResult = { ...fastFinal, mode: "FAST" }
      this.latestFinal.set(symbol, { final: fastOut, at: Date.now() })
      request.onFinalResult?.(fastOut)
      return fastOut
    }

    request.onPartialResult?.({
      phase: "FAST_PATHS_COMPLETE",
      timestamp: fastPaths.timestamp,
      fastPaths,
      waitingForGrok: grokEnabled,
      timeRemainingMs: Math.max(0, deadline - Date.now()),
    })

    let grokResult: GrokResponse | null = null
    if (grokEnabled) {
      const remaining = Math.max(0, deadline - Date.now())
      if (remaining > 0) {
        grokResult = await Promise.race([grokPromise, sleep(remaining)])
        if (grokResult) {
          request.onPartialResult?.({
            phase: "GROK_COMPLETE",
            timestamp: new Date().toISOString(),
            fastPaths,
            grokResult,
            waitingForGrok: false,
            timeRemainingMs: Math.max(0, deadline - Date.now()),
          })
        }
      }
    }

    const grokMissedWindow = grokEnabled && !grokResult
    // Enforce user-selected analysis window: finalize only at/after deadline.
    const settleDelay = Math.max(0, deadline - Date.now())
    if (settleDelay > 0) {
      await sleep(settleDelay)
    }
    const finalResult = fuseDecision(symbol, startTime, fastPaths, grokResult, grokMissedWindow)
    const deepOut: FinalAnalysisResult = { ...finalResult, mode: "DEEP" }
    this.latestFinal.set(symbol, { final: deepOut, at: Date.now() })
    request.onFinalResult?.(deepOut)
    return deepOut
  }

  private async runFastPaths(symbol: string, deadline: number): Promise<FastPathsResult> {
    const ac = new AbortController()
    const cap = Math.min(12_000, Math.max(2000, deadline - Date.now()))
    const t = setTimeout(() => ac.abort(), cap)
    try {
      const [ob, fr] = await Promise.all([
        getOrderBookImbalance(symbol, 50, ac.signal),
        getFundingRateAnomaly(symbol, ac.signal),
      ])
      const liquidity = liquiditySweepFromImbalance(ob.imbalance)
      return {
        orderBookImbalance: ob.imbalance,
        bidDepth: ob.bidDepth,
        askDepth: ob.askDepth,
        fundingRate: fr.rate,
        fundingSignal: fr.signal,
        liquidityWarfare: liquidity,
        sentimentWeapon: { source: "order_book_proxy" },
        raceCondition: { note: "Race engine hook TBD" },
        timestamp: new Date().toISOString(),
      }
    } finally {
      clearTimeout(t)
    }
  }

  /** Latest completed analysis for a symbol (uppercase base, e.g. SOL). */
  getLatestResult(symbol: string): FinalAnalysisResult | undefined {
    return this.latestFinal.get(symbol.toUpperCase().replace(/[^A-Z0-9]/g, ""))?.final
  }

  getSessionStatus(symbol: string): {
    active: boolean
    lastFinal?: FinalAnalysisResult
    cached?: FinalAnalysisResult
    ageMs?: number
  } {
    const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
    const hit = this.latestFinal.get(key)
    if (!hit) return { active: false }
    return {
      active: false,
      lastFinal: hit.final,
      cached: hit.final,
      ageMs: Date.now() - hit.at,
    }
  }
}

export const timeBoundAnalysis = new TimeBoundAnalysisManager()
