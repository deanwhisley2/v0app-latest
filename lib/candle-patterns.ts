/**
 * Candle Pattern Detection Engine
 * Detects common candlestick patterns in real-time
 */

import type { Candle, CandlePattern, PatternAlert, Timeframe } from "./trading-workspace-types"

// ============================================================
// Pattern Detection Functions
// ============================================================

function isDoji(candle: Candle, threshold = 0.01): boolean {
  const body = Math.abs(candle.close - candle.open)
  const range = candle.high - candle.low
  return range > 0 && body / range < threshold
}

function isHammer(candle: Candle): boolean {
  const body = Math.abs(candle.close - candle.open)
  const upperWick = candle.high - Math.max(candle.close, candle.open)
  const lowerWick = Math.min(candle.close, candle.open) - candle.low
  return lowerWick >= body * 2 && upperWick <= body * 0.3
}

function isHangingMan(candle: Candle): boolean {
  // Same shape as hammer, but appears in uptrend
  return isHammer(candle)
}

function isShootingStar(candle: Candle): boolean {
  const body = Math.abs(candle.close - candle.open)
  const upperWick = candle.high - Math.max(candle.close, candle.open)
  const lowerWick = Math.min(candle.close, candle.open) - candle.low
  return upperWick >= body * 2 && lowerWick <= body * 0.3
}

function isBullishEngulfing(prev: Candle, curr: Candle): boolean {
  return prev.close < prev.open && curr.close > curr.open && curr.open < prev.close && curr.close > prev.open
}

function isBearishEngulfing(prev: Candle, curr: Candle): boolean {
  return prev.close > prev.open && curr.close < curr.open && curr.open > prev.close && curr.close < prev.open
}

function isMorningStar(prev: Candle, middle: Candle, curr: Candle): boolean {
  // Bearish candle, small body middle, bullish candle that closes above prev's midpoint
  return (
    prev.close < prev.open &&
    Math.abs(middle.close - middle.open) < Math.abs(prev.close - prev.open) * 0.3 &&
    curr.close > curr.open &&
    curr.close > (prev.high + prev.low) / 2
  )
}

function isEveningStar(prev: Candle, middle: Candle, curr: Candle): boolean {
  return (
    prev.close > prev.open &&
    Math.abs(middle.close - middle.open) < Math.abs(prev.close - prev.open) * 0.3 &&
    curr.close < curr.open &&
    curr.close < (prev.high + prev.low) / 2
  )
}

function isThreeWhiteSoldiers(c1: Candle, c2: Candle, c3: Candle): boolean {
  return (
    c1.close > c1.open &&
    c2.close > c2.open &&
    c3.close > c3.open &&
    c2.close > c1.close &&
    c3.close > c2.close &&
    c2.open > c1.open &&
    c3.open > c2.open
  )
}

function isThreeBlackCrows(c1: Candle, c2: Candle, c3: Candle): boolean {
  return (
    c1.close < c1.open &&
    c2.close < c2.open &&
    c3.close < c3.open &&
    c2.close < c1.close &&
    c3.close < c2.close &&
    c2.open < c1.open &&
    c3.open < c2.open
  )
}

function isPiercing(prev: Candle, curr: Candle): boolean {
  return (
    prev.close < prev.open &&
    curr.close > curr.open &&
    curr.open < prev.low &&
    curr.close > (prev.open + prev.close) / 2 &&
    curr.close < prev.open
  )
}

function isDarkCloudCover(prev: Candle, curr: Candle): boolean {
  return (
    prev.close > prev.open &&
    curr.close < curr.open &&
    curr.open > prev.high &&
    curr.close < (prev.open + prev.close) / 2 &&
    curr.close > prev.open
  )
}

// ============================================================
// Main Detection Function
// ============================================================

export function detectPatterns(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe
): PatternAlert[] {
  if (candles.length < 3) return []

  const alerts: PatternAlert[] = []
  const latest = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const prev2 = candles.length >= 3 ? candles[candles.length - 3] : null

  // Single candle patterns
  if (isDoji(latest)) {
    alerts.push({
      pattern: "doji",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (isHammer(latest)) {
    alerts.push({
      pattern: "hammer",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (isHangingMan(latest)) {
    alerts.push({
      pattern: "hanging_man",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (isShootingStar(latest)) {
    alerts.push({
      pattern: "shooting_star",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  // Two candle patterns
  if (isBullishEngulfing(prev, latest)) {
    alerts.push({
      pattern: "bullish_engulfing",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (isBearishEngulfing(prev, latest)) {
    alerts.push({
      pattern: "bearish_engulfing",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (isPiercing(prev, latest)) {
    alerts.push({
      pattern: "piercing",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (isDarkCloudCover(prev, latest)) {
    alerts.push({
      pattern: "dark_cloud_cover",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  // Three candle patterns
  if (prev2 && isMorningStar(prev2, prev, latest)) {
    alerts.push({
      pattern: "morning_star",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (prev2 && isEveningStar(prev2, prev, latest)) {
    alerts.push({
      pattern: "evening_star",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (prev2 && isThreeWhiteSoldiers(prev2, prev, latest)) {
    alerts.push({
      pattern: "three_white_soldiers",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  if (prev2 && isThreeBlackCrows(prev2, prev, latest)) {
    alerts.push({
      pattern: "three_black_crows",
      symbol,
      timeframe,
      timestamp: latest.time,
      price: latest.close,
    })
  }

  return alerts
}

// ============================================================
// Pattern Display Names
// ============================================================

export const PATTERN_NAMES: Record<CandlePattern, string> = {
  doji: "Doji",
  hammer: "Hammer",
  hanging_man: "Hanging Man",
  bullish_engulfing: "Bullish Engulfing",
  bearish_engulfing: "Bearish Engulfing",
  morning_star: "Morning Star",
  evening_star: "Evening Star",
  three_white_soldiers: "Three White Soldiers",
  three_black_crows: "Three Black Crows",
  shooting_star: "Shooting Star",
  piercing: "Piercing Pattern",
  dark_cloud_cover: "Dark Cloud Cover",
}

export const PATTERN_EMOJIS: Record<CandlePattern, string> = {
  doji: "⚪",
  hammer: "🔨",
  hanging_man: "🪢",
  bullish_engulfing: "🟢",
  bearish_engulfing: "🔴",
  morning_star: "🌅",
  evening_star: "🌆",
  three_white_soldiers: "⚔️",
  three_black_crows: "🐦‍⬛",
  shooting_star: "⭐",
  piercing: "📈",
  dark_cloud_cover: "☁️",
}
