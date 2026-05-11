export interface AnalyzeRequest {
  symbol: string
  timeWindowSeconds: number
  useNex: boolean
  /** When true, runs Grok even if symbol is outside quota pool (spends API; use sparingly). */
  forceGrok?: boolean
  /** When true, runs time-bound analysis in FAST mode (short TTL on stored analysis). */
  fastMode?: boolean
  cancelToken?: string
}

export interface AnalyzeResponse {
  analysisId: string
  status: "processing" | "completed" | "cancelled"
  result?: {
    action: "BUY" | "SELL" | "HOLD"
    /** Canonical confidence for UI + execution authority (calibrated, uncertainty-aware). */
    confidence: number
    /** Pre-calibration fusion/model output; research/debug only, never execution-authoritative. */
    rawConfidence?: number
    /** Post-calibration confidence; execution-authoritative. */
    calibratedConfidence?: number
    /** Presentation value derived from calibratedConfidence; never used for execution logic. */
    uiDisplayConfidence?: number
    confidenceExplanation?: {
      raw: number
      historicalFactor: number
      regimePenalty: number
      recentPenalty: number
      final: number
      sampleSize: number
    }
    reasons: string[]
    entryPrice?: number
    /** Slim Grok narrative (when live Grok ran); for UI + audit. */
    grokSnapshot?: {
      mock: boolean
      pipelineMode?: string
      overallBias: string
      confidence: number
      newsSentiment: string
      xBias: string
      headlines: string[]
    }
  }
}

export interface ManualTradeConfig {
  buyPrice: number
  sellPrice: number
  stopLossPercent: number
  timeInTradeMinutes: number
  repeatCount: number
  amountPerTrade: number
}

export interface AutoTradeConfig {
  totalAmount: number
  entryDelayMinutes: number
  maxTradeDurationMinutes: number
  stopProfitPercent: number
  stopLossPercent: number
}

export interface TradeOrder {
  id: string
  sessionId: string
  userId: string
  symbol: string
  orderId: string
  type: "BUY" | "SELL"
  price: number
  quantity: number
  quoteAmount: number
  status: "PENDING" | "FILLED" | "CANCELLED" | "FAILED"
  createdAt: string
  filledAt?: string
}

export interface TradeSession {
  id: string
  userId: string
  symbol: string
  mode: "MANUAL" | "NEX" | "AUTO_TRADER"
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "ABORTED"
  totalAmount: number
  usedAmount: number
  startTime: string
  endTime?: string
  config: unknown
}

export interface ChatMessage {
  id: string
  sessionId: string
  timestamp: string
  type: "pending" | "order" | "status" | "error" | "notification"
  content: string
  data?: {
    orderId?: string
    price?: number
    quantity?: number
    reason?: string
    retryCount?: number
  }
}

