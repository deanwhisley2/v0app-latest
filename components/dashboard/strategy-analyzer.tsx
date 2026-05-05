"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Search,
  CheckCircle,
  ChevronRight,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Play,
  Pause,
  Bot,
  Hand,
  ArrowRight,
  Loader2,
  Lock,
  Shield,
  Target,
  Eye,
  Settings,
  BarChart3,
  Zap,
  Activity,
} from "lucide-react"
import { tradingStrategies, type Strategy } from "@/lib/trading-strategies"
import type { Coin } from "@/lib/coins-data"
import {
  getLiveRouteLabel,
  getLiveRouteState,
  suggestSimilarCoins,
  type TradableBasesFetchStatus,
} from "@/lib/exchange-coin-support"

interface StrategyAnalyzerProps {
  coins: Coin[]
  userLevel: number
  isFixedTradeUser: boolean
  /** When true, user has a linked exchange — we verify symbols against its public list when provided. */
  exchangeConnected?: boolean
  /** USDT spot bases from GET /api/exchange/tradable-symbols for the selected venue */
  tradableBases?: Set<string> | null
  tradableStatus?: TradableBasesFetchStatus
  onStartAnalysis: (coin: Coin, strategies: string[], expertMode: boolean, analysisSettings: AnalysisSettings) => void
  onClose: () => void
}

interface AnalysisSettings {
  period: "10m" | "15m" | "1h" | "4h" | "12h" | "1d"
  resultTime: "10m" | "15m" | "30m" | "1h" | "12h"
  autoTrade: boolean
  tradeAmount: number
}

const analysisPeriods = [
  { id: "10m" as const, label: "10 Min", description: "Quick scalp analysis" },
  { id: "15m" as const, label: "15 Min", description: "Short-term signals" },
  { id: "1h" as const, label: "1 Hour", description: "Intraday analysis" },
  { id: "4h" as const, label: "4 Hours", description: "Swing analysis" },
  { id: "12h" as const, label: "12 Hours", description: "Position analysis" },
  { id: "1d" as const, label: "1 Day", description: "Daily outlook" },
]

const resultTimes = [
  { id: "10m" as const, label: "10 min" },
  { id: "15m" as const, label: "15 min" },
  { id: "30m" as const, label: "30 min" },
  { id: "1h" as const, label: "1 hour" },
  { id: "12h" as const, label: "12 hours" },
]

