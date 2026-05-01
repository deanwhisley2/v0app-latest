"use client"

/**
 * RACE CONDITION ENGINE
 * 
 * Tests the speed of Binance's order book updates vs price updates.
 * The core insight: if you can detect the race condition between
 * order book updates and trade execution, you can front-run liquidity sweeps.
 * 
 * How it works:
 * 1. Opens a WebSocket to Binance's depth stream
 * 2. Simultaneously polls the REST API for trades
 * 3. Measures the latency between order book changes and trade prints
 * 4. When order book depth disappears faster than trades print = spoofing
 * 5. When trades print before order book updates = real liquidity taking
 * 
 * This is the "edge" - knowing whether a move is real or fake before the crowd.
 */

// ============================================================
// Types
// ============================================================

export interface RaceConditionEvent {
  timestamp: number
  type: "order_book_change" | "trade_print" | "depth_collapse" | "spoof_detected" | "real_liquidity_taking"
  symbol: string
  price: number
  size: number
  side: "buy" | "sell"
  latency_ms: number
  confidence: number // 0-1, how confident we are this is real
}

export interface RaceConditionMetrics {
  symbol: string
  totalEvents: number
  spoofEvents: number
  realLiquidityEvents: number
  averageLatencyMs: number
  lastUpdate: number
  currentSignal: "waiting" | "spoofing" | "real_move" | "neutral"
  signalConfidence: number
}

export interface OrderBookSnapshot {
  bids: [string, string][] // [price, quantity]
  asks: [string, string][]
  lastUpdateId: number
}

export interface TradeTick {
  price: string
  qty: string
  time: number
  isBuyerMaker: boolean
}

// ============================================================
// Race Condition Detector
// ============================================================

export class RaceConditionDetector {
  private symbol: string
  private ws: WebSocket | null = null
  private restApiBase: string
  private events: RaceConditionEvent[] = []
  private lastOrderBookUpdate: number = 0
  private lastTradeTime: number = 0
  private depthHistory: Map<number, number> = new Map() // price -> total size
  private isRunning: boolean = false
  private onEvent: (event: RaceConditionEvent) => void
  private onMetrics: (metrics: RaceConditionMetrics) => void
  private intervalId: NodeJS.Timeout | null = null
  private metricsIntervalId: NodeJS.Timeout | null = null
  private consecutiveSpoofs: number = 0
  private consecutiveRealMoves: number = 0

  constructor(
    symbol: string = "btcusdt",
    onEvent: (event: RaceConditionEvent) => void,
    onMetrics: (metrics: RaceConditionMetrics) => void
  ) {
    this.symbol = symbol.toLowerCase()
    this.restApiBase = "https://api.binance.com"
    this.onEvent = onEvent
    this.onMetrics = onMetrics
  }

