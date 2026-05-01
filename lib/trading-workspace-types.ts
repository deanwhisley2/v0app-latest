/**
 * Trading Workspace Types
 * Shared types for the professional trading workspace
 */

// ============================================================
// Chart Layout Types
// ============================================================

export type ChartLayoutType = "single" | "split-2" | "grid-4" | "large-small"

export interface ChartLayout {
  type: ChartLayoutType
  label: string
  icon: string
}

export const CHART_LAYOUTS: ChartLayout[] = [
  { type: "single", label: "Single Chart", icon: "📊" },
  { type: "split-2", label: "Split 2 Charts", icon: "📊📊" },
  { type: "grid-4", label: "Grid 4 Charts", icon: "📊📊📊" },
  { type: "large-small", label: "1 Large + 2 Small", icon: "📊📊 / 📊" },
]

// ============================================================
// Chart Types
// ============================================================

export type ChartStyle = "candlestick" | "heiken_ashi" | "line" | "area" | "bar" | "renko" | "kagi"

export interface ChartStyleOption {
  type: ChartStyle
  label: string
}

export const CHART_STYLES: ChartStyleOption[] = [
  { type: "candlestick", label: "Candlestick" },
  { type: "heiken_ashi", label: "Heiken Ashi" },
  { type: "line", label: "Line" },
  { type: "area", label: "Area" },
  { type: "bar", label: "Bar" },
  { type: "renko", label: "Renko" },
  { type: "kagi", label: "Kagi" },
]

// ============================================================
// Timeframes
// ============================================================

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w"

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]

// ============================================================
// Candle Data
// ============================================================

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ============================================================
// Drawing Types (Teach Mode)
// ============================================================

export type DrawingTool =
  | "freehand"
  | "circle"
  | "text"
  | "line"
  | "rectangle"
  | "arrow"
  | "sticky_note"
  | "number_label"
  | "lightning_bolt"

export interface DrawingToolOption {
  type: DrawingTool
  label: string
  icon: string
}

export const DRAWING_TOOLS: DrawingToolOption[] = [
  { type: "freehand", label: "Freehand Draw", icon: "✏️" },
  { type: "circle", label: "Circle", icon: "🔴" },
  { type: "text", label: "Text Box", icon: "📝" },
  { type: "line", label: "Line/Ruler", icon: "📏" },
  { type: "rectangle", label: "Rectangle Box", icon: "🔲" },
  { type: "arrow", label: "Arrow Tool", icon: "➡️" },
  { type: "sticky_note", label: "Sticky Note", icon: "🏷️" },
  { type: "number_label", label: "Number Labels", icon: "🔢" },
  { type: "lightning_bolt", label: "Lightning Bolt", icon: "⚡" },
]

export type DrawingColor = "red" | "green" | "blue" | "yellow" | "purple" | "white" | "orange" | "cyan"

export const DRAWING_COLORS: { name: DrawingColor; hex: string }[] = [
  { name: "red", hex: "#ef4444" },
  { name: "green", hex: "#22c55e" },
  { name: "blue", hex: "#3b82f6" },
  { name: "yellow", hex: "#eab308" },
  { name: "purple", hex: "#a855f7" },
  { name: "white", hex: "#ffffff" },
  { name: "orange", hex: "#f97316" },
  { name: "cyan", hex: "#06b6d4" },
]

export interface DrawingPoint {
  x: number
  y: number
  time?: number
  price?: number
}

export interface Drawing {
  id: string
  tool: DrawingTool
  points: DrawingPoint[]
  color: DrawingColor
  thickness: number
  text?: string
  createdAt: number
}

// ============================================================
// Indicator Types
// ============================================================

export type IndicatorType = "ma" | "ema" | "bollinger" | "ichimoku" | "rsi" | "macd" | "stoch_rsi" | "volume" | "obv"

export interface IndicatorConfig {
  type: IndicatorType
  enabled: boolean
  color?: string
  period?: number
  // MA specific
  maPeriods?: number[]
  // Bollinger specific
  bbPeriod?: number
  bbStdDev?: number
  // RSI specific
  rsiPeriod?: number
  // MACD specific
  macdFast?: number
  macdSlow?: number
  macdSignal?: number
}

// ============================================================
// Candle Pattern Types
// ============================================================

export type CandlePattern =
  | "doji"
  | "hammer"
  | "hanging_man"
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "morning_star"
  | "evening_star"
  | "three_white_soldiers"
  | "three_black_crows"
  | "shooting_star"
  | "piercing"
  | "dark_cloud_cover"

export interface PatternAlert {
  pattern: CandlePattern
  symbol: string
  timeframe: Timeframe
  timestamp: number
  price: number
}

// ============================================================
// Asset Types
// ============================================================

export interface TradingAsset {
  symbol: string
  displayName: string
  baseAsset: string
  quoteAsset: string
  enabled: boolean
}

