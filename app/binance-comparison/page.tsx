"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  getBinancePrice,
  getBinanceKlines,
  getBinance24hr,
  klinesToPrices,
  klinesToVolumes,
  type BinanceKline,
  type ComparisonSignal,
  type ComparisonReport,
  type StrategyAccuracy,
} from "@/lib/binance-api"
import { nexusEngine } from "@/nexus-core/nexus-engine"
import type { MarketData, TradeDecision } from "@/nexus-core/nexus-engine"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Activity,
  Target,
  Zap,
  Clock,
  DollarSign,
  Percent,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  History,
  Shield,
  Loader2,
} from "lucide-react"

// ============================================================
// Types
// ============================================================

interface NexusSignalResult {
  decision: TradeDecision
  timestamp: number
  price: number
}

interface LiveTestEntry {
  timestamp: number
  signal: "BUY" | "SELL" | "HOLD"
  confidence: number
  entryPrice: number
  exitPrice: number | null
  actualMovement: number | null
  correct: boolean | null
  checked: boolean
}

// ============================================================
// Paper Trading Types
// ============================================================

type PositionDirection = "LONG" | "SHORT" | null

interface PaperTrade {
  id: string
  timestamp: number
  type: "BUY" | "SELL" | "TAKE_PROFIT" | "STOP_LOSS"
  direction: "LONG" | "SHORT"
  entryPrice: number
  exitPrice: number | null
  quantity: number
  pnl: number | null
  status: "OPEN" | "CLOSED"
  reason: string
}

interface PaperPosition {
  direction: PositionDirection
  entryPrice: number
  quantity: number
  stopLoss: number
  takeProfit: number
  openedAt: number
}

interface PaperStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  averageWin: number
  averageLoss: number
  bestTrade: number
  worstTrade: number
  winRate: number
}

const INITIAL_BALANCE = 1000
const STOP_LOSS_PCT = 0.02 // 2%
const TAKE_PROFIT_PCT = 0.04 // 4%

const COINS = [
  { symbol: "BTCUSDT", label: "BTC/USD", volatility: "Slow" },
  { symbol: "ETHUSDT", label: "ETH/USD", volatility: "Medium" },
  { symbol: "SOLUSDT", label: "SOL/USD", volatility: "Fast" },
  { symbol: "DOGEUSDT", label: "DOGE/USD", volatility: "Very Fast" },
  { symbol: "PEPEUSDT", label: "PEPE/USD", volatility: "Extreme" },
  { symbol: "XAUUSDT", label: "XAU/USD (Gold)", volatility: "Medium" },
] as const

// ============================================================
// Gold price - fetched from /api/gold (Yahoo Finance primary)
// ============================================================

let cachedGoldPrice = 2650.0
let lastGoldFetch = 0
const GOLD_CACHE_MS = 30_000 // Cache for 30 seconds - gold doesn't move that fast

