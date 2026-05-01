"use client"

/**
 * FEE OPTIMIZER
 *
 * Ensures Nexus Pro never pays taker fees.
 * 100% maker (limit) orders only — always 0.075% with BNB discount.
 *
 * Rules:
 * - Always use LIMIT orders, never MARKET
 * - Offset limit price 0.05% from market to ensure maker fill
 * - Calculate if a trade is worth the fee impact
 * - Cap daily trades based on capital size
 */

export interface FeeConfig {
  makerFee: number       // 0.075% with BNB
  takerFee: number       // 0.10% without BNB
  useMakerOnly: boolean
  bnbDiscountEnabled: boolean
}

export interface MakerOrderParams {
  symbol: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
}

export interface MakerOrderResult {
  type: 'LIMIT'
  price: number
  quantity: number
  timeInForce: 'GTC' | 'IOC' | 'FOK'
  feeRate: number
  estimatedFee: number
  offsetPercent: number
}

export class FeeOptimizer {
  private config: FeeConfig

  constructor(config?: Partial<FeeConfig>) {
    this.config = {
      makerFee: 0.00075,        // 0.075% with BNB
      takerFee: 0.0010,         // 0.10% without BNB
      useMakerOnly: true,
      bnbDiscountEnabled: true,
      ...config,
    }
  }

  /**
   * Create a maker (limit) order that will pay the lowest fee.
   * Offsets the price slightly from market to ensure it rests on the book
   * and gets filled as a maker (not taker).
   */
  createMakerOrder(params: MakerOrderParams): MakerOrderResult {
    const { symbol, side, price, quantity } = params

    // Offset 0.05% from market price to ensure maker fill
    // Buy: place slightly below market (0.05% lower)
    // Sell: place slightly above market (0.05% higher)
    const offset = side === 'buy' ? -0.0005 : 0.0005
    const limitPrice = price * (1 + offset)

    const feeRate = this.config.makerFee
    const estimatedFee = limitPrice * quantity * feeRate

    return {
      type: 'LIMIT',
      price: Math.round(limitPrice * 100) / 100,
      quantity,
      timeInForce: 'GTC',
      feeRate,
      estimatedFee: Math.round(estimatedFee * 100) / 100,
      offsetPercent: offset * 100,
    }
  }

  /**
   * Calculate if a trade is worth executing after fees.
   * Ensures expected profit exceeds fee impact with a safety buffer.
   */
  isWorthFees(expectedProfitPercent: number, numberOfTrades: number = 1): boolean {
    // Each trade has entry + exit = 2 fee events
    // With maker fee: 0.075% per side
    const feeImpact = this.config.makerFee * 2 * numberOfTrades
    // Require 50% buffer above fee cost
    return expectedProfitPercent > feeImpact * 1.5
  }

  /**
   * Calculate total fee cost for a round-trip trade (entry + exit)
   */
  calculateRoundTripFee(tradeValue: number): number {
    const entryFee = tradeValue * this.config.makerFee
    const exitFee = tradeValue * this.config.makerFee
    return Math.round((entryFee + exitFee) * 100) / 100
  }

  /**
   * Get the minimum profit needed to make a trade worthwhile
   */
  getMinimumProfitThreshold(tradeValue: number): number {
    const fees = this.calculateRoundTripFee(tradeValue)
    // Need 1.5x the fee cost as minimum profit
    return Math.round((fees * 1.5) * 100) / 100
  }

  /**
   * Daily trade cap based on available capital.
   * Prevents overtrading and excessive fee accumulation.
   */
  getDailyTradeCap(capital: number): number {
    if (capital < 100) return 2
    if (capital < 500) return 6
    if (capital < 1000) return 10
    return 20 // $1000+
  }

  /**
   * Get current fee configuration
   */
  getConfig(): FeeConfig {
    return { ...this.config }
  }

  /**
   * Update fee configuration
   */
  updateConfig(config: Partial<FeeConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Estimate savings vs using market (taker) orders
   */
  estimateSavings(tradeValue: number, numberOfTrades: number = 1): {
    makerCost: number
    takerCost: number
    savings: number
    savingsPercent: number
  } {
    const makerCost = tradeValue * this.config.makerFee * 2 * numberOfTrades
    const takerCost = tradeValue * this.config.takerFee * 2 * numberOfTrades
    const savings = takerCost - makerCost

    return {
      makerCost: Math.round(makerCost * 100) / 100,
      takerCost: Math.round(takerCost * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      savingsPercent: Math.round((savings / takerCost) * 100 * 100) / 100,
    }
  }
}