export const DEFAULT_ASSETS: TradingAsset[] = [
  { symbol: "BTCUSDT", displayName: "BTC/USDT", baseAsset: "BTC", quoteAsset: "USDT", enabled: true },
  { symbol: "ETHUSDT", displayName: "ETH/USDT", baseAsset: "ETH", quoteAsset: "USDT", enabled: true },
  { symbol: "SOLUSDT", displayName: "SOL/USDT", baseAsset: "SOL", quoteAsset: "USDT", enabled: true },
  { symbol: "DOGEUSDT", displayName: "DOGE/USDT", baseAsset: "DOGE", quoteAsset: "USDT", enabled: true },
  { symbol: "XRPUSDT", displayName: "XRP/USDT", baseAsset: "XRP", quoteAsset: "USDT", enabled: true },
  { symbol: "BNBUSDT", displayName: "BNB/USDT", baseAsset: "BNB", quoteAsset: "USDT", enabled: true },
  { symbol: "ADAUSDT", displayName: "ADA/USDT", baseAsset: "ADA", quoteAsset: "USDT", enabled: true },
  { symbol: "AVAXUSDT", displayName: "AVAX/USDT", baseAsset: "AVAX", quoteAsset: "USDT", enabled: true },
  { symbol: "XAUUSDT", displayName: "XAU/USDT (Gold)", baseAsset: "XAU", quoteAsset: "USDT", enabled: true },
]

// ============================================================
// Layout Preset Types
// ============================================================

export interface ChartConfig {
  id: string
  symbol: string
  timeframe: Timeframe
  chartStyle: ChartStyle
  indicators: IndicatorConfig[]
  drawings: Drawing[]
  candleColors: {
    bullish: string
    bearish: string
    wickColor: string
    showWicks: boolean
    showBorders: boolean
    borderThickness: number
  }
  volumeEnabled: boolean
}

export interface WorkspacePreset {
  id: string
  name: string
  layout: ChartLayoutType
  charts: ChartConfig[]
  createdAt: number
  isBuiltIn: boolean
}

export const BUILT_IN_PRESETS: WorkspacePreset[] = [
  {
    id: "scalper",
    name: "Scalper",
    layout: "single",
    charts: [
      {
        id: "chart-1",
        symbol: "BTCUSDT",
        timeframe: "1m",
        chartStyle: "candlestick",
        indicators: [
          { type: "rsi", enabled: true, rsiPeriod: 14, color: "#a855f7" },
          { type: "volume", enabled: true },
        ],
        drawings: [],
        candleColors: { bullish: "#22c55e", bearish: "#ef4444", wickColor: "#666666", showWicks: true, showBorders: true, borderThickness: 1 },
        volumeEnabled: true,
      },
    ],
    createdAt: Date.now(),
    isBuiltIn: true,
  },
  {
    id: "swing-trader",
    name: "Swing Trader",
    layout: "split-2",
    charts: [
      {
        id: "chart-1",
        symbol: "BTCUSDT",
        timeframe: "1h",
        chartStyle: "candlestick",
        indicators: [
          { type: "ma", enabled: true, maPeriods: [20, 50, 200], color: "#3b82f6" },
          { type: "macd", enabled: true, macdFast: 12, macdSlow: 26, macdSignal: 9 },
        ],
        drawings: [],
        candleColors: { bullish: "#22c55e", bearish: "#ef4444", wickColor: "#666666", showWicks: true, showBorders: true, borderThickness: 1 },
        volumeEnabled: true,
      },
      {
        id: "chart-2",
        symbol: "ETHUSDT",
        timeframe: "1h",
        chartStyle: "candlestick",
        indicators: [
          { type: "ma", enabled: true, maPeriods: [20, 50], color: "#a855f7" },
          { type: "rsi", enabled: true, rsiPeriod: 14, color: "#f97316" },
        ],
        drawings: [],
        candleColors: { bullish: "#22c55e", bearish: "#ef4444", wickColor: "#666666", showWicks: true, showBorders: true, borderThickness: 1 },
        volumeEnabled: true,
      },
    ],
    createdAt: Date.now(),
    isBuiltIn: true,
  },
  {
    id: "gold-focus",
    name: "Gold Focus",
    layout: "single",
    charts: [
      {
        id: "chart-1",
        symbol: "XAUUSDT",
        timeframe: "1h",
        chartStyle: "heiken_ashi",
        indicators: [
          { type: "ma", enabled: true, maPeriods: [20, 50], color: "#eab308" },
          { type: "macd", enabled: true, macdFast: 12, macdSlow: 26, macdSignal: 9 },
        ],
        drawings: [],
        candleColors: { bullish: "#22c55e", bearish: "#ef4444", wickColor: "#666666", showWicks: true, showBorders: true, borderThickness: 1 },
        volumeEnabled: true,
      },
    ],
    createdAt: Date.now(),
    isBuiltIn: true,
  },
]

// ============================================================
// User Preferences
// ============================================================

export interface UserPreferences {
  theme: "dark" | "light" | "system"
  fontSize: "small" | "normal" | "large"
  showGridLines: boolean
  showVolume: boolean
  showIndicatorLabels: boolean
  crosshairEnabled: boolean
  showOHLCOnHover: boolean
  showPercentChange: boolean
  showHighLow: boolean
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  fontSize: "normal",
  showGridLines: true,
  showVolume: true,
  showIndicatorLabels: true,
  crosshairEnabled: true,
  showOHLCOnHover: true,
  showPercentChange: true,
  showHighLow: true,
}
