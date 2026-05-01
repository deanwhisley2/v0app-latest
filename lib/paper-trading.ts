"use client"

/**
 * Paper Trading Engine
 * Virtual portfolio management with real-time P&L tracking
 * Integrates with NexusEngine for trade signals
 */

import { nexusEngine, type MarketData, type TradeDecision } from "../nexus-core/nexus-engine"
import { coinsData, type Coin } from "./coins-data"

// ============================================================
// Types
// ============================================================

export type OrderSide = "buy" | "sell"
export type OrderStatus = "pending" | "open" | "filled" | "partially_filled" | "cancelled" | "rejected"
export type OrderType = "market" | "limit" | "stop" | "stop_limit"

export interface PaperOrder {
  id: string
  symbol: string
  side: OrderSide
  type: OrderType
  status: OrderStatus
  quantity: number
  filledQuantity: number
  price: number // requested price (for limit/stop orders)
  avgFillPrice: number // actual average fill price
  stopPrice?: number
  leverage: number
  fee: number
  totalCost: number
  createdAt: number
  filledAt?: number
  expiresAt?: number
}

export interface PaperPosition {
  symbol: string
  quantity: number
  avgEntryPrice: number
  currentPrice: number
  pnl: number
  pnlPercentage: number
  unrealizedPnl: number
  realizedPnl: number
  leverage: number
  side: "long" | "short"
  openedAt: number
  updatedAt: number
}

export interface PaperPortfolio {
  totalBalance: number
  availableBalance: number
  usedBalance: number
  totalPnl: number
  totalPnlPercentage: number
  winRate: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  positions: PaperPosition[]
  orders: PaperOrder[]
  tradeHistory: PaperTrade[]
}

export interface PaperTrade {
  id: string
  symbol: string
  side: OrderSide
  quantity: number
  price: number
  total: number
  fee: number
  pnl?: number
  pnlPercentage?: number
  leverage: number
  timestamp: number
}

export interface PaperTradingConfig {
  initialBalance: number
  feeRate: number // e.g., 0.001 = 0.1%
  maxLeverage: number
  slippage: number // e.g., 0.001 = 0.1%
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: PaperTradingConfig = {
  initialBalance: 25000,
  feeRate: 0.001,
  maxLeverage: 20,
  slippage: 0.001,
}

const STORAGE_KEY = "nexus_paper_portfolio"

// ============================================================
// Paper Trading Engine
// ============================================================

class PaperTradingEngine {
  private portfolio: PaperPortfolio
  private config: PaperTradingConfig
  private orderCounter: number = 0

  constructor(config: Partial<PaperTradingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.portfolio = this.loadPortfolio()
  }

  // ============================================================
  // Portfolio Management
  // ============================================================

  private loadPortfolio(): PaperPortfolio {
    if (typeof window === "undefined") {
      return this.createDefaultPortfolio()
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as PaperPortfolio
        // Ensure all required fields exist (in case of schema changes)
        return {
          ...this.createDefaultPortfolio(),
          ...parsed,
          positions: parsed.positions || [],
          orders: parsed.orders || [],
          tradeHistory: parsed.tradeHistory || [],
        }
      }
    } catch {
      // Corrupted data, start fresh
      localStorage.removeItem(STORAGE_KEY)
    }

    return this.createDefaultPortfolio()
  }

  private createDefaultPortfolio(): PaperPortfolio {
    return {
      totalBalance: this.config.initialBalance,
      availableBalance: this.config.initialBalance,
      usedBalance: 0,
      totalPnl: 0,
      totalPnlPercentage: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      positions: [],
      orders: [],
      tradeHistory: [],
    }
  }

