/**
 * Bot Capability Types — extended types for the Bot Commander UI
 * These extend the base BotDefinition and BotStatus from bot-registry.ts
 * with UI-specific display fields.
 */

import { BotDefinition } from './bot-registry'

/**
 * Extended bot definition with UI display fields
 */
export interface BotCapability extends BotDefinition {
  defaultSymbol: string
  defaultRiskPercent: number
}

/**
 * Extended bot status with UI display fields
 * Note: This is a standalone interface (not extending BotStatus)
 * because the status union type includes BLOCKED_BY_SAFETY
 */
export interface BotStatusUI {
  status: "RUNNING" | "PAUSED" | "STOPPED" | "BLOCKED_BY_SAFETY" | "ERROR"
  todayPnL: number
  winRate: number
  confidence: number
  totalTrades: number
  lastSignalAt: string | null
  uptime: number
  currentSymbol?: string
  currentRisk?: number
  lastAction?: string
  isPaperTrading?: boolean
}
