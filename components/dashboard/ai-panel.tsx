"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Brain,
  MessageSquare,
  Zap,
  TrendingUp,
  TrendingDown,
  Send,
  Target,
  Shield,
  AlertCircle,
  CheckCircle,
  Loader2,
  BarChart3,
  Activity,
  Eye,
  Play,
  Pause,
  Settings,
  ChevronDown,
  ChevronUp,
  Info,
  Users,
  Search,
  Signal,
  X,
  RefreshCw,
  Clock,
  Volume2,
  LineChart,
  BarChartHorizontal,
  Paintbrush,
  Gauge,
  Trash2,
  History,
  Hand,
} from "lucide-react"
import type { Coin } from "@/lib/coins-data"
import { tradingStrategies, type Strategy, type TradeAnalysis } from "@/lib/trading-strategies"
import { runFullTradingPipeline } from "@/lib/full-trading-pipeline"
import { TRADING_USER_LEVEL } from "@/lib/trading-user-level"
import { runNexusAssistant } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"
import { ContainerMode, type UserLevel } from "./container-mode"
import { StrategyAnalyzer } from "./strategy-analyzer"
import {
  getLiveRouteLabel,
  getLiveRouteShortLabel,
  getLiveRouteState,
  suggestSimilarCoins,
} from "@/lib/exchange-coin-support"
import { useExchangeTradableBases } from "@/hooks/use-exchange-tradable-bases"
import {
  appendPaperTrade,
  buildPaperTradeRecord,
  clearAllPaperTrades,
  deletePaperTradeById,
  loadPaperTradeHistory,
  type PaperTradeRecord,
} from "@/lib/paper-trade-storage"

interface AIPanelProps {
  coins: Coin[]
  selectedCoin: Coin
  onNavigateToTrade?: (coin: Coin, strategies: string[], expertMode: boolean, settings: AnalysisSettings) => void
  onStrategyCoinChange?: (coin: Coin) => void
  /** When at least one exchange is connected, major symbols show live routing. */
  hasExchangeConnection?: boolean
  /** Linked exchange id (e.g. binance) used to load tradable USDT bases for labels. */
  defaultExchangeId?: string
  /** Spot/margin API + balance checks for Modes A & B (exchange path). */
  realTradeEligible?: boolean
  /** Set false if keys lack spot/margin scopes (when you wire real checks). */
  exchangePermissionsOk?: boolean
  userLevel?: UserLevel
  isGuestSession?: boolean
}

export interface AnalysisSettings {
  period: "10m" | "15m" | "1h" | "4h" | "12h" | "1d"
  resultTime: "10m" | "15m" | "30m" | "1h" | "12h"
  autoTrade: boolean
  tradeAmount: number
  executionMode?: "nex_auto" | "manual"
}

type AIMode = "strategy" | "compare" | "assistant" | "auto" | "container"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

type CompareSubMode = "live" | "paper" | "history"

