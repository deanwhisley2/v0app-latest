"use client"

/**
 * MARKET INTELLIGENCE ENGINE
 *
 * 24/7 market awareness system that understands:
 * - Which trading session is currently active (London, NY, Asia, overlap)
 * - Volatility and liquidity conditions per session
 * - Time-based confidence adjustments
 * - Pre-pump opportunity detection (before retail catches on)
 *
 * This engine feeds into the TradingScheduler to make session-aware decisions.
 */

export interface MarketSession {
  name: string
  timezone: string
  hours: number[]   // 0-23 UTC
  volatility: number // 0-100
  liquidity: number  // 0-100
  description: string
}

export interface PrePumpSignal {
  symbol: string
  reason: string
  confidence: number
  volumeSurge: number
  timeUntilPump: number // estimated minutes
}

export class MarketIntelligenceEngine {
  private sessions: MarketSession[] = [
    {
      name: 'LONDON',
      timezone: 'UTC+0',
      hours: [7, 8, 9, 10, 11, 12, 13, 14, 15],
      volatility: 85,
      liquidity: 90,
      description: 'London open — high volume, institutional flow begins',
    },
    {
      name: 'NEW_YORK',
      timezone: 'UTC-4',
      hours: [12, 13, 14, 15, 16, 17, 18, 19, 20],
      volatility: 90,
      liquidity: 95,
      description: 'New York open — highest volume session',
    },
    {
      name: 'ASIA',
      timezone: 'UTC+8',
      hours: [23, 0, 1, 2, 3, 4, 5, 6],
      volatility: 60,
      liquidity: 70,
      description: 'Asia session — lower volume, range-bound movement',
    },
    {
      name: 'LONDON_NEW_YORK_OVERLAP',
      timezone: 'UTC',
      hours: [12, 13, 14, 15, 16],
      volatility: 100,
      liquidity: 100,
      description: 'London/NY overlap — maximum liquidity, best trading window',
    },
    {
      name: 'QUIET_HOURS',
      timezone: 'UTC',
      hours: [21, 22, 23, 0, 1, 2, 3, 4, 5, 6],
      volatility: 30,
      liquidity: 40,
      description: 'Quiet hours — wide spreads, low liquidity, avoid if possible',
    },
  ]

  /**
   * Get the current active market session based on UTC hour
   */
  getCurrentSession(): MarketSession {
    const currentHour = new Date().getUTCHours()

    // Check overlap first (most specific)
    const overlap = this.sessions.find(
      (s) => s.name === 'LONDON_NEW_YORK_OVERLAP' && s.hours.includes(currentHour)
    )
    if (overlap) return overlap

    // Check individual sessions
    for (const session of this.sessions) {
      if (session.name === 'LONDON_NEW_YORK_OVERLAP' || session.name === 'QUIET_HOURS') continue
      if (session.hours.includes(currentHour)) return session
    }

    // Default to quiet hours
    return this.sessions[4]
  }

  /**
   * Get all market sessions
   */
  getAllSessions(): MarketSession[] {
    return [...this.sessions]
  }

  /**
   * Calculate time-based confidence multiplier for a trade decision.
   * Boosts confidence during high-liquidity sessions, reduces during quiet hours.
   */
  getTimeBasedConfidence(coinConfidence: number): number {
    const session = this.getCurrentSession()

    switch (session.name) {
      case 'LONDON_NEW_YORK_OVERLAP':
        return coinConfidence * 1.3 // 30% boost — best trading window
      case 'LONDON':
        return coinConfidence * 1.15 // 15% boost
      case 'NEW_YORK':
        return coinConfidence * 1.1 // 10% boost
      case 'ASIA':
        return coinConfidence * 0.85 // 15% reduction
      case 'QUIET_HOURS':
        return coinConfidence * 0.7 // 30% reduction — spreads widen
      default:
        return coinConfidence
    }
  }

  /**
   * Get position size multiplier based on current liquidity.
   * Reduces size during low liquidity to manage risk.
   */
  getPositionSizeMultiplier(): number {
    const session = this.getCurrentSession()
    if (session.liquidity < 50) return 0.5  // Half size
    if (session.liquidity < 70) return 0.75 // Three-quarter size
    return 1.0 // Full size
  }

  /**
   * Get dynamic stop loss percentage based on session volatility.
   * More volatile sessions need wider stops.
   */
  getStopLossPercent(coinVolatility: number): number {
    const session = this.getCurrentSession()
    const baseStop = 1.0 + (coinVolatility / 100)
    // Wider stops during high volatility sessions
    const volatilityMultiplier = session.volatility / 50
    return Math.min(2.5, baseStop * volatilityMultiplier)
  }

  /**
   * Check if it's safe to trade right now based on market conditions.
   */
  isSafeToTrade(capital: number): { safe: boolean; reason?: string } {
    const session = this.getCurrentSession()

    // Never trade during quiet hours if capital < $500
    if (session.name === 'QUIET_HOURS' && capital < 500) {
      return {
        safe: false,
        reason: `QUIET_HOURS with $${capital} capital — spreads too wide, liquidity too low`,
      }
    }

    // Reduced confidence during Asia session with small capital
    if (session.name === 'ASIA' && capital < 200) {
      return {
        safe: false,
        reason: `ASIA session with $${capital} capital — low liquidity, small accounts at risk`,
      }
    }

    return { safe: true }
  }

  /**
   * Find coins showing pre-pump signals.
   * Strategies:
   * 1. Unusual volume increase (>300% in last hour)
   * 2. Positive funding rate divergence
   * 3. Breakout from consolidation on low timeframe
   * 4. Social sentiment spikes
   *
   * In production, this connects to Binance WebSocket + social feeds.
   * For now, returns simulated pre-pump candidates.
   */
  async findPrePumpOpportunities(): Promise<PrePumpSignal[]> {
    const session = this.getCurrentSession()

    // Simulated pre-pump detection
    // In production, this would analyze real-time data
    const candidates: PrePumpSignal[] = [
      {
        symbol: 'MYROUSDT',
        reason: 'Volume surge 340% above 1h average + consolidation breakout',
        confidence: 78,
        volumeSurge: 340,
        timeUntilPump: Math.floor(Math.random() * 15) + 5,
      },
      // Removed COQUSDT (not on Binance)
      {
        symbol: 'PEPEUSDT',
        reason: 'Low timeframe consolidation breakout + increasing bid depth',
        confidence: 65,
        volumeSurge: 150,
        timeUntilPump: Math.floor(Math.random() * 30) + 15,
      },
    ]

    // Filter by session — more aggressive during high liquidity
    if (session.liquidity >= 90) {
      return candidates // All candidates during high liquidity
    } else if (session.liquidity >= 70) {
      return candidates.filter((c) => c.confidence > 70) // Only high confidence
    } else {
      return candidates.filter((c) => c.confidence > 75) // Only strongest signals
    }
  }

  /**
   * Get a human-readable summary of current market conditions
   */
  getMarketSummary(): string {
    const session = this.getCurrentSession()
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMin = now.getUTCMinutes()

    return [
      `🌍 Market: ${session.name}`,
      `   Time: ${utcHour.toString().padStart(2, '0')}:${utcMin.toString().padStart(2, '0')} UTC`,
      `   Volatility: ${session.volatility}/100`,
      `   Liquidity: ${session.liquidity}/100`,
      `   ${session.description}`,
    ].join('\n')
  }
}
