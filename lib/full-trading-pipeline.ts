"use client"

/**
 * Orchestrates real modules in sequence: depth → liquidity → sentiment → contrarian →
 * race heuristics → Nexus (with sentiment bias) → adaptation snapshot → pre-trade → guardrail.
 * Does not import SafetyNotifier (Node `fs`) — use auditTrail + server routes for alerts.
 */

import { getBinanceOrderBook } from "@/lib/binance-api"
import { depthToNexusTuples, depthToOrderBookData, toBinanceSpotSymbol } from "@/lib/order-book-mapper"
import { liquidityWarfare, type LiquidityWarfareReport } from "@/lib/liquidity-warfare"
import { sentimentWeapon, type SentimentReport } from "@/lib/sentiment-weapon"
import { enhancedTradingEngine, type EnhancedTradeSignal } from "@/lib/enhanced-trading-engine"
import { adaptationEngine } from "@/lib/adaptation-engine"
import { analyzeRaceConditions, type RaceConditionEvent } from "@/lib/race-condition-engine"
import { type TradeRequest } from "@/lib/pre-trade-validator"
import {
  ensureSharedValidationState,
  getSharedValidator,
  hydrateSharedLearnerFromServer,
} from "@/lib/shared-validator-state"
import { GuardrailEngine } from "@/lib/guardrail-engine"
import { nexusEngine, type MarketData, type TradeDecision } from "@/nexus-core/nexus-engine"
import {
  buildMarketData,
  decisionToTradeAnalysis,
  initializeEngine,
  sentimentBiasFromReport,
  type TradeAnalysis,
} from "@/lib/trading-strategies"

export type FullTradingPipelineOptions = {
  /** 1 = view, 2 = trader (signals only), 3+ = auto path allowed when combined with demo flags upstream */
  userAccessLevel?: number
  depthLimit?: number
}

export type FullTradingPipelineResult = {
  approved: boolean
  tradeAnalysis: TradeAnalysis
  auditTrail: string[]
  rejectionReason?: string
  requiresManualExecution: boolean
  nexusDecision: TradeDecision
  enhancedSignal: EnhancedTradeSignal
  warfareReport: LiquidityWarfareReport
  sentimentReport: SentimentReport
  raceSummary: ReturnType<typeof analyzeRaceConditions>
}

function warfareSpoofsToRaceEvents(
  symbol: string,
  report: LiquidityWarfareReport
): RaceConditionEvent[] {
  return report.spoofingAlerts.map((a, i) => ({
    timestamp: a.detectedAt + i,
    type: "spoof_detected" as const,
    symbol,
    price: a.price,
    size: a.size,
    side: a.side === "BID" ? ("sell" as const) : ("buy" as const),
    latency_ms: Math.max(1, a.duration),
    confidence: Math.min(1, a.confidence / 100),
  }))
}

function nexusToTradeRequest(
  symbol: string,
  decision: TradeDecision,
  price: number
): TradeRequest | null {
  if (decision.action === "HOLD") return null
  const action = decision.action.includes("BUY") ? ("buy" as const) : ("sell" as const)
  return {
    symbol,
    action,
    quantity: 0.001,
    price,
    rsi: 50,
    signal: "neutral",
    latency_ms: 120,
    portfolio_value: 100_000,
  }
}

/**
 * Full stack for dashboard / tools: real depth when network allows, then engines + safety checks.
 */
