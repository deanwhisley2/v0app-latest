export interface AnalyzeRequest {
  symbol: string
  timeWindowSeconds: number
  useNex: boolean
  cancelToken?: string
}

export interface AnalyzeResponse {
  analysisId: string
  status: "processing" | "completed" | "cancelled"
  result?: {
    action: "BUY" | "SELL" | "HOLD"
    confidence: number
    reasons: string[]
    entryPrice?: number
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

export interface JoelinCoin {
  symbol: string
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  safetyLevel: "HIGH" | "MEDIUM" | "LOW"
  tradableLevel: number
  lastAnalysis: string
  nextAnalysis: string
  price: number
  volume24h: number
  volatility: number
}

export interface JoelinResponse {
  coins: JoelinCoin[]
  lastUpdated: string
  nextRefresh: string
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

export interface Position {
  symbol: string
  entryPrice: number
  quantity: number
  investedAmount: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  entryTime: Date
  status: "active" | "closing" | "closed"
  strategy: string
}

export interface AutoTraderConfig {
  totalBalance: number
  runtimeMinutes: number
  stopProfitPercent: number
  stopLossPercent: number
  allowedCoins: string[]
  activePositions: Map<string, Position>
  usedBalance: number
  lastEntryTime: Date
  consecutiveLosses: number
  dailyLoss: number
}