  private savePortfolio(): void {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.portfolio))
    } catch {
      // Storage full or unavailable
    }
  }

  getPortfolio(): PaperPortfolio {
    return { ...this.portfolio, positions: [...this.portfolio.positions], orders: [...this.portfolio.orders], tradeHistory: [...this.portfolio.tradeHistory] }
  }

  resetPortfolio(): void {
    this.portfolio = this.createDefaultPortfolio()
    this.savePortfolio()
  }

  // ============================================================
  // Order Management
  // ============================================================

  private generateOrderId(): string {
    this.orderCounter++
    return `paper_${Date.now()}_${this.orderCounter}_${Math.random().toString(36).substring(2, 8)}`
  }

  /**
   * Place a paper trade order
   */
  placeOrder(params: {
    symbol: string
    side: OrderSide
    type: OrderType
    quantity: number
    price?: number
    stopPrice?: number
    leverage?: number
  }): PaperOrder {
    const { symbol, side, type, quantity, price, stopPrice, leverage = 1 } = params

    // Validate
    if (quantity <= 0) {
      throw new Error("Quantity must be positive")
    }

    if (leverage < 1 || leverage > this.config.maxLeverage) {
      throw new Error(`Leverage must be between 1 and ${this.config.maxLeverage}`)
    }

    const coin = coinsData.find((c) => c.symbol === symbol)
    const currentPrice = coin?.price ?? price ?? 0

    if (currentPrice <= 0) {
      throw new Error(`Invalid price for ${symbol}`)
    }

    // Calculate required balance
    const orderValue = currentPrice * quantity
    const requiredBalance = orderValue / leverage

    if (requiredBalance > this.portfolio.availableBalance && type === "market") {
      throw new Error(`Insufficient balance. Required: $${requiredBalance.toFixed(2)}, Available: $${this.portfolio.availableBalance.toFixed(2)}`)
    }

    const order: PaperOrder = {
      id: this.generateOrderId(),
      symbol,
      side,
      type,
      status: "pending",
      quantity,
      filledQuantity: 0,
      price: price ?? currentPrice,
      avgFillPrice: 0,
      stopPrice,
      leverage,
      fee: 0,
      totalCost: 0,
      createdAt: Date.now(),
    }

    // Market orders execute immediately
    if (type === "market") {
      return this.executeMarketOrder(order, currentPrice)
    }

    // Limit/Stop orders go to pending
    order.status = "open"
    this.portfolio.orders.push(order)
    this.savePortfolio()
    return { ...order }
  }

  /**
   * Execute a market order immediately
   */
  private executeMarketOrder(order: PaperOrder, currentPrice: number): PaperOrder {
    // Apply slippage
    const slippageAmount = currentPrice * this.config.slippage
    const fillPrice = order.side === "buy"
      ? currentPrice + slippageAmount
      : currentPrice - slippageAmount

    const orderValue = fillPrice * order.quantity
    const fee = orderValue * this.config.feeRate
    const totalCost = orderValue + fee
    const usedBalance = totalCost / order.leverage

    // Check balance again with actual fill price
    if (usedBalance > this.portfolio.availableBalance) {
      order.status = "rejected"
      order.avgFillPrice = fillPrice
      this.portfolio.orders.push(order)
      this.savePortfolio()
      return { ...order }
    }

    // Update order
    order.status = "filled"
    order.filledQuantity = order.quantity
    order.avgFillPrice = fillPrice
    order.fee = fee
    order.totalCost = totalCost
    order.filledAt = Date.now()

    // Update portfolio balance
    this.portfolio.availableBalance -= usedBalance
    this.portfolio.usedBalance += usedBalance

    // Create or update position
    const existingPosition = this.portfolio.positions.find(
      (p) => p.symbol === order.symbol
    )

    if (existingPosition) {
      // Update existing position
      const totalQuantity = existingPosition.quantity + order.quantity
      const totalCostExisting = existingPosition.avgEntryPrice * existingPosition.quantity
      const totalCostNew = fillPrice * order.quantity
      existingPosition.avgEntryPrice = (totalCostExisting + totalCostNew) / totalQuantity
      existingPosition.quantity = totalQuantity
      existingPosition.leverage = Math.max(existingPosition.leverage, order.leverage)
      existingPosition.side = order.side === "buy" ? "long" : "short"
      existingPosition.updatedAt = Date.now()
    } else {
      // Create new position
      this.portfolio.positions.push({
        symbol: order.symbol,
        quantity: order.quantity,
        avgEntryPrice: fillPrice,
        currentPrice: fillPrice,
        pnl: 0,
        pnlPercentage: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        leverage: order.leverage,
        side: order.side === "buy" ? "long" : "short",
        openedAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    // Record trade
    const trade: PaperTrade = {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
      total: totalCost,
      fee,
      leverage: order.leverage,
      timestamp: Date.now(),
    }
    this.portfolio.tradeHistory.push(trade)
    this.portfolio.totalTrades++

    this.portfolio.orders.push(order)
    this.savePortfolio()
    return { ...order }
  }

  /**
   * Close a position (market order)
   */
  closePosition(symbol: string, quantity?: number): PaperOrder | null {
    const position = this.portfolio.positions.find((p) => p.symbol === symbol)
    if (!position) return null

    const closeQty = quantity ?? position.quantity
    if (closeQty <= 0 || closeQty > position.quantity) return null

    const coin = coinsData.find((c) => c.symbol === symbol)
    const currentPrice = coin?.price ?? 0

    if (currentPrice <= 0) return null

    const side: OrderSide = position.side === "long" ? "sell" : "buy"

    // Calculate P&L
    const entryValue = position.avgEntryPrice * closeQty
    const exitValue = currentPrice * closeQty
    const rawPnl = position.side === "long" ? exitValue - entryValue : entryValue - exitValue
    const leveragedPnl = rawPnl * position.leverage
    const fee = exitValue * this.config.feeRate
    const netPnl = leveragedPnl - fee

    // Create close order
    const order: PaperOrder = {
      id: this.generateOrderId(),
      symbol,
      side,
      type: "market",
      status: "filled",
      quantity: closeQty,
      filledQuantity: closeQty,
      price: currentPrice,
      avgFillPrice: currentPrice,
      leverage: position.leverage,
      fee,
      totalCost: exitValue,
      createdAt: Date.now(),
      filledAt: Date.now(),
    }

    // Update position
    position.quantity -= closeQty
    position.realizedPnl += netPnl
    position.currentPrice = currentPrice
    position.updatedAt = Date.now()

    // Update portfolio
    const releasedBalance = (entryValue / position.leverage) + (netPnl > 0 ? netPnl : 0)
    this.portfolio.availableBalance += releasedBalance
    this.portfolio.usedBalance -= (entryValue / position.leverage)
    this.portfolio.totalPnl += netPnl
    this.portfolio.totalPnlPercentage = (this.portfolio.totalPnl / this.config.initialBalance) * 100

    // Track win/loss
    if (netPnl > 0) {
      this.portfolio.winningTrades++
    } else {
      this.portfolio.losingTrades++
    }
    this.portfolio.winRate = this.portfolio.totalTrades > 0
      ? (this.portfolio.winningTrades / this.portfolio.totalTrades) * 100
      : 0

    // Record trade
    const trade: PaperTrade = {
      id: order.id,
      symbol,
      side,
      quantity: closeQty,
      price: currentPrice,
      total: exitValue,
      fee,
      pnl: netPnl,
      pnlPercentage: (netPnl / entryValue) * 100,
      leverage: position.leverage,
      timestamp: Date.now(),
    }
    this.portfolio.tradeHistory.push(trade)

    // Remove position if fully closed
    if (position.quantity <= 0) {
      this.portfolio.positions = this.portfolio.positions.filter(
        (p) => p.symbol !== symbol
      )
    }

    this.portfolio.orders.push(order)
    this.savePortfolio()
    return { ...order }
  }

  /**
   * Cancel an open order
   */
  cancelOrder(orderId: string): boolean {
    const orderIndex = this.portfolio.orders.findIndex(
      (o) => o.id === orderId && o.status === "open"
    )
    if (orderIndex === -1) return false

    this.portfolio.orders[orderIndex].status = "cancelled"
    this.savePortfolio()
    return true
  }

  // ============================================================
  // Position & P&L Updates
  // ============================================================

  /**
   * Update all positions with current market prices
   * Call this periodically (e.g., every second) for real-time P&L
   */
  updatePositions(priceMap: Record<string, number>): void {
    let totalUnrealizedPnl = 0

    for (const position of this.portfolio.positions) {
      const currentPrice = priceMap[position.symbol]
      if (!currentPrice) continue

      position.currentPrice = currentPrice
      position.updatedAt = Date.now()

      const entryValue = position.avgEntryPrice * position.quantity
      const currentValue = currentPrice * position.quantity

      if (position.side === "long") {
        position.unrealizedPnl = (currentValue - entryValue) * position.leverage
      } else {
        position.unrealizedPnl = (entryValue - currentValue) * position.leverage
      }

      position.pnl = position.realizedPnl + position.unrealizedPnl
      position.pnlPercentage = entryValue > 0
        ? (position.pnl / entryValue) * 100
        : 0

      totalUnrealizedPnl += position.unrealizedPnl
    }

    // Update total portfolio P&L
    this.portfolio.totalPnl = this.portfolio.tradeHistory
      .filter((t) => t.pnl !== undefined)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0) + totalUnrealizedPnl

    this.portfolio.totalPnlPercentage = this.config.initialBalance > 0
      ? (this.portfolio.totalPnl / this.config.initialBalance) * 100
      : 0

    this.savePortfolio()
  }

  // ============================================================
  // Nexus Engine Integration
  // ============================================================

  /**
   * Get a trade signal from the Nexus Engine and optionally auto-trade
   */
  analyzeAndTrade(
    symbol: string,
    historicalPrices: number[],
    volumes: number[],
    currentPrice: number,
    autoTrade: boolean = false,
    tradeAmount: number = 100
  ): { decision: TradeDecision; order?: PaperOrder } {
    const marketData: MarketData = {
      symbol,
      currentPrice,
      historicalPrices,
      volumes,
      orderBook: { bids: [], asks: [] },
      change24h: 0,
      high24h: currentPrice * 1.02,
      low24h: currentPrice * 0.98,
      volume24h: volumes.reduce((sum, v) => sum + v, 0),
    }

    const decision = nexusEngine.getTradeSignal(marketData)

    let order: PaperOrder | undefined

    if (autoTrade && (decision.action === "STRONG_BUY" || decision.action === "BUY")) {
      const quantity = tradeAmount / currentPrice
      try {
        order = this.placeOrder({
          symbol,
          side: "buy",
          type: "market",
          quantity,
          leverage: 1,
        })
      } catch {
        // Insufficient balance, skip
      }
    } else if (autoTrade && (decision.action === "STRONG_SELL" || decision.action === "SELL")) {
      // Close existing position if any
      const position = this.portfolio.positions.find((p) => p.symbol === symbol)
      if (position) {
        const closeOrder = this.closePosition(symbol)
        if (closeOrder) order = closeOrder
      }
    }

    return { decision, order }
  }
}

// Singleton instance
export const paperTradingEngine = new PaperTradingEngine()