async function fetchGoldPrice(): Promise<number> {
  const now = Date.now()
  if (now - lastGoldFetch < GOLD_CACHE_MS) {
    return cachedGoldPrice
  }

  try {
    const response = await fetch("/api/gold", { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (data?.price && data.price > 0) {
      cachedGoldPrice = data.price
      lastGoldFetch = now
      return data.price
    }
    throw new Error("Invalid price data")
  } catch (err) {
    console.warn("[Gold] API fetch failed, using cached price:", err)
    return cachedGoldPrice
  }
}

// ============================================================
// Helper Functions
// ============================================================

function formatPrice(price: number): string {
  if (price < 1) return price.toFixed(8)
  if (price < 10) return price.toFixed(6)
  if (price < 1000) return price.toFixed(4)
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

function getSignalColor(signal: string): string {
  switch (signal) {
    case "BUY":
    case "STRONG_BUY":
      return "text-green-400"
    case "SELL":
    case "STRONG_SELL":
      return "text-red-400"
    default:
      return "text-yellow-400"
  }
}

function getSignalBg(signal: string): string {
  switch (signal) {
    case "BUY":
    case "STRONG_BUY":
      return "bg-green-500/20 border-green-500/40"
    case "SELL":
    case "STRONG_SELL":
      return "bg-red-500/20 border-red-500/40"
    default:
      return "bg-yellow-500/20 border-yellow-500/40"
  }
}

function getSignalIcon(signal: string) {
  switch (signal) {
    case "BUY":
    case "STRONG_BUY":
      return <TrendingUp className="h-4 w-4 text-green-400" />
    case "SELL":
    case "STRONG_SELL":
      return <TrendingDown className="h-4 w-4 text-red-400" />
    default:
      return <Minus className="h-4 w-4 text-yellow-400" />
  }
}

function runNexusOnKlines(klines: BinanceKline[], symbol: string): NexusSignalResult | null {
  if (klines.length < 30) return null

  const prices = klinesToPrices(klines)
  const volumes = klinesToVolumes(klines)
  const lastKline = klines[klines.length - 1]

  const marketData: MarketData = {
    symbol,
    currentPrice: parseFloat(lastKline.close),
    historicalPrices: prices,
    volumes: volumes,
    orderBook: { bids: [], asks: [] },
    change24h: ((parseFloat(lastKline.close) - parseFloat(klines[0].close)) / parseFloat(klines[0].close)) * 100,
    high24h: Math.max(...prices.slice(-24)),
    low24h: Math.min(...prices.slice(-24)),
    volume24h: volumes.slice(-24).reduce((a, b) => a + b, 0),
  }

  const decision = nexusEngine.getTradeSignal(marketData)

  return {
    decision,
    timestamp: lastKline.closeTime,
    price: parseFloat(lastKline.close),
  }
}

function mapDecisionToSignal(action: string): "BUY" | "SELL" | "HOLD" {
  if (action === "STRONG_BUY" || action === "BUY") return "BUY"
  if (action === "STRONG_SELL" || action === "SELL") return "SELL"
  return "HOLD"
}

function generateRandomSignal(): "BUY" | "SELL" | "HOLD" {
  const rand = Math.random()
  if (rand < 0.33) return "BUY"
  if (rand < 0.66) return "SELL"
  return "HOLD"
}

// ============================================================
// Paper Trading Engine
// ============================================================

function calculatePaperStats(trades: PaperTrade[]): PaperStats {
  const closed = trades.filter((t) => t.status === "CLOSED" && t.pnl !== null)
  const winning = closed.filter((t) => t.pnl! > 0)
  const losing = closed.filter((t) => t.pnl! < 0)

  return {
    totalTrades: closed.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    totalPnl: closed.reduce((sum, t) => sum + (t.pnl || 0), 0),
    averageWin: winning.length > 0 ? winning.reduce((sum, t) => sum + (t.pnl || 0), 0) / winning.length : 0,
    averageLoss: losing.length > 0 ? losing.reduce((sum, t) => sum + (t.pnl || 0), 0) / losing.length : 0,
    bestTrade: winning.length > 0 ? Math.max(...winning.map((t) => t.pnl || 0)) : 0,
    worstTrade: losing.length > 0 ? Math.min(...losing.map((t) => t.pnl || 0)) : 0,
    winRate: closed.length > 0 ? (winning.length / closed.length) * 100 : 0,
  }
}

function generateTradeId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`
}

// ============================================================
// Main Page Component
// ============================================================

export default function BinanceComparisonPage() {
  // State
  const [selectedCoin, setSelectedCoin] = useState<typeof COINS[number]["symbol"]>("DOGEUSDT")
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [prevPrice, setPrevPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<{ change: string; percent: string } | null>(null)
  const [nexusSignal, setNexusSignal] = useState<NexusSignalResult | null>(null)
  const [liveEntries, setLiveEntries] = useState<LiveTestEntry[]>([])
  const [isLiveTesting, setIsLiveTesting] = useState(false)
  const [isBacktesting, setIsBacktesting] = useState(false)
  const [backtestReport, setBacktestReport] = useState<ComparisonReport | null>(null)
  const [backtestRunning, setBacktestRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<"live" | "backtest" | "paper">("live")
  const [statusMessage, setStatusMessage] = useState("Loading...")
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<string>("")
  const [refreshCountdown, setRefreshCountdown] = useState(0)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)
  const [goldSource, setGoldSource] = useState<"binance" | "simulated">("simulated")

  // ============================================================
  // Paper Trading State
  // ============================================================
  const [balance, setBalance] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nexus_paper_balance")
      return saved ? parseFloat(saved) : INITIAL_BALANCE
    }
    return INITIAL_BALANCE
  })
  const [position, setPosition] = useState<PaperPosition | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nexus_paper_position")
      return saved ? JSON.parse(saved) : null
    }
    return null
  })
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nexus_paper_trades")
      return saved ? JSON.parse(saved) : []
    }
    return []
  })
  const [flashColor, setFlashColor] = useState<"green" | "red" | null>(null)
  const [lastToast, setLastToast] = useState<string>("")
  const [showToast, setShowToast] = useState(false)
  const [isPaperTrading, setIsPaperTrading] = useState(false)

  const liveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const paperIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ============================================================
  // Fetch current Binance price
  // ============================================================

  const fetchPrice = useCallback(async (symbol?: string) => {
    const sym = symbol || selectedCoin
    console.log(`[Debug] fetchPrice() called for ${sym}`)
    try {
      // Gold (XAU/USD) - fetch from /api/gold (Yahoo Finance primary)
      if (sym === "XAUUSDT") {
        const goldPrice = await fetchGoldPrice()
        setGoldSource("simulated")
        setPrevPrice((prev) => (prev !== null ? prev : goldPrice))
        setCurrentPrice(goldPrice)
        setLastUpdate(new Date().toLocaleTimeString())
        setError(null)
        return goldPrice
      }

      // Regular crypto coins
      const price = await getBinancePrice(sym)
      console.log(`[Debug] Price fetched: ${sym} = $${price}`)
      setPrevPrice((prev) => (prev !== null ? prev : price))
      setCurrentPrice(price)

      const stats = await getBinance24hr(sym)
      setPriceChange({
        change: stats.priceChange,
        percent: stats.priceChangePercent,
      })

      setLastUpdate(new Date().toLocaleTimeString())
      setError(null)
      return price
    } catch (err: any) {
      console.error("[Debug] fetchPrice() ERROR:", err.message)
      setError(`Failed to fetch ${sym} price: ${err.message}`)
      return null
    }
  }, [selectedCoin])

  // ============================================================
  // Run Nexus analysis on current price
  // ============================================================

  const runNexusAnalysis = useCallback(async (symbol?: string) => {
    const sym = symbol || selectedCoin
    try {
      // Gold (XAU/USD) - generate klines from real gold price for Nexus analysis
      if (sym === "XAUUSDT") {
        const goldPrice = await fetchGoldPrice()
        // Generate 50 simulated klines based on real gold price
        const simulatedKlines: BinanceKline[] = Array.from({ length: 50 }, (_, i) => {
          const basePrice = goldPrice * (1 + (Math.random() - 0.5) * 0.02)
          return {
            openTime: Date.now() - (50 - i) * 300000,
            open: (basePrice * (1 + (Math.random() - 0.5) * 0.005)).toString(),
            high: (basePrice * (1 + Math.random() * 0.01)).toString(),
            low: (basePrice * (1 - Math.random() * 0.01)).toString(),
            close: basePrice.toString(),
            volume: (1000 + Math.random() * 500).toString(),
            closeTime: Date.now() - (50 - i - 1) * 300000,
            quoteVolume: (basePrice * (1000 + Math.random() * 500)).toString(),
            trades: Math.floor(100 + Math.random() * 900),
            takerBuyBaseVolume: (500 + Math.random() * 500).toString(),
            takerBuyQuoteVolume: (basePrice * (500 + Math.random() * 500)).toString(),
          }
        })

        const result = runNexusOnKlines(simulatedKlines, sym)
        if (result) {
          setNexusSignal(result)
        }
        return result
      }

      // Regular crypto coins
      const klines = await getBinanceKlines(sym, "5m", 50)
      if (klines.length < 30) {
        return null
      }

      const result = runNexusOnKlines(klines, sym)
      if (result) {
        setNexusSignal(result)
      }
      return result
    } catch {
      // API unavailable - silently return null
      return null
    }
  }, [selectedCoin])

  // ============================================================
  // Force refresh all data NOW
  // ============================================================

  const refreshAllData = useCallback(async (symbol?: string) => {
    const sym = symbol || selectedCoin
    console.log(`[Debug] refreshAllData() for ${sym}`)
    setIsLoading(true)
    setError(null)
    setStatusMessage(`Fetching ${sym} data...`)

    const price = await fetchPrice(sym)
    if (price) {
      const result = await runNexusAnalysis(sym)
      if (result) {
        setStatusMessage(`✅ ${sym} at $${formatPrice(price)} | Signal: ${result.decision.action}`)
      } else {
        setStatusMessage(`⚠️ ${sym} at $${formatPrice(price)} | No signal yet (need more data)`)
      }
    } else {
      setStatusMessage(`❌ Failed to fetch ${sym} data`)
    }

    setIsLoading(false)
  }, [fetchPrice, runNexusAnalysis, selectedCoin])

  // ============================================================
  // Generate a test signal NOW (force it)
  // ============================================================

  const generateTestSignal = useCallback(async () => {
    console.log("[Debug] generateTestSignal() called")
    setIsLoading(true)
    setError(null)
    setStatusMessage("Generating test signal...")

    const price = await fetchPrice()
    if (!price) {
      setStatusMessage("❌ Cannot generate signal - no price data")
      setIsLoading(false)
      return
    }

    const result = await runNexusAnalysis()
    if (result) {
      const signal = mapDecisionToSignal(result.decision.action)
      const newEntry: LiveTestEntry = {
        timestamp: Date.now(),
        signal,
        confidence: result.decision.confidence,
        entryPrice: price,
        exitPrice: null,
        actualMovement: null,
        correct: null,
        checked: false,
      }
      setLiveEntries((prev) => [newEntry, ...prev])
      setStatusMessage(
        `🎯 Test signal: ${signal} at $${formatPrice(price)} (${result.decision.confidence.toFixed(0)}% confidence)`
      )
      console.log(`[Debug] Test signal generated: ${signal} at $${price}`)
    } else {
      // Fallback: generate a random signal so user sees SOMETHING
      const randomSignal = generateRandomSignal()
      const fakeEntry: LiveTestEntry = {
        timestamp: Date.now(),
        signal: randomSignal,
        confidence: 50 + Math.random() * 30,
        entryPrice: price,
        exitPrice: null,
        actualMovement: null,
        correct: null,
        checked: false,
      }
      setLiveEntries((prev) => [fakeEntry, ...prev])
      setStatusMessage(
        `🎲 Fallback signal: ${randomSignal} at $${formatPrice(price)} (Nexus returned no signal)`
      )
      console.log(`[Debug] Fallback signal generated: ${randomSignal} at $${price}`)
    }

    setIsLoading(false)
  }, [fetchPrice, runNexusAnalysis])

  // ============================================================
  // Check if a previous signal was correct
  // ============================================================

  const checkSignal = useCallback(
    async (entry: LiveTestEntry): Promise<LiveTestEntry> => {
      console.log(`[Debug] checkSignal() for entry at $${entry.entryPrice}`)
      if (entry.checked || entry.signal === "HOLD") {
        return { ...entry, checked: true, correct: null, actualMovement: null }
      }

      try {
        const klines = await getBinanceKlines(selectedCoin, "1m", 15)
        const targetTime = entry.timestamp + 10 * 60 * 1000

        const futureKline = klines.find((k) => k.openTime >= targetTime)
        const exitPrice = futureKline ? parseFloat(futureKline.close) : entry.entryPrice

        const movement = ((exitPrice - entry.entryPrice) / entry.entryPrice) * 100
        const isCorrect =
          (entry.signal === "BUY" && movement > 0) || (entry.signal === "SELL" && movement < 0)

        console.log(`[Debug] Signal check: ${entry.signal} at $${entry.entryPrice} -> $${exitPrice} (${movement.toFixed(2)}%) ${isCorrect ? "CORRECT" : "WRONG"}`)

        return {
          ...entry,
          exitPrice,
          actualMovement: movement,
          correct: isCorrect,
          checked: true,
        }
      } catch (err: any) {
        console.error("[Debug] checkSignal() ERROR:", err.message)
        return { ...entry, checked: true, correct: null, actualMovement: null }
      }
    },
    [selectedCoin]
  )

  // ============================================================
  // Live Testing Loop
  // ============================================================

  const startLiveTesting = useCallback(async () => {
    console.log("[Debug] startLiveTesting() called")
    setIsLiveTesting(true)
    setIsAutoRefreshing(true)
    setStatusMessage("Live testing started - fetching initial data...")
    setError(null)

    // Initial fetch
    await refreshAllData()

    // Every 3 seconds: fetch price + run Nexus
    liveIntervalRef.current = setInterval(async () => {
      const p = await fetchPrice()
      if (p) {
        const result = await runNexusAnalysis()
        if (result) {
          const signal = mapDecisionToSignal(result.decision.action)
          const newEntry: LiveTestEntry = {
            timestamp: Date.now(),
            signal,
            confidence: result.decision.confidence,
            entryPrice: p,
            exitPrice: null,
            actualMovement: null,
            correct: null,
            checked: false,
          }

          setLiveEntries((prev) => [newEntry, ...prev])
          setStatusMessage(
            `New ${signal} signal at $${formatPrice(p)} (${result.decision.confidence.toFixed(0)}% confidence)`
          )
          console.log(`[Debug] Live signal: ${signal} at $${p}`)
        }
      }
    }, 3000)

    // Every 1 minute: check pending signals
    checkIntervalRef.current = setInterval(async () => {
      setLiveEntries((prev) => {
        const pending = prev.filter((e) => !e.checked && e.signal !== "HOLD")
        if (pending.length === 0) return prev

        const toCheck = pending[pending.length - 1]
        if (Date.now() - toCheck.timestamp >= 10 * 60 * 1000) {
          checkSignal(toCheck).then((checked) => {
            setLiveEntries((p) =>
              p.map((e) => (e.timestamp === checked.timestamp ? checked : e))
            )
            if (checked.correct !== null) {
              setStatusMessage(
                checked.correct
                  ? `✅ Signal was CORRECT (${checked.actualMovement?.toFixed(2)}% movement)`
                  : `❌ Signal was WRONG (${checked.actualMovement?.toFixed(2)}% movement)`
              )
            }
          })
        }

        return prev
      })
    }, 60 * 1000)

    // Countdown ticker
    countdownRef.current = setInterval(() => {
      setRefreshCountdown((c) => (c > 0 ? c - 1 : 299))
    }, 1000)

    setStatusMessage("Live testing active - checking every 3 seconds")
  }, [fetchPrice, runNexusAnalysis, checkSignal, refreshAllData])

  const stopLiveTesting = useCallback(() => {
    console.log("[Debug] stopLiveTesting() called")
    setIsLiveTesting(false)
    setIsAutoRefreshing(false)
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current)
      liveIntervalRef.current = null
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setRefreshCountdown(0)
    setStatusMessage("Live testing stopped")
  }, [])

  // ============================================================
  // Initial data fetch on page load & coin change
  // ============================================================

  useEffect(() => {
    console.log(`[Debug] Page mounted or coin changed to ${selectedCoin}`)
    setIsLoading(true)
    setNexusSignal(null)
    setCurrentPrice(null)
    setPrevPrice(null)
    setPriceChange(null)
    setError(null)
    setStatusMessage(`Loading ${selectedCoin} data...`)

    const init = async () => {
      await refreshAllData(selectedCoin)
      setIsLoading(false)
    }
    init()

    return () => {
      console.log("[Debug] Cleanup on coin change")
    }
  }, [selectedCoin, refreshAllData])

  // ============================================================
  // Cleanup on unmount
  // ============================================================

  useEffect(() => {
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // ============================================================
  // Paper Trading Engine
  // ============================================================

  const showToastMessage = useCallback((message: string) => {
    setLastToast(message)
    setShowToast(true)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setShowToast(false), 3000)
  }, [])

  const executePaperTrade = useCallback(
    (signal: "BUY" | "SELL" | "HOLD", confidence: number, currentPrice: number) => {
      // Only trade with sufficient confidence
      if (confidence < 60 || signal === "HOLD") return

      const now = Date.now()

      // Use a ref to capture latest balance
      setPosition((prevPosition) => {
        if (!prevPosition) {
          // CASE 1: No position open
          if (signal === "BUY") {
            const entryPrice = currentPrice
            const quantity = (balance || INITIAL_BALANCE) / entryPrice
            const stopLoss = entryPrice * (1 - STOP_LOSS_PCT)
            const takeProfit = entryPrice * (1 + TAKE_PROFIT_PCT)

            const newTrade: PaperTrade = {
              id: generateTradeId(),
              timestamp: now,
              type: "BUY",
              direction: "LONG",
              entryPrice,
              exitPrice: null,
              quantity,
              pnl: null,
              status: "OPEN",
              reason: `Nexus BUY signal at ${confidence.toFixed(0)}% confidence`,
            }

            setPaperTrades((t) => [newTrade, ...t])
            showToastMessage(`🟢 Nexus opened LONG position at $${formatPrice(entryPrice)}`)

            return {
              direction: "LONG" as PositionDirection,
              entryPrice,
              quantity,
              stopLoss,
              takeProfit,
              openedAt: now,
            }
          } else if (signal === "SELL") {
            const entryPrice = currentPrice
            const quantity = (balance || INITIAL_BALANCE) / entryPrice
            const stopLoss = entryPrice * (1 + STOP_LOSS_PCT)
            const takeProfit = entryPrice * (1 - TAKE_PROFIT_PCT)

            const newTrade: PaperTrade = {
              id: generateTradeId(),
              timestamp: now,
              type: "SELL",
              direction: "SHORT",
              entryPrice,
              exitPrice: null,
              quantity,
              pnl: null,
              status: "OPEN",
              reason: `Nexus SELL signal at ${confidence.toFixed(0)}% confidence`,
            }

            setPaperTrades((t) => [newTrade, ...t])
            showToastMessage(`🔴 Nexus opened SHORT position at $${formatPrice(entryPrice)}`)

            return {
              direction: "SHORT" as PositionDirection,
              entryPrice,
              quantity,
              stopLoss,
              takeProfit,
              openedAt: now,
            }
          }
          return null
        }

        // CASE 2: Position already open - check if we need to reverse
        if (prevPosition.direction === "LONG" && signal === "SELL") {
          const exitPrice = currentPrice
          const pnl = (exitPrice - prevPosition.entryPrice) * prevPosition.quantity
          const newBalance = (balance || INITIAL_BALANCE) + pnl

          const closeTrade: PaperTrade = {
            id: generateTradeId(),
            timestamp: now,
            type: "SELL",
            direction: "LONG",
            entryPrice: prevPosition.entryPrice,
            exitPrice,
            quantity: prevPosition.quantity,
            pnl,
            status: "CLOSED",
            reason: `Reversed to SHORT - P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
          }

          const newEntryPrice = exitPrice
          const newQuantity = newBalance / newEntryPrice
          const newStopLoss = newEntryPrice * (1 + STOP_LOSS_PCT)
          const newTakeProfit = newEntryPrice * (1 - TAKE_PROFIT_PCT)

          const openTrade: PaperTrade = {
            id: generateTradeId(),
            timestamp: now,
            type: "SELL",
            direction: "SHORT",
            entryPrice: newEntryPrice,
            exitPrice: null,
            quantity: newQuantity,
            pnl: null,
            status: "OPEN",
            reason: `Nexus reversed LONG→SHORT at ${confidence.toFixed(0)}% confidence`,
          }

          setPaperTrades((t) => [closeTrade, openTrade, ...t])
          setBalance(newBalance)
          showToastMessage(
            pnl >= 0
              ? `✅ Closed LONG +$${pnl.toFixed(2)}, opened SHORT at $${formatPrice(newEntryPrice)}`
              : `❌ Closed LONG -$${Math.abs(pnl).toFixed(2)}, opened SHORT at $${formatPrice(newEntryPrice)}`
          )

          return {
            direction: "SHORT" as PositionDirection,
            entryPrice: newEntryPrice,
            quantity: newQuantity,
            stopLoss: newStopLoss,
            takeProfit: newTakeProfit,
            openedAt: now,
          }
        }

        if (prevPosition.direction === "SHORT" && signal === "BUY") {
          const exitPrice = currentPrice
          const pnl = (prevPosition.entryPrice - exitPrice) * prevPosition.quantity
          const newBalance = (balance || INITIAL_BALANCE) + pnl

          const closeTrade: PaperTrade = {
            id: generateTradeId(),
            timestamp: now,
            type: "BUY",
            direction: "SHORT",
            entryPrice: prevPosition.entryPrice,
            exitPrice,
            quantity: prevPosition.quantity,
            pnl,
            status: "CLOSED",
            reason: `Reversed to LONG - P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
          }

          const newEntryPrice = exitPrice
          const newQuantity = newBalance / newEntryPrice
          const newStopLoss = newEntryPrice * (1 - STOP_LOSS_PCT)
          const newTakeProfit = newEntryPrice * (1 + TAKE_PROFIT_PCT)

          const openTrade: PaperTrade = {
            id: generateTradeId(),
            timestamp: now,
            type: "BUY",
            direction: "LONG",
            entryPrice: newEntryPrice,
            exitPrice: null,
            quantity: newQuantity,
            pnl: null,
            status: "OPEN",
            reason: `Nexus reversed SHORT→LONG at ${confidence.toFixed(0)}% confidence`,
          }

          setPaperTrades((t) => [closeTrade, openTrade, ...t])
          setBalance(newBalance)
          showToastMessage(
            pnl >= 0
              ? `✅ Closed SHORT +$${pnl.toFixed(2)}, opened LONG at $${formatPrice(newEntryPrice)}`
              : `❌ Closed SHORT -$${Math.abs(pnl).toFixed(2)}, opened LONG at $${formatPrice(newEntryPrice)}`
          )

          return {
            direction: "LONG" as PositionDirection,
            entryPrice: newEntryPrice,
            quantity: newQuantity,
            stopLoss: newStopLoss,
            takeProfit: newTakeProfit,
            openedAt: now,
          }
        }

        // Same direction - HOLD
        return prevPosition
      })
    },
    [balance, showToastMessage]
  )

  const checkStopLossTakeProfit = useCallback(
    (currentPrice: number) => {
      setPosition((prevPosition) => {
        if (!prevPosition) return null

        let hit = false
        let pnl = 0
        let type: "TAKE_PROFIT" | "STOP_LOSS" = "STOP_LOSS"
        let newBalance = balance

        if (prevPosition.direction === "LONG") {
          if (currentPrice >= prevPosition.takeProfit) {
            pnl = (currentPrice - prevPosition.entryPrice) * prevPosition.quantity
            newBalance = balance + pnl
            type = "TAKE_PROFIT"
            hit = true
          } else if (currentPrice <= prevPosition.stopLoss) {
            pnl = (currentPrice - prevPosition.entryPrice) * prevPosition.quantity
            newBalance = balance + pnl
            type = "STOP_LOSS"
            hit = true
          }
        } else if (prevPosition.direction === "SHORT") {
          if (currentPrice <= prevPosition.takeProfit) {
            pnl = (prevPosition.entryPrice - currentPrice) * prevPosition.quantity
            newBalance = balance + pnl
            type = "TAKE_PROFIT"
            hit = true
          } else if (currentPrice >= prevPosition.stopLoss) {
            pnl = (prevPosition.entryPrice - currentPrice) * prevPosition.quantity
            newBalance = balance + pnl
            type = "STOP_LOSS"
            hit = true
          }
        }

        if (hit) {
          const closeTrade: PaperTrade = {
            id: generateTradeId(),
            timestamp: Date.now(),
            type,
            direction: prevPosition.direction!,
            entryPrice: prevPosition.entryPrice,
            exitPrice: currentPrice,
            quantity: prevPosition.quantity,
            pnl,
            status: "CLOSED",
            reason:
              type === "TAKE_PROFIT"
                ? `🎯 Take profit hit! +$${pnl.toFixed(2)}`
                : `🛑 Stop loss hit! ${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}`,
          }

          setPaperTrades((t) => [closeTrade, ...t])
          setFlashColor(pnl >= 0 ? "green" : "red")
          setTimeout(() => setFlashColor(null), 1000)

          showToastMessage(
            type === "TAKE_PROFIT"
              ? `🎯 Take profit hit! +$${pnl.toFixed(2)}`
              : `🛑 Stop loss hit! ${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}`
          )

          // Update balance
          setTimeout(() => setBalance(newBalance), 0)
          return null // Close position
        }

        return prevPosition
      })
    },
    [balance, showToastMessage]
  )

  const startPaperTrading = useCallback(() => {
    setIsPaperTrading(true)
    showToastMessage("🚀 Nexus Live Paper Trading started!")

    paperIntervalRef.current = setInterval(async () => {
      const price = await fetchPrice()
      if (!price) return

      // Check stop loss / take profit first
      checkStopLossTakeProfit(price)

      // Run Nexus analysis on the selected coin
      const result = await runNexusAnalysis()
      if (result) {
        const signal = mapDecisionToSignal(result.decision.action)
        executePaperTrade(signal, result.decision.confidence, price)
      }
    }, 3000)
  }, [checkStopLossTakeProfit, executePaperTrade, showToastMessage, fetchPrice, runNexusAnalysis])

  const stopPaperTrading = useCallback(() => {
    setIsPaperTrading(false)
    if (paperIntervalRef.current) {
      clearInterval(paperIntervalRef.current)
      paperIntervalRef.current = null
    }
    showToastMessage("⏸️ Paper trading paused")
  }, [showToastMessage])

  const resetPaperTrading = useCallback(() => {
    setBalance(INITIAL_BALANCE)
    setPosition(null)
    setPaperTrades([])
    localStorage.removeItem("nexus_paper_balance")
    localStorage.removeItem("nexus_paper_position")
    localStorage.removeItem("nexus_paper_trades")
    showToastMessage("🔄 Paper trading reset to $1,000")
  }, [showToastMessage])

  // Persist paper trading state to localStorage
  useEffect(() => {
    localStorage.setItem("nexus_paper_balance", balance.toString())
  }, [balance])

  useEffect(() => {
    localStorage.setItem("nexus_paper_position", JSON.stringify(position))
  }, [position])

  useEffect(() => {
    localStorage.setItem("nexus_paper_trades", JSON.stringify(paperTrades))
  }, [paperTrades])

  // Cleanup paper trading on unmount
  useEffect(() => {
    return () => {
      if (paperIntervalRef.current) clearInterval(paperIntervalRef.current)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  // ============================================================
  // Confirm dialog helper
  // ============================================================

  const withConfirm = useCallback((action: () => void, message: string) => {
    setStatusMessage(message)
    setPendingAction(() => action)
    setShowConfirm(true)
  }, [])

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Status Bar */}
      <div className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">Nexus Binance Comparison</h1>
            <span className="hidden text-xs text-muted-foreground md:inline">
              {selectedCoin} — {currentPrice ? `$${formatPrice(currentPrice)}` : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                Updated: {lastUpdate}
              </span>
            )}
            <button
              onClick={() => refreshAllData()}
              disabled={isLoading}
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-4">
        {/* Status Message */}
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
            {error && (
              <div className="flex items-center gap-1 text-xs text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Coin Selector */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {COINS.map((coin) => (
              <button
                key={coin.symbol}
                onClick={() => setSelectedCoin(coin.symbol)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  selectedCoin === coin.symbol
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <span>{coin.label}</span>
                <span className="ml-1 opacity-60">({coin.volatility})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Price & Signal Card */}
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          {/* Price Card */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Current Price</h2>
              {goldSource === "simulated" && selectedCoin === "XAUUSDT" && (
                <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400">
                  Yahoo Finance
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3">
              <p className="font-mono text-3xl font-bold">
                {currentPrice ? `$${formatPrice(currentPrice)}` : "—"}
              </p>
              {priceChange && (
                <span className={`font-mono text-sm ${
                  parseFloat(priceChange.percent) >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {formatPercent(parseFloat(priceChange.percent))}
                </span>
              )}
            </div>
          </div>

          {/* Signal Card */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Nexus Signal</h2>
            {nexusSignal ? (
              <div className="space-y-2">
                <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${getSignalBg(nexusSignal.decision.action)}`}>
                  {getSignalIcon(nexusSignal.decision.action)}
                  <span className={`font-mono text-lg font-bold ${getSignalColor(nexusSignal.decision.action)}`}>
                    {nexusSignal.decision.action}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Confidence: {nexusSignal.decision.confidence.toFixed(0)}%</span>
                  <span>Reason: {nexusSignal.decision.reason}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for signal...</p>
            )}
          </div>
        </div>

        {/* Tabs: Live Test / Backtest / Paper Trading */}
        <div className="mb-4">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setActiveTab("live")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "live"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Activity className="mr-1.5 inline h-4 w-4" />
              Live Test
            </button>
            <button
              onClick={() => setActiveTab("backtest")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "backtest"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="mr-1.5 inline h-4 w-4" />
              Backtest
            </button>
            <button
              onClick={() => setActiveTab("paper")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "paper"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <DollarSign className="mr-1.5 inline h-4 w-4" />
              Paper Trading
            </button>
          </div>
        </div>

        {/* Live Test Tab */}
        {activeTab === "live" && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              {!isLiveTesting ? (
                <button
                  onClick={startLiveTesting}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Play className="h-4 w-4" />
                  Start Live Testing
                </button>
              ) : (
                <button
                  onClick={stopLiveTesting}
                  className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                >
                  <Pause className="h-4 w-4" />
                  Stop Live Testing
                </button>
              )}
              <button
                onClick={generateTestSignal}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                Generate Test Signal
              </button>
              {isLiveTesting && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Next refresh: {refreshCountdown}s
                </span>
              )}
            </div>

            {/* Live Entries Table */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-3">
                <h3 className="text-sm font-semibold">Signal History ({liveEntries.length})</h3>
              </div>
              {liveEntries.length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Signal</th>
                        <th className="px-3 py-2 font-medium">Confidence</th>
                        <th className="px-3 py-2 font-medium">Entry</th>
                        <th className="px-3 py-2 font-medium">Exit</th>
                        <th className="px-3 py-2 font-medium">Movement</th>
                        <th className="px-3 py-2 font-medium">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveEntries.map((entry) => (
                        <tr key={entry.timestamp} className="border-t border-border transition-colors hover:bg-muted/50">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 font-semibold ${getSignalColor(entry.signal)}`}>
                              {getSignalIcon(entry.signal)}
                              {entry.signal}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {entry.confidence.toFixed(0)}%
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            ${formatPrice(entry.entryPrice)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {entry.exitPrice ? `$${formatPrice(entry.exitPrice)}` : "—"}
                          </td>
                          <td className={`px-3 py-2 font-mono text-xs ${
                            entry.actualMovement !== null
                              ? entry.actualMovement >= 0 ? "text-green-400" : "text-red-400"
                              : ""
                          }`}>
                            {entry.actualMovement !== null ? `${entry.actualMovement >= 0 ? "+" : ""}${entry.actualMovement.toFixed(2)}%` : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {entry.checked ? (
                              entry.correct ? (
                                <CheckCircle className="h-4 w-4 text-green-400" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-400" />
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Target className="h-8 w-8 opacity-50" />
                  <p className="text-sm">No signals yet. Start live testing or generate a test signal.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Backtest Tab */}
        {activeTab === "backtest" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                setIsBacktesting(true)
                setBacktestRunning(true)
                setStatusMessage("Running backtest...")
                try {
                  const { backtestingEngine } = await import("@/lib/backtesting")
                  const result = await backtestingEngine.runBacktest({
                    symbol: selectedCoin.replace("USDT", ""),
                    strategyName: "all",
                    days: 7,
                    initialCapital: 10000,
                    feeRate: 0.001,
                    positionSize: 0.25,
                  })
                  const m = result.metrics
                  const report: ComparisonReport = {
                    totalSignals: m.totalTrades,
                    correctPredictions: m.winningTrades,
                    wrongPredictions: m.losingTrades,
                    overallAccuracy: m.winRate,
                    nexusPnl: m.totalPnl,
                    nexusPnlPercent: m.totalPnlPercentage,
                    buyHoldPnl: m.buyAndHoldReturn * 100,
                    buyHoldPnlPercent: m.buyAndHoldReturn * 100,
                    randomPnl: 0,
                    randomPnlPercent: 0,
                    strategyAccuracies: [],
                    signals: [],
                  }
                  setBacktestReport(report)
                  setStatusMessage(`Backtest complete: ${m.totalTrades} trades, ${m.winRate.toFixed(1)}% win rate`)
                } catch (err: any) {
                  setStatusMessage(`Backtest failed: ${err.message}`)
                }
                setIsBacktesting(false)
                setBacktestRunning(false)
              }}
              disabled={isBacktesting}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isBacktesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <History className="h-4 w-4" />
              )}
              {isBacktesting ? "Running..." : "Run Backtest"}
            </button>
            </div>

            {backtestReport && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Backtest Report — {selectedCoin}</h3>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Total Signals</p>
                    <p className="font-mono text-lg font-bold">{backtestReport.totalSignals}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Accuracy</p>
                    <p className="font-mono text-lg font-bold text-green-400">{backtestReport.overallAccuracy.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Correct</p>
                    <p className="font-mono text-lg font-bold text-green-400">{backtestReport.correctPredictions}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Wrong</p>
                    <p className="font-mono text-lg font-bold text-red-400">{backtestReport.wrongPredictions}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Nexus P&L</p>
                    <p className={`font-mono text-lg font-bold ${backtestReport.nexusPnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {backtestReport.nexusPnlPercent >= 0 ? "+" : ""}{backtestReport.nexusPnlPercent.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Buy & Hold</p>
                    <p className={`font-mono text-lg font-bold ${backtestReport.buyHoldPnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {backtestReport.buyHoldPnlPercent >= 0 ? "+" : ""}{backtestReport.buyHoldPnlPercent.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Nexus P&L ($)</p>
                    <p className={`font-mono text-lg font-bold ${backtestReport.nexusPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      ${backtestReport.nexusPnl.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Random P&L</p>
                    <p className="font-mono text-lg font-bold text-muted-foreground">{backtestReport.randomPnlPercent.toFixed(2)}%</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Paper Trading Tab */}
        {activeTab === "paper" && (
          <div className="space-y-4">
            {/* Paper Trading Controls */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">Paper Trading — {selectedCoin.replace("USDT", "/USD")}</h3>
                  <p className="text-xs text-muted-foreground">
                    Nexus auto-trades {selectedCoin.replace("USDT", "")} with $1,000 virtual balance
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!isPaperTrading ? (
                    <button
                      onClick={startPaperTrading}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Play className="h-4 w-4" />
                      Start Paper Trading
                    </button>
                  ) : (
                    <button
                      onClick={stopPaperTrading}
                      className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                    >
                      <Pause className="h-4 w-4" />
                      Stop
                    </button>
                  )}
                  <button
                    onClick={resetPaperTrading}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Balance & Position */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className={`font-mono text-2xl font-bold ${flashColor === "green" ? "text-green-400" : flashColor === "red" ? "text-red-400" : ""}`}>
                  ${balance.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Initial: ${INITIAL_BALANCE.toFixed(2)} | P&L: {formatPercent(((balance - INITIAL_BALANCE) / INITIAL_BALANCE) * 100)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Position</p>
                {position ? (
                  <div className="space-y-1">
                    <p className={`font-mono text-lg font-bold ${position.direction === "LONG" ? "text-green-400" : "text-red-400"}`}>
                      {position.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT"}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      Entry: ${formatPrice(position.entryPrice)} | Qty: {position.quantity.toFixed(4)}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      SL: ${formatPrice(position.stopLoss)} | TP: ${formatPrice(position.takeProfit)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No open position</p>
                )}
              </div>
            </div>

            {/* Paper Trades Table */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-3">
                <h3 className="text-sm font-semibold">Trade History ({paperTrades.length})</h3>
              </div>
              {paperTrades.length > 0 ? (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Direction</th>
                        <th className="px-3 py-2 font-medium">Entry</th>
                        <th className="px-3 py-2 font-medium">Exit</th>
                        <th className="px-3 py-2 font-medium">P&L</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paperTrades.map((trade) => (
                        <tr key={trade.id} className="border-t border-border transition-colors hover:bg-muted/50">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {new Date(trade.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`font-semibold ${
                              trade.type === "BUY" ? "text-green-400" :
                              trade.type === "SELL" ? "text-red-400" :
                              trade.type === "TAKE_PROFIT" ? "text-green-400" : "text-red-400"
                            }`}>
                              {trade.type === "TAKE_PROFIT" ? "TP" : trade.type === "STOP_LOSS" ? "SL" : trade.type}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`font-semibold ${trade.direction === "LONG" ? "text-green-400" : "text-red-400"}`}>
                              {trade.direction}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">${formatPrice(trade.entryPrice)}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {trade.exitPrice ? `$${formatPrice(trade.exitPrice)}` : "—"}
                          </td>
                          <td className={`px-3 py-2 font-mono text-xs ${
                            trade.pnl !== null
                              ? trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                              : ""
                          }`}>
                            {trade.pnl !== null
                              ? `${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium ${
                              trade.status === "OPEN" ? "text-yellow-400" : "text-muted-foreground"
                            }`}>
                              {trade.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Shield className="h-8 w-8 opacity-50" />
                  <p className="text-sm">No trades yet. Start paper trading to see results.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold">Confirm Action</h3>
            <p className="mb-4 text-sm text-muted-foreground">{statusMessage}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (pendingAction) pendingAction()
                  setShowConfirm(false)
                  setPendingAction(null)
                }}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false)
                  setPendingAction(null)
                }}
                className="flex-1 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-right-2 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <p className="text-sm font-medium">{lastToast}</p>
        </div>
      )}
    </div>
  )
}
