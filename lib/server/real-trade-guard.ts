/**
 * Server-only safety gate for NEXUS real spot trading (single-process memory).
 * For serverless, each instance has its own counters — use Redis/DB for production.
 */

/** USDT spot pairs allowed for live execution (comma-separated, e.g. `BTCUSDT,ETHUSDT,SOLUSDT`). */
export function getRealTradeAllowedSymbols(): Set<string> {
  const raw = process.env.NEXUS_REAL_TRADE_SYMBOLS?.trim()
  if (!raw) return new Set(["BTCUSDT", "ETHUSDT"])
  const out = new Set<string>()
  for (const part of raw.split(",")) {
    let s = part.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (!s) continue
    if (!s.endsWith("USDT")) s = `${s}USDT`
    out.add(s)
  }
  return out.size > 0 ? out : new Set(["BTCUSDT", "ETHUSDT"])
}

const DEFAULT_CAPITAL_USD = 20
const MAX_RISK_USD_PER_TRADE = 0.4 // 2% of $20
const MAX_DAILY_LOSS_USD = 4 // 20% of capital
const LARGE_SINGLE_LOSS_USD = 0.8
const PAUSE_MS_AFTER_LARGE_LOSS = 60 * 60 * 1000

type GuardState = {
  dayKey: string
  dailyPnlUsd: number
  pausedUntilMs: number
}

let state: GuardState = {
  dayKey: new Date().toISOString().slice(0, 10),
  dailyPnlUsd: 0,
  pausedUntilMs: 0,
}

function rollDay() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== state.dayKey) {
    state = { dayKey: today, dailyPnlUsd: 0, pausedUntilMs: 0 }
  }
}

export function isRealTradingEnvEnabled(): boolean {
  return process.env.NEXUS_REAL_TRADING === "1"
}

export function assertRealTradingEnabled(): void {
  if (!isRealTradingEnvEnabled()) {
    throw new Error("NEXUS_REAL_TRADING=1 is required for live Binance execution")
  }
}

export function getGuardSnapshot() {
  rollDay()
  return { ...state, allowedSymbols: [...getRealTradeAllowedSymbols()] }
}

export function validateRealTradeRequest(input: {
  symbol: string
  action: "BUY" | "SELL"
  quoteSpendUsd?: number
  baseQuantity?: number
  portfolioUsd?: number
}): { ok: true } | { ok: false; reason: string } {
  rollDay()
  const sym = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const pair = sym.endsWith("USDT") ? sym : `${sym}USDT`
  const allowed = getRealTradeAllowedSymbols()
  if (!allowed.has(pair)) {
    return { ok: false, reason: `Symbol ${pair} not allowed (${[...allowed].join(", ")})` }
  }
  const now = Date.now()
  if (now < state.pausedUntilMs) {
    const left = Math.ceil((state.pausedUntilMs - now) / 60000)
    return { ok: false, reason: `Trading paused ${left}m after large loss` }
  }
  if (state.dailyPnlUsd <= -MAX_DAILY_LOSS_USD) {
    return { ok: false, reason: `Max daily loss $${MAX_DAILY_LOSS_USD} reached` }
  }
  const capital = input.portfolioUsd ?? DEFAULT_CAPITAL_USD
  if (input.action === "BUY") {
    const spend = input.quoteSpendUsd ?? 0
    if (!Number.isFinite(spend) || spend <= 0) {
      return { ok: false, reason: "Invalid quote spend for BUY" }
    }
    if (spend > capital) {
      return { ok: false, reason: `Spend $${spend.toFixed(2)} exceeds capital $${capital}` }
    }
    if (spend > MAX_RISK_USD_PER_TRADE * 25) {
      return { ok: false, reason: `Per-order spend capped for safety ($${(MAX_RISK_USD_PER_TRADE * 25).toFixed(2)})` }
    }
  } else {
    const q = input.baseQuantity ?? 0
    if (!Number.isFinite(q) || q <= 0) {
      return { ok: false, reason: "Invalid base quantity for SELL" }
    }
  }
  return { ok: true }
}

/** Call after a closed trade with realized PnL in USD (+ profit, − loss). */
export function recordRealizedPnlUsd(pnlUsd: number): void {
  rollDay()
  state.dailyPnlUsd += pnlUsd
  if (pnlUsd <= -LARGE_SINGLE_LOSS_USD) {
    state.pausedUntilMs = Date.now() + PAUSE_MS_AFTER_LARGE_LOSS
    console.warn(
      `[real-trade-guard] Large loss $${pnlUsd.toFixed(2)} — pausing ${PAUSE_MS_AFTER_LARGE_LOSS / 60000} minutes`
    )
  }
}

export function maxRiskUsdForTrade(portfolioUsd: number = DEFAULT_CAPITAL_USD): number {
  return Math.min(MAX_RISK_USD_PER_TRADE, portfolioUsd * 0.02)
}
