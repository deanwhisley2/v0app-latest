/**
 * CLINE INSTRUCTION: Bot Registry — defines all trading bots/strategies
 * that can be controlled via the bot-commander API route.
 *
 * Each bot sends signals to the Strategy Commander for validation.
 * Bots do NOT execute trades directly.
 */

export interface BotDefinition {
  id: string
  name: string
  description: string
  defaultSymbol: string
  defaultRiskPercent: number
  defaultMode: "paper" | "live"
  source: string // SignalSource from trading-signal.ts
}

export interface BotStatus {
  status: "RUNNING" | "PAUSED" | "STOPPED" | "ERROR"
  todayPnL: number
  winRate: number
  confidence: number
  totalTrades: number
  lastSignalAt: string | null
  uptime: number // seconds
}

// ============================================================
// Bot Registry — Add new bots here
// ============================================================

export const BOT_REGISTRY: BotDefinition[] = [
  {
    id: "liquidity-warfare",
    name: "Liquidity Warfare",
    description: "Detects stop hunts, liquidity sweeps, and cluster fades",
    defaultSymbol: "BTCUSDT",
    defaultRiskPercent: 1.5,
    defaultMode: "paper",
    source: "liquidity_warfare"
  },
  {
    id: "sentiment-weapon",
    name: "Sentiment Weapon",
    description: "Order book imbalance, funding rate analysis, whale tracking",
    defaultSymbol: "BTCUSDT",
    defaultRiskPercent: 1.0,
    defaultMode: "paper",
    source: "sentiment_weapon"
  },
  {
    id: "nexus-engine",
    name: "Nexus Engine",
    description: "Kalman filter + Shadow Book + Smart Money positioning",
    defaultSymbol: "BTCUSDT",
    defaultRiskPercent: 1.5,
    defaultMode: "paper",
    source: "nexus_engine"
  },
  {
    id: "contrarian-engine",
    name: "Contrarian Engine",
    description: "Enhanced trading engine for contrarian entries",
    defaultSymbol: "BTCUSDT",
    defaultRiskPercent: 1.2,
    defaultMode: "paper",
    source: "contrarian_engine"
  },
  {
    id: "strategy-learner",
    name: "Strategy Learner",
    description: "Learns from historical trade patterns",
    defaultSymbol: "BTCUSDT",
    defaultRiskPercent: 1.0,
    defaultMode: "paper",
    source: "strategy_learner"
  },
  {
    id: "market-intelligence",
    name: "Market Intelligence",
    description: "Session-aware, pre-pump detection, cross-coin analysis",
    defaultSymbol: "BTCUSDT",
    defaultRiskPercent: 1.0,
    defaultMode: "paper",
    source: "market_intelligence"
  }
]

// ============================================================
// In-memory bot status store
// ============================================================

const botStatuses = new Map<string, BotStatus>()

// Initialize all bots as STOPPED
for (const bot of BOT_REGISTRY) {
  botStatuses.set(bot.id, {
    status: "STOPPED",
    todayPnL: 0,
    winRate: 0,
    confidence: 0,
    totalTrades: 0,
    lastSignalAt: null,
    uptime: 0
  })
}

/**
 * Get the current status of a bot
 */
export function getBotStatus(botId: string): BotStatus {
  return botStatuses.get(botId) || {
    status: "STOPPED",
    todayPnL: 0,
    winRate: 0,
    confidence: 0,
    totalTrades: 0,
    lastSignalAt: null,
    uptime: 0
  }
}

/**
 * Update bot status (called by the bot itself or the commander)
 */
export function updateBotStatus(botId: string, updates: Partial<BotStatus>): BotStatus {
  const current = getBotStatus(botId)
  const updated = { ...current, ...updates }
  botStatuses.set(botId, updated)
  return updated
}

/**
 * Reset all bot statuses (e.g., at start of new trading day)
 */
export function resetAllBotStatuses(): void {
  for (const bot of BOT_REGISTRY) {
    botStatuses.set(bot.id, {
      status: "STOPPED",
      todayPnL: 0,
      winRate: 0,
      confidence: 0,
      totalTrades: 0,
      lastSignalAt: null,
      uptime: 0
    })
  }
}