  /**
   * Start the race condition detector.
   * Opens WebSocket + polls REST API simultaneously.
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true

    // 1. Open WebSocket for order book updates
    this.connectWebSocket()

    // 2. Poll REST API for recent trades (every 500ms)
    this.intervalId = setInterval(() => this.pollRecentTrades(), 500)

    // 3. Emit metrics every second
    this.metricsIntervalId = setInterval(() => this.emitMetrics(), 1000)

    console.log(`[RaceCondition] Started monitoring ${this.symbol}`)
  }

  /**
   * Stop the detector.
   */
  stop(): void {
    this.isRunning = false
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.metricsIntervalId) {
      clearInterval(this.metricsIntervalId)
      this.metricsIntervalId = null
    }
    console.log(`[RaceCondition] Stopped monitoring ${this.symbol}`)
  }

  /**
   * Get all events for analysis.
   */
  getEvents(): RaceConditionEvent[] {
    return [...this.events]
  }

  /**
   * Clear event history.
   */
  clearEvents(): void {
    this.events = []
    this.depthHistory.clear()
    this.consecutiveSpoofs = 0
    this.consecutiveRealMoves = 0
  }

  /**
   * Change the symbol being monitored.
   */
  setSymbol(symbol: string): void {
    const wasRunning = this.isRunning
    if (wasRunning) this.stop()
    this.symbol = symbol.toLowerCase()
    this.clearEvents()
    if (wasRunning) this.start()
  }

  // ============================================================
  // WebSocket Connection (Order Book Stream)
  // ============================================================

  private connectWebSocket(): void {
    try {
      // Use Binance's depth stream (100ms updates)
      const wsUrl = `wss://stream.binance.com:9443/ws/${this.symbol}@depth@100ms`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log(`[RaceCondition] WebSocket connected for ${this.symbol}`)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.processDepthUpdate(data)
        } catch (e) {
          // Ignore parse errors
        }
      }

      this.ws.onerror = () => {
        // Will reconnect
      }

      this.ws.onclose = () => {
        if (this.isRunning) {
          // Reconnect after 2 seconds
          setTimeout(() => this.connectWebSocket(), 2000)
        }
      }
    } catch (e) {
      // WebSocket not supported, fall back to REST polling
      console.warn("[RaceCondition] WebSocket failed, using REST polling")
    }
  }

  // ============================================================
  // Depth Update Processing
  // ============================================================

  private processDepthUpdate(data: any): void {
    const now = Date.now()
    this.lastOrderBookUpdate = now

    // Process bid changes
    if (data.b) {
      for (const [priceStr, qtyStr] of data.b) {
        const price = parseFloat(priceStr)
        const qty = parseFloat(qtyStr)
        
        if (qty === 0) {
          // Level removed
          const prevSize = this.depthHistory.get(price) || 0
          if (prevSize > 0) {
            // Depth collapsed at this level
            const event: RaceConditionEvent = {
              timestamp: now,
              type: "depth_collapse",
              symbol: this.symbol.toUpperCase(),
              price,
              size: prevSize,
              side: "buy",
              latency_ms: now - this.lastTradeTime,
              confidence: 0.5,
            }
            this.events.push(event)
            this.onEvent(event)
          }
          this.depthHistory.delete(price)
        } else {
          this.depthHistory.set(price, qty)
        }
      }
    }

    // Process ask changes
    if (data.a) {
      for (const [priceStr, qtyStr] of data.a) {
        const price = parseFloat(priceStr)
        const qty = parseFloat(qtyStr)
        
        if (qty === 0) {
          const prevSize = this.depthHistory.get(price) || 0
          if (prevSize > 0) {
            const event: RaceConditionEvent = {
              timestamp: now,
              type: "depth_collapse",
              symbol: this.symbol.toUpperCase(),
              price,
              size: prevSize,
              side: "sell",
              latency_ms: now - this.lastTradeTime,
              confidence: 0.5,
            }
            this.events.push(event)
            this.onEvent(event)
          }
          this.depthHistory.delete(price)
        } else {
          this.depthHistory.set(price, qty)
        }
      }
    }

    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500)
    }
  }

  // ============================================================
  // REST API Trade Polling
  // ============================================================

  private async pollRecentTrades(): Promise<void> {
    try {
      const response = await fetch(
        `${this.restApiBase}/api/v3/trades?symbol=${this.symbol.toUpperCase()}&limit=10`,
        { signal: AbortSignal.timeout(3000) }
      )

      if (!response.ok) return

      const trades: TradeTick[] = await response.json()
      const now = Date.now()

      for (const trade of trades) {
        const tradeTime = trade.time
        if (tradeTime <= this.lastTradeTime) continue // Skip old trades

        this.lastTradeTime = tradeTime
        const price = parseFloat(trade.price)
        const size = parseFloat(trade.qty)
        const side = trade.isBuyerMaker ? "sell" : "buy"

        // Calculate latency between order book update and trade
        const latency = now - this.lastOrderBookUpdate

        // Determine if this is spoofing or real liquidity taking
        const isSpoof = latency > 200 // If trade prints long after order book change, it might be spoofing
        const isReal = latency < 100 // If trade prints close to order book change, it's real

        const event: RaceConditionEvent = {
          timestamp: now,
          type: isSpoof ? "spoof_detected" : "real_liquidity_taking",
          symbol: this.symbol.toUpperCase(),
          price,
          size,
          side: side as "buy" | "sell",
          latency_ms: latency,
          confidence: isReal ? 0.8 : 0.3,
        }

        this.events.push(event)
        this.onEvent(event)

        if (isSpoof) {
          this.consecutiveSpoofs++
          this.consecutiveRealMoves = 0
        } else if (isReal) {
          this.consecutiveRealMoves++
          this.consecutiveSpoofs = 0
        }
      }
    } catch {
      // Silently fail - will retry on next interval
    }
  }

  // ============================================================
  // Metrics Emission
  // ============================================================

  private emitMetrics(): void {
    const recentEvents = this.events.slice(-100)
    const spoofEvents = recentEvents.filter(e => e.type === "spoof_detected").length
    const realEvents = recentEvents.filter(e => e.type === "real_liquidity_taking").length
    const latencies = recentEvents.map(e => e.latency_ms)
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0

    // Determine current signal
    let currentSignal: RaceConditionMetrics["currentSignal"] = "neutral"
    let signalConfidence = 0.5

    if (this.consecutiveSpoofs >= 3) {
      currentSignal = "spoofing"
      signalConfidence = Math.min(0.5 + this.consecutiveSpoofs * 0.1, 0.95)
    } else if (this.consecutiveRealMoves >= 3) {
      currentSignal = "real_move"
      signalConfidence = Math.min(0.5 + this.consecutiveRealMoves * 0.1, 0.95)
    } else if (recentEvents.length < 10) {
      currentSignal = "waiting"
      signalConfidence = 0.3
    }

    const metrics: RaceConditionMetrics = {
      symbol: this.symbol.toUpperCase(),
      totalEvents: this.events.length,
      spoofEvents,
      realLiquidityEvents: realEvents,
      averageLatencyMs: Math.round(avgLatency),
      lastUpdate: Date.now(),
      currentSignal,
      signalConfidence,
    }

    this.onMetrics(metrics)
  }
}