export function StrategyAnalyzer({ 
  coins, 
  userLevel, 
  isFixedTradeUser,
  exchangeConnected = false,
  tradableBases = null,
  tradableStatus = "idle",
  onStartAnalysis,
  onClose,
}: StrategyAnalyzerProps) {
  const maxStrategies = tradingStrategies.length
  const showFullStrategyNames = true

  const [step, setStep] = useState<"strategies" | "coin" | "expert">("coin")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(() => {
    const ids = tradingStrategies.map((s) => s.id)
    return ids.slice(0, Math.min(4, ids.length))
  })
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null)
  const [expertMode, setExpertMode] = useState(false)
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>({
    period: "1h",
    resultTime: "15m",
    autoTrade: false,
    tradeAmount: 100,
  })

  const canUseExpertMode = userLevel >= 1 || isFixedTradeUser

  // Filter coins based on search
  const filteredCoins = useMemo(() => {
    if (!searchQuery.trim()) return coins.slice(0, 20)
    const query = searchQuery.toLowerCase()
    return coins.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(query) ||
        coin.name.toLowerCase().includes(query)
    )
  }, [coins, searchQuery])

  const similarCoins = useMemo(
    () => suggestSimilarCoins(coins, searchQuery, 8),
    [coins, searchQuery]
  )

  // Group strategies by category
  const groupedStrategies = useMemo(() => {
    const groups: Record<string, Strategy[]> = {}
    tradingStrategies.forEach((strategy) => {
      if (!groups[strategy.category]) {
        groups[strategy.category] = []
      }
      groups[strategy.category].push(strategy)
    })
    return groups
  }, [])

  const toggleStrategy = (strategyId: string) => {
    setSelectedStrategies((prev) =>
      prev.includes(strategyId)
        ? prev.filter((id) => id !== strategyId)
        : prev.length < maxStrategies
          ? [...prev, strategyId]
          : prev
    )
  }

  const applyNexAutoStrategy = () => {
    const best = [...tradingStrategies].sort(
      (a, b) => (b.backtestResults?.winRate ?? 0) - (a.backtestResults?.winRate ?? 0)
    )[0]
    if (best) setSelectedStrategies([best.id])
  }

  const handleContinueFromStrategies = () => {
    if (!selectedCoin || selectedStrategies.length < 1) return
    if (canUseExpertMode) setStep("expert")
    else onStartAnalysis(selectedCoin, selectedStrategies, false, analysisSettings)
  }

  const handleSelectCoin = (coin: Coin) => {
    setSelectedCoin(coin)
    setStep("strategies")
  }

  const handleStartAnalysis = () => {
    if (selectedCoin) {
      onStartAnalysis(selectedCoin, selectedStrategies, expertMode, analysisSettings)
    }
  }

  const categoryColors: Record<string, string> = {
    smart_money: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    momentum: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    trend: "bg-green-500/20 text-green-400 border-green-500/30",
    reversal: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    volatility: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  }

  const categoryLabels: Record<string, string> = {
    smart_money: "Smart Money",
    momentum: "Momentum",
    trend: "Trend",
    reversal: "Reversal",
    volatility: "Volatility",
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">Strategy Analyzer</h2>
              <p className="text-xs text-muted-foreground">
                {step === "coin" && "Choose or search a market first"}
                {step === "strategies" &&
                  `Pick strategies (${maxStrategies} max for your level) — then continue`}
                {step === "expert" && "Configure Expert Mode settings"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              step === "coin" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">1</span>
            Market
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              step === "strategies" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">2</span>
            Strategies
          </div>
          {canUseExpertMode && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                  step === "expert" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">3</span>
                Expert Mode
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {/* Step 1: Coin (catalog / provider list) */}
          {step === "coin" && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search symbol or name…"
                  className="w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                  autoFocus
                />
              </div>

              {searchQuery.trim() && filteredCoins.length === 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium text-destructive">❌ COIN NOT FOUND</p>
                  <p className="mt-1 text-muted-foreground">Nothing in the catalog matches that query. Try:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {similarCoins.map((c) => (
                      <button
                        key={c.symbol}
                        type="button"
                        onClick={() => {
                          setSearchQuery(c.symbol)
                        }}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-primary"
                      >
                        {c.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                {filteredCoins.map((coin) => {
                  const routeState = getLiveRouteState(
                    Boolean(exchangeConnected),
                    coin.symbol,
                    tradableBases ?? null,
                    tradableStatus
                  )
                  const route = getLiveRouteLabel(routeState)
                  const badgeClass =
                    route.tone === "success"
                      ? "bg-success/15 text-success"
                      : route.tone === "warning"
                        ? "bg-warning/15 text-warning"
                        : route.tone === "muted"
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary"
                  return (
                    <button
                      key={coin.symbol}
                      type="button"
                      onClick={() => handleSelectCoin(coin)}
                      className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-all hover:border-primary hover:bg-primary/5"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-white"
                        style={{ backgroundColor: coin.color }}
                      >
                        {coin.symbol.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{coin.symbol}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                            {route.text}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground truncate">{coin.name}</span>
                          <span className="text-xs text-muted-foreground">${coin.price.toLocaleString()}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className={coin.change24h >= 0 ? "text-success" : "text-destructive"}>
                            {coin.change24h >= 0 ? "+" : ""}
                            {coin.change24h.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 2: Strategies */}
          {step === "strategies" && (
            <div className="space-y-4">
              {selectedCoin && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Selected market</span>
                  <span className="font-semibold">{selectedCoin.symbol}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  onClick={applyNexAutoStrategy}
                >
                  <Zap className="h-4 w-4" />
                  ⚡ Nex Auto-Strategy
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Paid</span>
                </Button>
                <span className="text-xs text-muted-foreground">One-tap pick</span>
              </div>

              {selectedStrategies.length > 0 && (
                <div className="rounded-lg bg-primary/10 p-3">
                  <p className="mb-2 text-xs font-medium text-primary">
                    Selected ({selectedStrategies.length}/{maxStrategies})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedStrategies.map((id) => {
                      const strategy = tradingStrategies.find((s) => s.id === id)
                      return strategy ? (
                        <div
                          key={id}
                          className="flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1 text-xs"
                        >
                          <span>{strategy.shortName}</span>
                          <button
                            type="button"
                            onClick={() => toggleStrategy(id)}
                            className="hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
              )}

              {Object.entries(groupedStrategies).map(([category, strategies]) => (
                <div key={category}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${categoryColors[category]}`}>
                      {categoryLabels[category] || category}
                    </span>
                    <span className="text-xs text-muted-foreground">{strategies.length} strategies</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {strategies.map((strategy) => {
                      const isSelected = selectedStrategies.includes(strategy.id)
                      const isDisabled = !isSelected && selectedStrategies.length >= maxStrategies
                      return (
                        <button
                          key={strategy.id}
                          type="button"
                          onClick={() => !isDisabled && toggleStrategy(strategy.id)}
                          disabled={isDisabled}
                          className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10"
                              : isDisabled
                                ? "cursor-not-allowed border-border bg-muted/30 opacity-50"
                                : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground"
                            }`}
                          >
                            {isSelected && <CheckCircle className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {showFullStrategyNames ? strategy.name : strategy.shortName}
                              </span>
                              {strategy.backtestResults && (
                                <span className="text-xs text-success">{strategy.backtestResults.winRate}%</span>
                              )}
                            </div>
                            {showFullStrategyNames ? (
                              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                {strategy.description}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Expert Mode settings */}
          {step === "expert" && (
            <div className="space-y-6">
              {/* Expert Mode Toggle */}
              <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                      <Bot className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Expert Mode</h3>
                      <p className="text-xs text-muted-foreground">
                        Advanced execution, structured checks, and optional automated orders
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpertMode(!expertMode)}
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      expertMode ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                        expertMode ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                
                {expertMode && (
                  <div className="mt-4 space-y-4 border-t border-border/50 pt-4">
                    {/* Analysis Period */}
                    <div>
                      <label className="mb-2 block text-sm font-medium">Analysis Period (Historical Data)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {analysisPeriods.map((period) => (
                          <button
                            key={period.id}
                            onClick={() => setAnalysisSettings({ ...analysisSettings, period: period.id })}
                            className={`rounded-lg border p-2 text-center transition-all ${
                              analysisSettings.period === period.id
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="font-medium text-sm">{period.label}</div>
                            <div className="text-xs text-muted-foreground">{period.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Result Time */}
                    <div>
                      <label className="mb-2 block text-sm font-medium">Present Results In</label>
                      <div className="flex flex-wrap gap-2">
                        {resultTimes.map((time) => (
                          <button
                            key={time.id}
                            onClick={() => setAnalysisSettings({ ...analysisSettings, resultTime: time.id })}
                            className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                              analysisSettings.resultTime === time.id
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            {time.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Auto Trade Toggle */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Zap className="h-5 w-5 text-warning" />
                          <div>
                            <p className="font-medium text-sm">Auto Trade (Robot Mode)</p>
                            <p className="text-xs text-muted-foreground">Route orders automatically when enabled</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setAnalysisSettings({ ...analysisSettings, autoTrade: !analysisSettings.autoTrade })}
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            analysisSettings.autoTrade ? "bg-warning" : "bg-muted"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                              analysisSettings.autoTrade ? "left-5" : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>

                      {analysisSettings.autoTrade && (
                        <div className="mt-4">
                          <label className="mb-2 block text-xs text-muted-foreground">Trade Amount (USD)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={analysisSettings.tradeAmount}
                              onChange={(e) => setAnalysisSettings({ ...analysisSettings, tradeAmount: Number(e.target.value) })}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                              placeholder="100"
                            />
                            <div className="flex gap-1">
                              {[50, 100, 250, 500].map((amount) => (
                                <button
                                  key={amount}
                                  onClick={() => setAnalysisSettings({ ...analysisSettings, tradeAmount: amount })}
                                  className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80"
                                >
                                  ${amount}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* What Expert Mode Does */}
              <div className="rounded-lg bg-muted/50 p-4">
                <h4 className="mb-3 font-medium text-sm">What Expert Mode Does:</h4>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    Analyzes using all selected strategies simultaneously
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    Checks news and market sentiment in real-time
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    Reviews historical candle patterns and behaviors
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    Presents BUY/SELL signals with confidence percentages
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    Shows analysis overlay on live chart in 4 colors
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    Can suggest better strategies if your selection is suboptimal
                  </li>
                </ul>
              </div>

              {/* Selected Summary */}
              <div className="rounded-lg border border-border p-4">
                <h4 className="mb-3 font-medium text-sm">Analysis Summary</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Coin:</span>
                    <div className="mt-1 flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: selectedCoin?.color }}
                      />
                      <span className="font-medium">{selectedCoin?.symbol}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Strategies:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedStrategies.map((id) => {
                        const strategy = tradingStrategies.find((s) => s.id === id)
                        return (
                          <span key={id} className="rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                            {strategy?.shortName}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mode:</span>
                    <p className="mt-1 font-medium">{expertMode ? "Expert" : "Manual"}</p>
                  </div>
                  {expertMode && (
                    <div>
                      <span className="text-muted-foreground">Auto Trade:</span>
                      <p className="mt-1 font-medium">{analysisSettings.autoTrade ? `Yes ($${analysisSettings.tradeAmount})` : "No"}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <div>
            {step !== "coin" && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (step === "expert") setStep("strategies")
                  else if (step === "strategies") setStep("coin")
                }}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "strategies" && (
              <Button
                onClick={handleContinueFromStrategies}
                disabled={selectedStrategies.length < 1 || !selectedCoin}
                className="gap-2"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {step === "expert" && (
              <Button
                onClick={handleStartAnalysis}
                className="gap-2 bg-gradient-to-r from-primary to-accent"
              >
                <Play className="h-4 w-4" />
                Start Analysis
              </Button>
            )}
          </div>
        </div>

        {/* Expert Mode Lock Notice */}
        {!canUseExpertMode && step === "strategies" && (
          <div className="border-t border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span>Expert Mode is not available for this account tier.</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