export async function runFullTradingPipeline(
  coin: { symbol: string; price: number; change24h: number },
  historicalData: Array<{ close: number; volume: number }>,
  options: FullTradingPipelineOptions = {}
): Promise<FullTradingPipelineResult> {
  const audit: string[] = []
  const userAccessLevel = options.userAccessLevel ?? 3
  const depthLimit = options.depthLimit ?? 100
  const spot = toBinanceSpotSymbol(coin.symbol)

  if (historicalData.length > 0) {
    initializeEngine(coin.symbol, historicalData.map((d) => d.close))
  }

  ensureSharedValidationState()
  await hydrateSharedLearnerFromServer()

  let orderBookTuples: MarketData["orderBook"] = { bids: [], asks: [] }
  let obData = depthToOrderBookData({ lastUpdateId: 0, bids: [], asks: [] })

  try {
    const depth = await getBinanceOrderBook(spot, depthLimit)
    orderBookTuples = depthToNexusTuples(depth)
    obData = depthToOrderBookData(depth)
    audit.push(`[depth] Fetched ${orderBookTuples.bids.length} bids / ${orderBookTuples.asks.length} asks`)
  } catch (e) {
    audit.push(`[depth] Failed (${spot}): ${e instanceof Error ? e.message : String(e)} — empty book`)
  }

  const histPrices = historicalData.map((d) => d.close)
  const histVols = historicalData.map((d) => d.volume)
  const lastVol = histVols.length ? histVols[histVols.length - 1]! : 0
  const prevClose =
    historicalData.length > 5 ? historicalData[historicalData.length - 6]!.close : coin.price
  const priceChange5m = prevClose !== 0 ? ((coin.price - prevClose) / prevClose) * 100 : coin.change24h
  const volumeSpike =
    histVols.length > 10 ? lastVol > (histVols.slice(-10).reduce((a, b) => a + b, 0) / 10) * 2 : false

  const warfareReport = liquidityWarfare.analyze(coin.price, obData, histPrices, histVols)
  audit.push(
    `[liquidity] overall=${warfareReport.overallSignal} strength=${warfareReport.signalStrength.toFixed(0)}`
  )

  const sentimentReport = sentimentWeapon.analyze(obData, null, coin.symbol, lastVol, coin.price, priceChange5m)
  audit.push(`[sentiment] composite=${sentimentReport.compositeSignal}`)

  const enhancedSignal = enhancedTradingEngine.analyze(
    coin.price,
    warfareReport,
    sentimentReport,
    priceChange5m,
    volumeSpike
  )
  audit.push(`[contrarian] action=${enhancedSignal.action} reason=${enhancedSignal.reason}`)

  const raceEvents = warfareSpoofsToRaceEvents(spot, warfareReport)
  const raceSummary = analyzeRaceConditions(raceEvents)
  audit.push(`[race] ${raceSummary.recommendation}`)

  const sentimentBias = sentimentBiasFromReport(
    sentimentReport.compositeSignal,
    sentimentReport.compositeConfidence
  )
  const marketData: MarketData = buildMarketData(coin, historicalData, orderBookTuples, sentimentBias)
  const nexusDecision = nexusEngine.getTradeSignal(marketData)
  audit.push(`[nexus] ${nexusDecision.action} conf=${nexusDecision.confidence.toFixed(0)}`)

  const adaptation = adaptationEngine.analyze()
  audit.push(
    `[adaptation] regime=${adaptation.currentRegime.volatility}/${adaptation.currentRegime.trend} trades=${adaptation.totalTrades}`
  )

  const validator = getSharedValidator()
  audit.push(`[pre-trade] using shared PreTradeValidator (learned rules persist in-session)`)
  const tradeReq = nexusToTradeRequest(spot, nexusDecision, coin.price)
  if (tradeReq) {
    const v = validator.validate(tradeReq)
    if (!v.canExecute) {
      audit.push(`[pre-trade] BLOCK: ${v.blockReason}`)
      const analysis = decisionToTradeAnalysis(coin, nexusDecision)
      return {
        approved: false,
        tradeAnalysis: {
          ...analysis,
          recommendation: `${analysis.recommendation} | Blocked: ${v.blockReason}`,
        },
        auditTrail: audit,
        rejectionReason: v.blockReason ?? "Pre-trade validation failed",
        requiresManualExecution: userAccessLevel <= 2,
        nexusDecision,
        enhancedSignal,
        warfareReport,
        sentimentReport,
        raceSummary,
      }
    }
    audit.push(`[pre-trade] passed`)
  } else {
    audit.push(`[pre-trade] skipped (Nexus HOLD)`)
  }

  if (!tradeReq) {
    audit.push(`[guardrail] skipped (Nexus HOLD)`)
    return {
      approved: true,
      tradeAnalysis: decisionToTradeAnalysis(coin, nexusDecision),
      auditTrail: audit,
      requiresManualExecution: userAccessLevel <= 2,
      nexusDecision,
      enhancedSignal,
      warfareReport,
      sentimentReport,
      raceSummary,
    }
  }

  const guard = new GuardrailEngine()
  const gctx = {
    orderId: `pipeline_${Date.now()}`,
    symbol: spot,
    action: tradeReq.action,
    quantity: tradeReq.quantity,
    signalPrice: coin.price,
    currentPrice: coin.price,
    latency_ms: tradeReq.latency_ms ?? 100,
    timestamp: Date.now(),
  }
  const gdec = guard.monitor(gctx)
  if (!gdec.allowExecution) {
    audit.push(`[guardrail] ${gdec.reason}`)
    const analysis = decisionToTradeAnalysis(coin, nexusDecision)
    return {
      approved: false,
      tradeAnalysis: {
        ...analysis,
        recommendation: `${analysis.recommendation} | Guardrail: ${gdec.reason}`,
      },
      auditTrail: audit,
      rejectionReason: gdec.reason,
      requiresManualExecution: userAccessLevel <= 2,
      nexusDecision,
      enhancedSignal,
      warfareReport,
      sentimentReport,
      raceSummary,
    }
  }
  audit.push(`[guardrail] ${gdec.reason}`)

  const requiresManualExecution = userAccessLevel <= 2

  return {
    approved: true,
    tradeAnalysis: decisionToTradeAnalysis(coin, nexusDecision),
    auditTrail: audit,
    requiresManualExecution,
    nexusDecision,
    enhancedSignal,
    warfareReport,
    sentimentReport,
    raceSummary,
  }
}