// ============================================================
// Utility: Analyze race condition data
// ============================================================

/**
 * Analyze a set of race condition events to determine market state.
 */
export function analyzeRaceConditions(events: RaceConditionEvent[]): {
  isManipulated: boolean
  manipulationType: "spoofing" | "wash_trading" | "none"
  confidence: number
  recommendation: string
} {
  if (events.length < 10) {
    return {
      isManipulated: false,
      manipulationType: "none",
      confidence: 0,
      recommendation: "Insufficient data. Need at least 10 events.",
    }
  }

  const recentEvents = events.slice(-50)
  const spoofCount = recentEvents.filter(e => e.type === "spoof_detected").length
  const realCount = recentEvents.filter(e => e.type === "real_liquidity_taking").length
  const spoofRatio = spoofCount / Math.max(recentEvents.length, 1)

  if (spoofRatio > 0.4) {
    return {
      isManipulated: true,
      manipulationType: "spoofing",
      confidence: Math.min(spoofRatio, 0.95),
      recommendation: "Market is being spoofed. Wait for real liquidity to appear before trading.",
    }
  }

  if (realCount > spoofCount * 2 && realCount > 10) {
    return {
      isManipulated: false,
      manipulationType: "none",
      confidence: 0.8,
      recommendation: "Real liquidity taking detected. Market is genuine.",
    }
  }

  return {
    isManipulated: false,
    manipulationType: "none",
    confidence: 0.5,
    recommendation: "Market conditions are neutral. Monitor for spoofing or real moves.",
  }
}

/**
 * Calculate the optimal entry delay based on race condition analysis.
 * If spoofing is detected, wait longer. If real, enter immediately.
 */
export function calculateOptimalEntryDelay(events: RaceConditionEvent[]): number {
  const analysis = analyzeRaceConditions(events)
  
  if (analysis.manipulationType === "spoofing") {
    // Wait for spoof to clear
    return 5000 // 5 seconds
  }

  if (analysis.manipulationType === "none" && analysis.confidence > 0.7) {
    // Real move - enter immediately
    return 0
  }

  // Default: wait 1 second
  return 1000
}