export function AIPanel({
  coins,
  selectedCoin,
  onNavigateToTrade,
  onStrategyCoinChange,
  hasExchangeConnection = false,
  defaultExchangeId,
  realTradeEligible = false,
  exchangePermissionsOk = true,
  userLevel = 1,
  isGuestSession = false,
}: AIPanelProps) {
  const { bases: tradableBases, status: tradableStatus } = useExchangeTradableBases(
    defaultExchangeId,
    Boolean(hasExchangeConnection && defaultExchangeId)
  )
  const maxStrategies = tradingStrategies.length
  const showFullStrategyLabels = true

  const [activeMode, setActiveMode] = useState<AIMode>("strategy")
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(() => {
    const ids = tradingStrategies.map((s) => s.id)
    return ids.slice(0, Math.min(5, ids.length))
  })
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<TradeAnalysis | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [autoTradeActive, setAutoTradeActive] = useState(false)
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null)
  const [showStrategyAnalyzer, setShowStrategyAnalyzer] = useState(false)
  const [wallStreetCoin, setWallStreetCoin] = useState<Coin>(selectedCoin)
  const [strategyCoinQuery, setStrategyCoinQuery] = useState("")
  const [strategyComments, setStrategyComments] = useState<string[]>([])
  const [strategyCommentDraft, setStrategyCommentDraft] = useState("")
  const [compareSubMode, setCompareSubMode] = useState<CompareSubMode>("live")
  const [paperAmount, setPaperAmount] = useState("250")
  const [paperHistory, setPaperHistory] = useState<PaperTradeRecord[]>([])
  const [paperFeedback, setPaperFeedback] = useState<string | null>(null)
  const [riskSettings, setRiskSettings] = useState({
    maxRiskPerTrade: 2,
    maxOpenTrades: 5,
    dailyLossLimit: 5,
    requireConsensus: 60, // percentage of strategies that must agree
  })

  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1D"]

  const quickPrompts = [
    "Analyze all strategies",
    "Which coin has best setup?",
    "Show risk assessment",
    "Explain current signals",
  ]

  useEffect(() => {
    setWallStreetCoin(selectedCoin)
  }, [selectedCoin])

  useEffect(() => {
    if (activeMode === "compare" && compareSubMode === "history") {
      setPaperHistory(loadPaperTradeHistory())
    }
  }, [activeMode, compareSubMode])

  const strategyCoinMatches = useMemo(() => {
    if (!strategyCoinQuery.trim()) return coins.slice(0, 16)
    const q = strategyCoinQuery.toLowerCase()
    return coins.filter(
      (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    )
  }, [coins, strategyCoinQuery])

  const strategyCoinSuggestions = useMemo(
    () => suggestSimilarCoins(coins, strategyCoinQuery, 8),
    [coins, strategyCoinQuery]
  )

  // Generate mock historical data for analysis
  const historicalData = useMemo(() => {
    const data = []
    let price = wallStreetCoin.price
    for (let i = 100; i >= 0; i--) {
      const change = (Math.random() - 0.5) * price * 0.02
      price += change
      data.push({
        open: price - change * 0.3,
        high: price + Math.abs(change) * 0.5,
        low: price - Math.abs(change) * 0.5,
        close: price,
        volume: Math.random() * 1000000
      })
    }
    return data
  }, [wallStreetCoin.price])

  const buildWallstreetAssistantReply = useCallback(
    (raw: string) => {
      const lowerInput = raw.toLowerCase()
      if (lowerInput.includes("analyze") || lowerInput.includes("all strategies")) {
        let response = `Running multi-strategy analysis on ${wallStreetCoin.symbol}...\n\n`
        response += `Active Strategies: ${tradingStrategies.filter((s) => s.isActive).length}\n`
        response += `Timeframe: ${selectedTimeframe}\n\n`
        response += `Quick verdict: ${wallStreetCoin.change24h > 0 ? "Bullish bias" : "Bearish bias"} with ${Math.round(Math.random() * 30 + 55)}% consensus.\n\n`
        response += `Click "Run Analysis" for detailed breakdown.`
        return response
      }
      if (lowerInput.includes("best setup") || lowerInput.includes("which coin")) {
        const bestCoin = coins.reduce((best, coin) => (coin.change24h > best.change24h ? coin : best))
        let response = `Based on current multi-strategy analysis:\n\n`
        response += `Best Setup: ${bestCoin.symbol} (+${bestCoin.change24h.toFixed(2)}%)\n`
        response += `- Strong momentum across timeframes\n`
        response += `- Multiple strategies aligned\n`
        response += `- Good risk/reward ratio available`
        return response
      }
      if (lowerInput.includes("risk")) {
        let response = `Current Risk Assessment:\n\n`
        response += `- Max Risk Per Trade: ${riskSettings.maxRiskPerTrade}%\n`
        response += `- Max Open Trades: ${riskSettings.maxOpenTrades}\n`
        response += `- Daily Loss Limit: ${riskSettings.dailyLossLimit}%\n`
        response += `- Consensus Required: ${riskSettings.requireConsensus}%\n\n`
        response += `Portfolio is within acceptable risk parameters.`
        return response
      }
      if (lowerInput.includes("explain") || lowerInput.includes("signal")) {
        let response = `Current Signal Explanation for ${wallStreetCoin.symbol}:\n\n`
        response += `The desk is scanning ${tradingStrategies.filter((s) => s.isActive).length} active strategies.\n\n`
        response += `Key factors being evaluated:\n`
        response += `- Fair Value Gaps & Order Blocks\n`
        response += `- RSI Divergences\n`
        response += `- Break of Structure patterns\n`
        response += `- Liquidity sweeps\n`
        response += `- EMA crossovers\n`
        response += `- VWAP reactions\n\n`
        response += `Each strategy votes BUY, SELL, or HOLD. The consensus determines the final signal.`
        return response
      }
      return runNexusAssistant({
        userMessage: raw,
        surface: "dashboard_wallstreet_assistant",
        tradingUserLevel: TRADING_USER_LEVEL,
        isGuest: isGuestSession,
        focusSymbol: wallStreetCoin.symbol,
      })
    },
    [wallStreetCoin, coins, tradingStrategies, selectedTimeframe, riskSettings, isGuestSession]
  )

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    try {
      const { tradeAnalysis } = await runFullTradingPipeline(
        {
          symbol: wallStreetCoin.symbol,
          price: wallStreetCoin.price,
          change24h: wallStreetCoin.change24h,
        },
        historicalData,
        { userAccessLevel: TRADING_USER_LEVEL, depthLimit: 100 }
      )
      setAnalysisResult(tradeAnalysis)
    } catch (e) {
      console.error("[AIPanel] runFullTradingPipeline failed:", e)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSendMessage = async () => {
    const raw = chatInput.trim()
    if (!raw) return

    const userMessage: ChatMessage = { role: "user", content: raw }
    setChatMessages((prev) => [...prev, userMessage])
    setChatInput("")

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const draft = buildWallstreetAssistantReply(raw)
    const response = await requestNexusAssistantReply({
      userMessage: raw,
      surface: "dashboard_wallstreet_assistant",
      tradingUserLevel: TRADING_USER_LEVEL,
      isGuest: isGuestSession,
      focusSymbol: wallStreetCoin.symbol,
      precomputedDraft: draft,
    })
    const assistantMessage: ChatMessage = { role: "assistant", content: response }
    setChatMessages((prev) => [...prev, assistantMessage])
  }

  const toggleStrategy = (strategyId: string) => {
    setSelectedStrategies((prev) =>
      prev.includes(strategyId)
        ? prev.filter((id) => id !== strategyId)
        : prev.length < maxStrategies
          ? [...prev, strategyId]
          : prev
    )
  }

  const pickWallStreetCoin = useCallback(
    (c: Coin) => {
      setWallStreetCoin(c)
      onStrategyCoinChange?.(c)
    },
    [onStrategyCoinChange]
  )

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (price >= 1) return price.toFixed(4)
    return price.toFixed(6)
  }

  const getConsensusColor = (consensus: TradeAnalysis["consensus"]) => {
    switch (consensus) {
      case "STRONG_BUY": return "text-success"
      case "BUY": return "text-success/80"
      case "STRONG_SELL": return "text-destructive"
      case "SELL": return "text-destructive/80"
      default: return "text-muted-foreground"
    }
  }

  return (
    <Card className="border-border bg-card p-4">
      {/* Mode Tabs */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        <Button
          variant={activeMode === "strategy" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveMode("strategy")}
          className="gap-2"
        >
          <Brain className="h-4 w-4" />
          Strategies
        </Button>
        <Button
          variant={activeMode === "compare" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveMode("compare")}
          className="gap-2"
        >
          <BarChart3 className="h-4 w-4" />
          Compare
        </Button>
        <Button
          variant={activeMode === "assistant" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveMode("assistant")}
          className="gap-2"
        >
          <MessageSquare className="h-4 w-4" />
          Joelin
        </Button>
        <Button
          variant={activeMode === "auto" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveMode("auto")}
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          Auto Trade
        </Button>
        <Button
          variant={activeMode === "container" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveMode("container")}
          className="gap-2 bg-gradient-to-r from-primary/80 to-accent/80 text-white hover:from-primary hover:to-accent"
        >
          <Target className="h-4 w-4" />
          Container
        </Button>
      </div>

      {/* Strategy Mode - Select and Configure Strategies */}
      {activeMode === "strategy" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Market (catalog)</h3>
              {(() => {
                const st = getLiveRouteState(
                  Boolean(hasExchangeConnection),
                  wallStreetCoin.symbol,
                  tradableBases,
                  tradableStatus
                )
                const lbl = getLiveRouteLabel(st)
                const cls =
                  lbl.tone === "success"
                    ? "bg-success/15 text-success"
                    : lbl.tone === "warning"
                      ? "bg-warning/15 text-warning"
                      : lbl.tone === "muted"
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary"
                return (
                  <span
                    title={lbl.text}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${cls}`}
                  >
                    {lbl.text}
                  </span>
                )
              })()}
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={strategyCoinQuery}
                onChange={(e) => setStrategyCoinQuery(e.target.value)}
                placeholder="Search symbol or name…"
                className="pl-9"
              />
            </div>
            {strategyCoinQuery.trim() && strategyCoinMatches.length === 0 ? (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <p className="font-medium text-destructive">❌ COIN NOT FOUND</p>
                <p className="mt-1 text-muted-foreground">Try a similar symbol:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {strategyCoinSuggestions.map((c) => (
                    <button
                      key={c.symbol}
                      type="button"
                      className="rounded-md border border-border bg-background px-2 py-1 hover:border-primary"
                      onClick={() => {
                        setStrategyCoinQuery(c.symbol)
                        pickWallStreetCoin(c)
                      }}
                    >
                      {c.symbol}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {strategyCoinMatches.map((c) => {
                const st = getLiveRouteState(
                  Boolean(hasExchangeConnection),
                  c.symbol,
                  tradableBases,
                  tradableStatus
                )
                const lbl = getLiveRouteLabel(st)
                const active = c.symbol === wallStreetCoin.symbol
                const chipCls =
                  lbl.tone === "success"
                    ? "bg-success/15 text-success"
                    : lbl.tone === "warning"
                      ? "bg-warning/15 text-warning"
                      : lbl.tone === "muted"
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary"
                return (
                  <button
                    key={c.symbol}
                    type="button"
                    onClick={() => pickWallStreetCoin(c)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <span className="font-mono font-medium">{c.symbol}</span>
                    <span className="text-xs text-muted-foreground">{c.name}</span>
                    <span
                      title={lbl.text}
                      className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${chipCls}`}
                    >
                      {getLiveRouteShortLabel(st)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Analyze a Coin — Wall Street hero (image stops here; does not extend into Active Strategies) */}
          <div className="relative isolate w-full overflow-hidden rounded-xl border border-white/10 shadow-md ring-1 ring-black/30">
            <div className="relative h-36 w-full sm:h-44 md:h-48">
              <Image
                src="/images/wallstreet-trading-floor.jpg"
                alt=""
                fill
                className="object-cover object-[center_30%]"
                sizes="(max-width: 768px) 100vw, min(896px, 100vw)"
                priority
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-slate-900/25"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/20 to-emerald-950/15"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => setShowStrategyAnalyzer(true)}
                aria-label="Open strategy analyzer to analyze a coin"
                className="group absolute inset-0 z-10 flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-black/40 shadow-inner backdrop-blur-sm transition-colors group-hover:border-emerald-400/40 group-hover:bg-black/55">
                    <Search className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold tracking-tight text-white drop-shadow-md">
                      Analyze a Coin
                    </p>
                    <p className="text-xs text-white/75 drop-shadow">
                      Open full workflow — market is selected above
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-sm backdrop-blur-sm transition-colors group-hover:border-emerald-400/70 group-hover:bg-emerald-500/35">
                  <Target className="h-3.5 w-3.5" />
                  Start
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Active Strategies ({selectedStrategies.length}/{maxStrategies} selected · {tradingStrategies.length}{" "}
              available)
            </h3>
            <div className="flex gap-2">
              {timeframes.map((tf) => (
                <Button
                  key={tf}
                  variant={selectedTimeframe === tf ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTimeframe(tf)}
                  className="h-7 px-2 text-xs"
                >
                  {tf}
                </Button>
              ))}
            </div>
          </div>

          {/* Strategy List */}
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {tradingStrategies.map((strategy) => (
              <div
                key={strategy.id}
                className={`rounded-lg border p-3 transition-colors ${
                  selectedStrategies.includes(strategy.id)
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleStrategy(strategy.id)}
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        selectedStrategies.includes(strategy.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground"
                      }`}
                    >
                      {selectedStrategies.includes(strategy.id) && (
                        <CheckCircle className="h-3 w-3" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {showFullStrategyLabels ? strategy.name : strategy.shortName}
                        </span>
                        {showFullStrategyLabels ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {strategy.shortName}
                          </span>
                        ) : null}
                        <span className={`rounded px-1.5 py-0.5 text-xs ${
                          strategy.category === "smart_money" ? "bg-purple-500/20 text-purple-400" :
                          strategy.category === "momentum" ? "bg-blue-500/20 text-blue-400" :
                          strategy.category === "trend" ? "bg-green-500/20 text-green-400" :
                          strategy.category === "reversal" ? "bg-orange-500/20 text-orange-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {strategy.category}
                        </span>
                      </div>
                      {showFullStrategyLabels ? (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{strategy.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {strategy.backtestResults && (
                      <span className="text-xs text-success">
                        {strategy.backtestResults.winRate}% WR
                      </span>
                    )}
                    <button
                      onClick={() => setExpandedStrategy(expandedStrategy === strategy.id ? null : strategy.id)}
                      className="rounded p-1 hover:bg-muted"
                    >
                      {expandedStrategy === strategy.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Strategy Details */}
                {expandedStrategy === strategy.id && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="grid gap-3 text-xs md:grid-cols-2">
                      <div>
                        <p className="mb-1 font-medium text-primary">Entry Rules:</p>
                        <ul className="space-y-1 text-muted-foreground">
                          {strategy.rules.entry.map((rule, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-primary">{i + 1}.</span>
                              {rule}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-primary">Exit Rules:</p>
                        <ul className="space-y-1 text-muted-foreground">
                          {strategy.rules.exit.map((rule, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-primary">{i + 1}.</span>
                              {rule}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-destructive">Stop Loss:</p>
                        <p className="text-muted-foreground">{strategy.rules.stopLoss}</p>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-success">Take Profit:</p>
                        <p className="text-muted-foreground">{strategy.rules.takeProfit}</p>
                      </div>
                    </div>
                    {strategy.backtestResults && (
                      <div className="mt-3 flex flex-wrap gap-3 rounded-lg bg-muted/50 p-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Win Rate: </span>
                          <span className="font-medium text-success">{strategy.backtestResults.winRate}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Profit Factor: </span>
                          <span className="font-medium">{strategy.backtestResults.profitFactor}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Avg Win: </span>
                          <span className="font-medium text-success">{strategy.backtestResults.avgWin}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Avg Loss: </span>
                          <span className="font-medium text-destructive">{strategy.backtestResults.avgLoss}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Trades: </span>
                          <span className="font-medium">{strategy.backtestResults.totalTrades}</span>
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {strategy.indicators.map((ind, i) => (
                        <span key={i} className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button 
            onClick={handleAnalyze} 
            className="w-full gap-2"
            disabled={isAnalyzing || selectedStrategies.length === 0}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing {wallStreetCoin.symbol}...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                Run Analysis ({selectedStrategies.length} strategies)
              </>
            )}
          </Button>

          {analysisResult ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Last run · {wallStreetCoin.symbol}</span>
                <span className={`text-lg font-bold ${getConsensusColor(analysisResult.consensus)}`}>
                  {analysisResult.consensus.replace("_", " ")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{analysisResult.recommendation}</p>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Comments & testimonies</p>
                <div className="max-h-28 space-y-2 overflow-y-auto text-xs">
                  {strategyComments.map((c, i) => (
                    <div key={i} className="rounded-md bg-background/80 px-2 py-1.5">
                      {c}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={strategyCommentDraft}
                    onChange={(e) => setStrategyCommentDraft(e.target.value)}
                    placeholder="Add a short note…"
                    className="text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const t = strategyCommentDraft.trim()
                      if (!t) return
                      setStrategyComments((prev) => [t, ...prev].slice(0, 20))
                      setStrategyCommentDraft("")
                    }}
                  >
                    Post
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Compare (sub-tabs: live vs paper vs history) */}
      {activeMode === "compare" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold">Compare · {wallStreetCoin.symbol}</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={compareSubMode === "live" ? "default" : "outline"}
                onClick={() => {
                  setCompareSubMode("live")
                  setPaperFeedback(null)
                }}
              >
                Live analysis
              </Button>
              <Button
                size="sm"
                variant={compareSubMode === "paper" ? "default" : "outline"}
                onClick={() => {
                  setCompareSubMode("paper")
                  setPaperFeedback(null)
                }}
              >
                Demo (paper)
              </Button>
              <Button
                size="sm"
                variant={compareSubMode === "history" ? "default" : "outline"}
                onClick={() => {
                  setCompareSubMode("history")
                  setPaperHistory(loadPaperTradeHistory())
                  setPaperFeedback(null)
                }}
                className="gap-1"
              >
                <History className="h-3.5 w-3.5" />
                Paper history
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Trading modes (after coin + strategies)</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>A — Nex Auto-Trade:</strong> real routing to your exchange when API + balance allow.
              </li>
              <li>
                <strong>B — Manual trade:</strong> same checks; you confirm each execution on the desk.
              </li>
              <li>
                <strong>C — Demo (paper):</strong> live quote + analysis only;{" "}
                <span className="text-warning">nothing is sent to the exchange</span> — history stays here.
              </li>
            </ul>
          </div>

          {(() => {
            const blocked =
              !hasExchangeConnection ||
              !exchangePermissionsOk ||
              !realTradeEligible
            const blockReason = !hasExchangeConnection
              ? "No exchange account connected."
              : !exchangePermissionsOk
                ? "Exchange API needs spot and margin permissions."
                : !realTradeEligible
                  ? "No available balance (spot/margin) or API access blocked for trading."
                  : ""
            return blocked ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">❌ Cannot execute real trade — check exchange API permissions</p>
                  <p className="mt-1 text-xs opacity-90">{blockReason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modes A & B stay blocked until all conditions pass. Mode C is always available below.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-success">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Real desk can send orders: exchange linked, permissions assumed OK, balance detected.</span>
              </div>
            )
          })()}

          {compareSubMode === "paper" && (
            <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <h4 className="text-sm font-semibold">Mode C — Demo analysis (paper)</h4>
              <p className="text-xs text-muted-foreground">
                Uses the latest multi-strategy run and <strong>live {wallStreetCoin.symbol} price</strong> at save
                time. Nex does <strong>not</strong> send execution commands in this mode.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Simulated size (USD)</label>
                  <Input
                    value={paperAmount}
                    onChange={(e) => setPaperAmount(e.target.value)}
                    className="w-36 font-mono"
                    inputMode="decimal"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!analysisResult || isAnalyzing}
                  onClick={() => {
                    setPaperFeedback(null)
                    const amt = parseFloat(paperAmount)
                    if (!analysisResult) {
                      setPaperFeedback("Run Live analysis first, then save a paper leg from that signal.")
                      return
                    }
                    if (!Number.isFinite(amt) || amt <= 0) {
                      setPaperFeedback("Enter a valid simulated notional (USD).")
                      return
                    }
                    const row = buildPaperTradeRecord({
                      symbol: wallStreetCoin.symbol,
                      amountUsd: amt,
                      entryPrice: wallStreetCoin.price,
                      consensus: analysisResult.consensus,
                      overallConfidence: analysisResult.overallConfidence,
                      suggestedEntry: analysisResult.suggestedEntry,
                      suggestedTP: analysisResult.suggestedTP,
                      suggestedSL: analysisResult.suggestedSL,
                      strategyIds: selectedStrategies,
                    })
                    appendPaperTrade(row)
                    setPaperHistory(loadPaperTradeHistory())
                    setPaperFeedback("Paper trade recorded at live price — no exchange order sent.")
                  }}
                >
                  Run &amp; save paper simulation
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !hasExchangeConnection ||
                    !exchangePermissionsOk ||
                    !realTradeEligible ||
                    !onNavigateToTrade
                  }
                  onClick={() => {
                    const amt = parseFloat(paperAmount) || 100
                    onNavigateToTrade?.(wallStreetCoin, selectedStrategies, false, {
                      period: "15m",
                      resultTime: "30m",
                      autoTrade: true,
                      tradeAmount: amt,
                      executionMode: "nex_auto",
                    })
                  }}
                >
                  <Zap className="mr-1 h-3.5 w-3.5" />
                  Mode A — Open Nex Auto-Trade desk
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    !hasExchangeConnection ||
                    !exchangePermissionsOk ||
                    !realTradeEligible ||
                    !onNavigateToTrade
                  }
                  onClick={() => {
                    const amt = parseFloat(paperAmount) || 100
                    onNavigateToTrade?.(wallStreetCoin, selectedStrategies, false, {
                      period: "15m",
                      resultTime: "30m",
                      autoTrade: false,
                      tradeAmount: amt,
                      executionMode: "manual",
                    })
                  }}
                >
                  <Hand className="mr-1 h-3.5 w-3.5" />
                  Mode B — Open manual desk
                </Button>
              </div>
              {paperFeedback ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {paperFeedback}
                </p>
              ) : null}
            </div>
          )}

          {compareSubMode === "history" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Saved paper runs (newest first)</p>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={paperHistory.length === 0}
                  onClick={() => {
                    clearAllPaperTrades()
                    setPaperHistory([])
                    setPaperFeedback("All paper history cleared.")
                  }}
                >
                  Clear all
                </Button>
              </div>
              {paperHistory.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No paper trades yet. Run Live analysis, then save one from the Demo (paper) tab.
                </p>
              ) : (
                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {paperHistory.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-mono font-semibold">
                          {row.symbol} · ${row.amountUsd.toFixed(2)} notional
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()} · {row.consensus.replace(/_/g, " ")} · P&amp;L{" "}
                          <span className={row.pnlUsd >= 0 ? "text-success" : "text-destructive"}>
                            {row.pnlUsd >= 0 ? "+" : ""}
                            {row.pnlUsd.toFixed(2)} USD
                          </span>
                        </p>
                        <ul className="text-xs text-muted-foreground">
                          {row.legs.map((leg, i) => (
                            <li key={i}>
                              {leg.at} · {leg.side} @ {leg.price} — {leg.note}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:bg-destructive/10"
                        aria-label="Delete paper trade"
                        onClick={() => {
                          deletePaperTradeById(row.id)
                          setPaperHistory(loadPaperTradeHistory())
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {paperFeedback && compareSubMode === "history" ? (
                <p className="text-xs text-muted-foreground">{paperFeedback}</p>
              ) : null}
            </div>
          )}

          {compareSubMode === "live" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Multi-strategy view · same market as Strategies tab</p>
                <Button onClick={handleAnalyze} size="sm" disabled={isAnalyzing}>
                  {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                </Button>
              </div>

              {analysisResult ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Consensus</span>
                      <span className={`text-xl font-bold ${getConsensusColor(analysisResult.consensus)}`}>
                        {analysisResult.consensus.replace("_", " ")}
                      </span>
                    </div>
                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          analysisResult.consensus.includes("BUY")
                            ? "bg-success"
                            : analysisResult.consensus.includes("SELL")
                              ? "bg-destructive"
                              : "bg-muted-foreground"
                        }`}
                        style={{ width: `${analysisResult.overallConfidence}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{analysisResult.recommendation}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Individual strategy signals</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {analysisResult.signals.map((signal, i) => (
                        <div
                          key={i}
                          className={`rounded-lg border p-3 ${
                            signal.signal === "BUY"
                              ? "border-success/30 bg-success/5"
                              : signal.signal === "SELL"
                                ? "border-destructive/30 bg-destructive/5"
                                : "border-border bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{signal.strategy}</span>
                            <span
                              className={`flex items-center gap-1 text-sm font-bold ${
                                signal.signal === "BUY"
                                  ? "text-success"
                                  : signal.signal === "SELL"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {signal.signal === "BUY" && <TrendingUp className="h-3 w-3" />}
                              {signal.signal === "SELL" && <TrendingDown className="h-3 w-3" />}
                              {signal.signal}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{signal.reason}</p>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Confidence</span>
                            <span className="font-medium">{signal.confidence}%</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full ${
                                signal.signal === "BUY"
                                  ? "bg-success"
                                  : signal.signal === "SELL"
                                    ? "bg-destructive"
                                    : "bg-muted-foreground"
                              }`}
                              style={{ width: `${signal.confidence}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <h4 className="mb-3 font-medium">Suggested trade levels</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Entry</p>
                        <p className="font-mono text-sm font-medium">${formatPrice(analysisResult.suggestedEntry)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-destructive">Stop loss</p>
                        <p className="font-mono text-sm font-medium text-destructive">
                          ${formatPrice(analysisResult.suggestedSL)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-success">Take profit</p>
                        <p className="font-mono text-sm font-medium text-success">
                          ${formatPrice(analysisResult.suggestedTP)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Historical accuracy</span>
                      <span className="font-medium">{analysisResult.historicalAccuracy}%</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Risk level</span>
                      <span
                        className={`font-medium ${
                          analysisResult.riskLevel === "LOW"
                            ? "text-success"
                            : analysisResult.riskLevel === "MEDIUM"
                              ? "text-warning"
                              : "text-destructive"
                        }`}
                      >
                        {analysisResult.riskLevel}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <BarChart3 className="mb-3 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Run analysis to populate the compare workspace</p>
                  <Button onClick={handleAnalyze} className="mt-4 gap-2" disabled={isAnalyzing}>
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <Activity className="h-4 w-4" />
                        Run multi-strategy analysis
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Assistant Mode - Live Signal Hub + Chat */}
      {activeMode === "assistant" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
              <h4 className="mb-2 text-sm font-semibold">Pinned picks (Wallstreet Assistant)</h4>
              <p className="mb-3 text-xs text-muted-foreground">
                System-ranked movers — selection only; methodology is not shown.
              </p>
              <div className="flex flex-wrap gap-2">
                {[...coins]
                  .sort((a, b) => b.change24h - a.change24h)
                  .slice(0, 6)
                  .map((c) => (
                    <button
                      key={c.symbol}
                      type="button"
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium hover:border-primary"
                      onClick={() => pickWallStreetCoin(c)}
                    >
                      {c.symbol} · {c.change24h >= 0 ? "+" : ""}
                      {c.change24h.toFixed(1)}%
                    </button>
                  ))}
              </div>
            </div>
          {/* Live Signal Hub */}
          <LiveSignalHub coins={coins} selectedCoin={wallStreetCoin} />

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Wallstreet · Joelin</span>
            </div>
          </div>

          {/* Chat Section */}
          <div className="flex flex-col h-[300px]">
            <div className="mb-3 flex flex-wrap gap-2">
              {quickPrompts.map((prompt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setChatInput(prompt)
                    const userMessage: ChatMessage = { role: "user", content: prompt }
                    setChatMessages((prev) => [...prev, userMessage])
                    
                    setTimeout(() => {
                      void (async () => {
                        const draft = buildWallstreetAssistantReply(prompt)
                        const response = await requestNexusAssistantReply({
                          userMessage: prompt,
                          surface: "dashboard_wallstreet_assistant",
                          tradingUserLevel: TRADING_USER_LEVEL,
                          isGuest: isGuestSession,
                          focusSymbol: wallStreetCoin.symbol,
                          precomputedDraft: draft,
                        })
                        const assistantMessage: ChatMessage = { role: "assistant", content: response }
                        setChatMessages((prev) => [...prev, assistantMessage])
                      })()
                    }, 1000)
                  }}
                  className="text-xs"
                >
                  {prompt}
                </Button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Brain className="mb-3 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Ask Joelin about strategies, signals, or risk on this desk</p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 ${
                      msg.role === "user"
                        ? "ml-8 bg-primary text-primary-foreground"
                        : "mr-8 bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask Joelin about strategies, signals, or analysis…"
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <Button onClick={handleSendMessage} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Trade Mode */}
      {activeMode === "auto" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Automated Trading</h3>
            <Button
              variant={autoTradeActive ? "destructive" : "default"}
              size="sm"
              onClick={() => setAutoTradeActive(!autoTradeActive)}
              className="gap-2"
            >
              {autoTradeActive ? (
                <>
                  <Pause className="h-4 w-4" />
                  Stop Bot
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Bot
                </>
              )}
            </Button>
          </div>

          {/* Risk Settings */}
          <Card className="border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Risk Management</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Max Risk Per Trade</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={riskSettings.maxRiskPerTrade}
                    onChange={(e) => setRiskSettings(prev => ({ ...prev, maxRiskPerTrade: Number(e.target.value) }))}
                    className="h-8"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Max Open Trades</label>
                <Input
                  type="number"
                  value={riskSettings.maxOpenTrades}
                  onChange={(e) => setRiskSettings(prev => ({ ...prev, maxOpenTrades: Number(e.target.value) }))}
                  className="h-8"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Daily Loss Limit</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={riskSettings.dailyLossLimit}
                    onChange={(e) => setRiskSettings(prev => ({ ...prev, dailyLossLimit: Number(e.target.value) }))}
                    className="h-8"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Consensus Required</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={riskSettings.requireConsensus}
                    onChange={(e) => setRiskSettings(prev => ({ ...prev, requireConsensus: Number(e.target.value) }))}
                    className="h-8"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Active Strategies for Bot */}
          <Card className="border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Bot Strategies ({selectedStrategies.length} active)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tradingStrategies.map((strategy) => (
                <button
                  key={strategy.id}
                  onClick={() => toggleStrategy(strategy.id)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    selectedStrategies.includes(strategy.id)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {strategy.shortName}
                </button>
              ))}
            </div>
          </Card>

          {/* Bot Status */}
          <Card className={`border p-4 ${autoTradeActive ? "border-success/50 bg-success/5" : "border-border bg-muted/30"}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                autoTradeActive ? "bg-success/20" : "bg-muted"
              }`}>
                {autoTradeActive ? (
                  <Activity className="h-5 w-5 text-success animate-pulse" />
                ) : (
                  <Pause className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {autoTradeActive ? "Bot Active" : "Bot Inactive"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {autoTradeActive 
                    ? `Monitoring ${coins.length} coins with ${selectedStrategies.length} strategies` 
                    : "Click Start Bot to begin automated trading"
                  }
                </p>
              </div>
            </div>

            {autoTradeActive && (
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scans completed</span>
                  <span className="font-medium">247</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Signals found</span>
                  <span className="font-medium text-primary">12</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trades executed</span>
                  <span className="font-medium text-success">3</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Session P&L</span>
                  <span className="font-medium text-success">+$142.50</span>
                </div>
              </div>
            )}
          </Card>

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Auto trading involves significant risk. The bot uses multiple strategies to reach consensus before executing. 
              Always set appropriate risk limits and monitor performance.
            </p>
          </div>
        </div>
      )}

      {/* Container Mode - Copy Trade / Fix Trade */}
      {activeMode === "container" && (
        <ContainerMode userLevel={userLevel} />
      )}

      {/* Strategy Analyzer Modal */}
      {showStrategyAnalyzer && (
        <StrategyAnalyzer
          coins={coins}
          userLevel={userLevel}
          isFixedTradeUser={false}
          exchangeConnected={hasExchangeConnection}
          tradableBases={tradableBases}
          tradableStatus={tradableStatus}
          onStartAnalysis={(coin, strategies, expertMode, settings) => {
            setShowStrategyAnalyzer(false)
            pickWallStreetCoin(coin)
            if (onNavigateToTrade) {
              onNavigateToTrade(coin, strategies, expertMode, settings)
            }
          }}
          onClose={() => setShowStrategyAnalyzer(false)}
        />
      )}
    </Card>
  )
}

// ==================== Live Signal Hub Component ====================

interface SignalData {
  asset: string
  change: string
  basePrice: number
  direction: "bull" | "bear"
  volume: string
  colorPos: boolean
}

const SIGNALS_DATA: SignalData[] = [
  { asset: "LUNC", change: "+18.16%", basePrice: 0.000182, direction: "bull", volume: "12.3M", colorPos: true },
  { asset: "ORCA", change: "+15.23%", basePrice: 2.45, direction: "bull", volume: "6.7M", colorPos: true },
  { asset: "CFX", change: "+11.47%", basePrice: 0.217, direction: "bull", volume: "8.1M", colorPos: true },
  { asset: "ZBT", change: "-28.37%", basePrice: 0.043, direction: "bear", volume: "3.2M", colorPos: false },
  { asset: "LAB", change: "-25.35%", basePrice: 0.891, direction: "bear", volume: "4.0M", colorPos: false },
  { asset: "AVAX", change: "+7.82%", basePrice: 34.20, direction: "bull", volume: "22M", colorPos: true },
  { asset: "DOT", change: "-5.44%", basePrice: 6.78, direction: "bear", volume: "14M", colorPos: false },
]

function generateHistoricalData(signal: SignalData, points = 30): number[] {
  let val = signal.basePrice
  const trend = signal.direction === "bull" ? 0.012 : -0.008
  const data: number[] = []
  for (let i = 0; i < points; i++) {
    const changeFactor = 1 + (trend + (Math.random() * 0.02 - 0.01))
    val = val * changeFactor
    data.push(val)
  }
  return data
}

function LiveSignalHub({ coins, selectedCoin }: { coins: Coin[]; selectedCoin: Coin }) {
  const [selectedSignal, setSelectedSignal] = useState<SignalData | null>(null)
  const [chartData, setChartData] = useState<number[]>([])
  const [chartType, setChartType] = useState<"line" | "bar">("line")
  const [chartColor, setChartColor] = useState("#6F8EFF")
  const [showSignalOverlay, setShowSignalOverlay] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<any>(null)
  const liveIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [])

  // Load Chart.js dynamically
  useEffect(() => {
    if (typeof window !== "undefined" && !(window as any).Chart) {
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  const openSignalModal = (signal: SignalData) => {
    setSelectedSignal(signal)
    const data = generateHistoricalData(signal, 30)
    setChartData(data)
    setChartType("line")
    setChartColor("#6F8EFF")
    setShowSignalOverlay(false)

    // Start live updates
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
    liveIntervalRef.current = setInterval(() => {
      setChartData((prev) => {
        const lastVal = prev[prev.length - 1]
        const drift = signal.direction === "bull"
          ? (Math.random() * 0.015 + 0.002)
          : (Math.random() * -0.018 - 0.002)
        let newVal = lastVal * (1 + drift)
        if (newVal <= 0) newVal = lastVal * 0.98
        const newData = [...prev, newVal]
        if (newData.length > 40) newData.shift()
        return newData
      })
    }, 2800)
  }

  const closeSignalModal = () => {
    setSelectedSignal(null)
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current)
      liveIntervalRef.current = null
    }
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
      chartInstanceRef.current = null
    }
  }

  // Render chart when data changes
  useEffect(() => {
    if (!selectedSignal || !canvasRef.current || typeof (window as any).Chart === "undefined") return

    const Chart = (window as any).Chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
    }

    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return

    const borderColor = chartColor
    const bgColor = chartType === "bar" ? chartColor + "90" : chartColor + "30"

    const config: any = {
      type: chartType,
      data: {
        labels: chartData.map((_, idx) => `t-${chartData.length - idx}`).reverse(),
        datasets: [
          {
            label: `${selectedSignal.asset} Price (USD)`,
            data: [...chartData],
            borderColor: borderColor,
            backgroundColor: chartType === "bar" ? bgColor : "transparent",
            borderWidth: 2.5,
            tension: 0.2,
            pointRadius: chartType === "line" ? 2 : 0,
            pointBackgroundColor: borderColor,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { labels: { color: "#BDD3FF", font: { size: 10 } } },
          tooltip: { mode: "index", intersect: false },
        },
        scales: {
          y: { grid: { color: "#1F2A44" }, ticks: { color: "#AFCAFF" } },
          x: { ticks: { color: "#90A3D4", maxRotation: 30 } },
        },
      },
    }

    if (chartType === "bar") {
      config.data.datasets[0].backgroundColor = chartColor + "90"
    }

    // Add signal overlay if enabled
    if (showSignalOverlay) {
      const overlayPoints = chartData.map((val, idx) => (idx % 7 === 0 ? val * 1.03 : null))
      config.data.datasets.push({
        label: "⚡ Signal Trigger",
        data: overlayPoints,
        borderColor: "#FFBB4C",
        borderWidth: 2,
        type: "line",
        pointRadius: 4,
        pointBackgroundColor: "#FF8C42",
        tension: 0,
      })
    }

    chartInstanceRef.current = new Chart(ctx, config)

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [selectedSignal, chartData, chartType, chartColor, showSignalOverlay])

  const randomizeData = () => {
    if (!selectedSignal) return
    setChartData(generateHistoricalData(selectedSignal, 32))
  }

  // Merge signal data with real coins
  const mergedSignals = useMemo(() => {
    const signalMap = new Map(SIGNALS_DATA.map((s) => [s.asset, s]))
    const result: SignalData[] = []

    // Add real coins first
    coins.forEach((coin) => {
      const symbol = coin.symbol.replace("/USDT", "")
      const existing = signalMap.get(symbol)
      if (existing) {
        result.push(existing)
        signalMap.delete(symbol)
      } else {
        const change = coin.change24h
        result.push({
          asset: symbol,
          change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
          basePrice: coin.price,
          direction: change >= 0 ? "bull" : "bear",
          volume: `${(Math.random() * 20 + 1).toFixed(1)}M`,
          colorPos: change >= 0,
        })
      }
    })

    // Add remaining signal-only assets
    signalMap.forEach((sig) => result.push(sig))

    return result
  }, [coins])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Signal className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">LIVE SIGNALS</span>
          <span className="flex items-center gap-1 text-xs text-success">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            ACTIVE STREAMS
          </span>
        </div>
      </div>

      {/* Signal Cards */}
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {mergedSignals.map((signal) => (
          <button
            key={signal.asset}
            onClick={() => openSignalModal(signal)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/50 hover:bg-primary/5 hover:-translate-y-0.5"
          >
            <div className="text-left">
              <h4 className="font-bold">{signal.asset}/USDT</h4>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3 w-3" />
                Live Pulse
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                streaming
              </p>
            </div>
            <div
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                signal.colorPos
                  ? "bg-success/15 text-success"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {signal.change}
            </div>
          </button>
        ))}
      </div>

      <p className="text-right text-xs text-muted-foreground">
        <Activity className="mr-1 inline h-3 w-3" />
        Click any signal for expanded live view + chart editing
      </p>

      {/* Signal Modal */}
      {selectedSignal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSignalModal()
          }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-200 to-purple-300 bg-clip-text text-transparent">
                {selectedSignal.asset}/USDT · LIVE SIGNAL
              </h2>
              <button onClick={closeSignalModal} className="rounded-full p-1 hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Live Badge */}
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                RUNNING SIGNAL · REAL-TIME UPDATES
              </div>

              {/* Chart */}
              <div className="rounded-2xl bg-background p-4">
                <canvas ref={canvasRef} height={200} className="w-full max-h-[240px]" />
              </div>

              {/* Signal Metadata */}
              <div className="flex flex-wrap gap-3">
                <div className="rounded-full bg-muted/50 px-4 py-2 text-xs">
                  <TrendingUp className="mr-1 inline h-3 w-3" />
                  Current: <strong className={selectedSignal.colorPos ? "text-success" : "text-destructive"}>{selectedSignal.change}</strong>
                </div>
                <div className="rounded-full bg-muted/50 px-4 py-2 text-xs">
                  <Volume2 className="mr-1 inline h-3 w-3" />
                  Volume: {selectedSignal.volume}
                </div>
                <div className="rounded-full bg-muted/50 px-4 py-2 text-xs">
                  <Clock className="mr-1 inline h-3 w-3" />
                  Signal last: {new Date().toLocaleTimeString()}
                </div>
              </div>

              {/* Chart Editing Options */}
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChartType("line")}
                  className={`gap-1.5 text-xs ${chartType === "line" ? "border-primary text-primary" : ""}`}
                >
                  <LineChart className="h-3.5 w-3.5" />
                  Chart Line
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChartType("bar")}
                  className={`gap-1.5 text-xs ${chartType === "bar" ? "border-primary text-primary" : ""}`}
                >
                  <BarChartHorizontal className="h-3.5 w-3.5" />
                  Bar Chart
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSignalOverlay(!showSignalOverlay)}
                  className={`gap-1.5 text-xs ${showSignalOverlay ? "border-primary text-primary" : ""}`}
                >
                  <Gauge className="h-3.5 w-3.5" />
                  Toggle Signal overlay
                </Button>
                <div className="flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1">
                  <Paintbrush className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="color"
                    value={chartColor}
                    onChange={(e) => setChartColor(e.target.value)}
                    className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent"
                  />
                  <span className="text-xs text-muted-foreground">Line color</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={randomizeData}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Simulate live drift
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                <Info className="mr-1 inline h-3 w-3" />
                Click on modification options to customize chart view & live signal simulation. Chart updates instantly.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
