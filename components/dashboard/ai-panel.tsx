"use client"

import { useState, useMemo, useRef, useEffect } from "react"
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
} from "lucide-react"
import type { Coin } from "@/lib/coins-data"
import { tradingStrategies, analyzeWithAllStrategies, type Strategy, type TradeAnalysis } from "@/lib/trading-strategies"
import { ContainerMode, type UserLevel } from "./container-mode"
import { StrategyAnalyzer } from "./strategy-analyzer"

interface AIPanelProps {
  coins: Coin[]
  selectedCoin: Coin
  onNavigateToTrade?: (coin: Coin, strategies: string[], expertMode: boolean, settings: AnalysisSettings) => void
  userLevel?: UserLevel
}

interface AnalysisSettings {
  period: "10m" | "15m" | "1h" | "4h" | "12h" | "1d"
  resultTime: "10m" | "15m" | "30m" | "1h" | "12h"
  autoTrade: boolean
  tradeAmount: number
}

type AIMode = "strategy" | "compare" | "assistant" | "auto" | "container"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export function AIPanel({ coins, selectedCoin, onNavigateToTrade, userLevel = 1 }: AIPanelProps) {
  const [activeMode, setActiveMode] = useState<AIMode>("strategy")
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(["fvg", "rsi_divergence", "bos", "liquidity_sweep"])
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<TradeAnalysis | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [autoTradeActive, setAutoTradeActive] = useState(false)
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null)
  const [showStrategyAnalyzer, setShowStrategyAnalyzer] = useState(false)
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

  // Generate mock historical data for analysis
  const historicalData = useMemo(() => {
    const data = []
    let price = selectedCoin.price
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
  }, [selectedCoin.price])

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    
    const result = analyzeWithAllStrategies(
      { symbol: selectedCoin.symbol, price: selectedCoin.price, change24h: selectedCoin.change24h },
      historicalData
    )
    
    setAnalysisResult(result)
    setIsAnalyzing(false)
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return

    const userMessage: ChatMessage = { role: "user", content: chatInput }
    setChatMessages((prev) => [...prev, userMessage])
    setChatInput("")

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1000))
    
    let response = ""
    const lowerInput = chatInput.toLowerCase()
    
    if (lowerInput.includes("analyze") || lowerInput.includes("all strategies")) {
      response = `Running multi-strategy analysis on ${selectedCoin.symbol}...\n\n`
      response += `Active Strategies: ${tradingStrategies.filter(s => s.isActive).length}\n`
      response += `Timeframe: ${selectedTimeframe}\n\n`
      response += `Quick verdict: ${selectedCoin.change24h > 0 ? "Bullish bias" : "Bearish bias"} with ${Math.round(Math.random() * 30 + 55)}% consensus.\n\n`
      response += `Click "Run Analysis" for detailed breakdown.`
    } else if (lowerInput.includes("best setup") || lowerInput.includes("which coin")) {
      const bestCoin = coins.reduce((best, coin) => coin.change24h > best.change24h ? coin : best)
      response = `Based on current multi-strategy analysis:\n\n`
      response += `Best Setup: ${bestCoin.symbol} (+${bestCoin.change24h.toFixed(2)}%)\n`
      response += `- Strong momentum across timeframes\n`
      response += `- Multiple strategies aligned\n`
      response += `- Good risk/reward ratio available`
    } else if (lowerInput.includes("risk")) {
      response = `Current Risk Assessment:\n\n`
      response += `- Max Risk Per Trade: ${riskSettings.maxRiskPerTrade}%\n`
      response += `- Max Open Trades: ${riskSettings.maxOpenTrades}\n`
      response += `- Daily Loss Limit: ${riskSettings.dailyLossLimit}%\n`
      response += `- Consensus Required: ${riskSettings.requireConsensus}%\n\n`
      response += `Portfolio is within acceptable risk parameters.`
    } else if (lowerInput.includes("explain") || lowerInput.includes("signal")) {
      response = `Current Signal Explanation for ${selectedCoin.symbol}:\n\n`
      response += `The AI is analyzing ${tradingStrategies.filter(s => s.isActive).length} active strategies.\n\n`
      response += `Key factors being evaluated:\n`
      response += `- Fair Value Gaps & Order Blocks\n`
      response += `- RSI Divergences\n`
      response += `- Break of Structure patterns\n`
      response += `- Liquidity sweeps\n`
      response += `- EMA crossovers\n`
      response += `- VWAP reactions\n\n`
      response += `Each strategy votes BUY, SELL, or HOLD. The consensus determines the final signal.`
    } else {
      response = `I understand you're asking about "${chatInput}". Let me help:\n\n`
      response += `I can analyze ${selectedCoin.symbol} using ${tradingStrategies.length} trading strategies, compare indicators, and provide entry/exit recommendations.\n\n`
      response += `Try asking:\n- "Analyze all strategies"\n- "Which coin has best setup?"\n- "Show risk assessment"`
    }
    
    const assistantMessage: ChatMessage = { role: "assistant", content: response }
    setChatMessages((prev) => [...prev, assistantMessage])
  }

  const toggleStrategy = (strategyId: string) => {
    setSelectedStrategies(prev => 
      prev.includes(strategyId) 
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    )
  }

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
          Assistant
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
          {/* Analyze Coin Button */}
          <button
            onClick={() => setShowStrategyAnalyzer(true)}
            className="group flex w-full items-center justify-between rounded-xl border-2 border-dashed border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 p-4 transition-all hover:border-primary hover:from-primary/10 hover:to-accent/10"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-colors">
                <Search className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-primary">Analyze a Coin</p>
                <p className="text-xs text-muted-foreground">Select strategies and coin to start live analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Target className="h-3 w-3" />
              Start
            </div>
          </button>

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Active Strategies ({selectedStrategies.length}/{tradingStrategies.length})</h3>
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
                        <span className="font-medium">{strategy.name}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {strategy.shortName}
                        </span>
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
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {strategy.description}
                      </p>
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
                Analyzing {selectedCoin.symbol}...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                Run Analysis ({selectedStrategies.length} strategies)
              </>
            )}
          </Button>
        </div>
      )}

      {/* Compare Mode - Side by side strategy comparison */}
      {activeMode === "compare" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Strategy Comparison for {selectedCoin.symbol}</h3>
            <Button onClick={handleAnalyze} size="sm" disabled={isAnalyzing}>
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            </Button>
          </div>

          {analysisResult ? (
            <div className="space-y-4">
              {/* Consensus Summary */}
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
                      analysisResult.consensus.includes("BUY") ? "bg-success" : 
                      analysisResult.consensus.includes("SELL") ? "bg-destructive" : "bg-muted-foreground"
                    }`}
                    style={{ width: `${analysisResult.overallConfidence}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{analysisResult.recommendation}</p>
              </div>

              {/* Individual Strategy Signals */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Individual Strategy Signals:</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {analysisResult.signals.map((signal, i) => (
                    <div 
                      key={i}
                      className={`rounded-lg border p-3 ${
                        signal.signal === "BUY" ? "border-success/30 bg-success/5" :
                        signal.signal === "SELL" ? "border-destructive/30 bg-destructive/5" :
                        "border-border bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{signal.strategy}</span>
                        <span className={`flex items-center gap-1 text-sm font-bold ${
                          signal.signal === "BUY" ? "text-success" :
                          signal.signal === "SELL" ? "text-destructive" :
                          "text-muted-foreground"
                        }`}>
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
                            signal.signal === "BUY" ? "bg-success" :
                            signal.signal === "SELL" ? "bg-destructive" :
                            "bg-muted-foreground"
                          }`}
                          style={{ width: `${signal.confidence}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Trade Levels */}
              <div className="rounded-lg border border-border p-4">
                <h4 className="mb-3 font-medium">Suggested Trade Levels</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Entry</p>
                    <p className="font-mono text-sm font-medium">${formatPrice(analysisResult.suggestedEntry)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-destructive">Stop Loss</p>
                    <p className="font-mono text-sm font-medium text-destructive">${formatPrice(analysisResult.suggestedSL)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-success">Take Profit</p>
                    <p className="font-mono text-sm font-medium text-success">${formatPrice(analysisResult.suggestedTP)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Historical Accuracy</span>
                  <span className="font-medium">{analysisResult.historicalAccuracy}%</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Risk Level</span>
                  <span className={`font-medium ${
                    analysisResult.riskLevel === "LOW" ? "text-success" :
                    analysisResult.riskLevel === "MEDIUM" ? "text-warning" :
                    "text-destructive"
                  }`}>
                    {analysisResult.riskLevel}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BarChart3 className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Click the analysis button to compare all strategies</p>
              <Button onClick={handleAnalyze} className="mt-4 gap-2" disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4" />
                    Run Multi-Strategy Analysis
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Assistant Mode - Live Signal Hub + Chat */}
      {activeMode === "assistant" && (
        <div className="space-y-4">
          {/* Live Signal Hub */}
          <LiveSignalHub coins={coins} selectedCoin={selectedCoin} />

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">AI Assistant Chat</span>
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
                    
                    setTimeout(async () => {
                      let response = ""
                      const lowerInput = prompt.toLowerCase()
                      
                      if (lowerInput.includes("analyze") || lowerInput.includes("all strategies")) {
                        response = `Running multi-strategy analysis on ${selectedCoin.symbol}...\n\n`
                        response += `Active Strategies: ${tradingStrategies.filter(s => s.isActive).length}\n`
                        response += `Timeframe: ${selectedTimeframe}\n\n`
                        response += `Quick verdict: ${selectedCoin.change24h > 0 ? "Bullish bias" : "Bearish bias"} with ${Math.round(Math.random() * 30 + 55)}% consensus.\n\n`
                        response += `Click "Run Analysis" for detailed breakdown.`
                      } else if (lowerInput.includes("best setup") || lowerInput.includes("which coin")) {
                        const bestCoin = coins.reduce((best, coin) => coin.change24h > best.change24h ? coin : best)
                        response = `Based on current multi-strategy analysis:\n\n`
                        response += `Best Setup: ${bestCoin.symbol} (+${bestCoin.change24h.toFixed(2)}%)\n`
                        response += `- Strong momentum across timeframes\n`
                        response += `- Multiple strategies aligned\n`
                        response += `- Good risk/reward ratio available`
                      } else if (lowerInput.includes("risk")) {
                        response = `Current Risk Assessment:\n\n`
                        response += `- Max Risk Per Trade: ${riskSettings.maxRiskPerTrade}%\n`
                        response += `- Max Open Trades: ${riskSettings.maxOpenTrades}\n`
                        response += `- Daily Loss Limit: ${riskSettings.dailyLossLimit}%\n`
                        response += `- Consensus Required: ${riskSettings.requireConsensus}%\n\n`
                        response += `Portfolio is within acceptable risk parameters.`
                      } else if (lowerInput.includes("explain") || lowerInput.includes("signal")) {
                        response = `Current Signal Explanation for ${selectedCoin.symbol}:\n\n`
                        response += `The AI is analyzing ${tradingStrategies.filter(s => s.isActive).length} active strategies.\n\n`
                        response += `Key factors being evaluated:\n`
                        response += `- Fair Value Gaps & Order Blocks\n`
                        response += `- RSI Divergences\n`
                        response += `- Break of Structure patterns\n`
                        response += `- Liquidity sweeps\n`
                        response += `- EMA crossovers\n`
                        response += `- VWAP reactions\n\n`
                        response += `Each strategy votes BUY, SELL, or HOLD. The consensus determines the final signal.`
                      } else {
                        response = `I understand you're asking about "${prompt}". Let me help:\n\n`
                        response += `I can analyze ${selectedCoin.symbol} using ${tradingStrategies.length} trading strategies, compare indicators, and provide entry/exit recommendations.\n\n`
                        response += `Try asking:\n- "Analyze all strategies"\n- "Which coin has best setup?"\n- "Show risk assessment"`
                      }
                      
                      const assistantMessage: ChatMessage = { role: "assistant", content: response }
                      setChatMessages((prev) => [...prev, assistantMessage])
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
                  <p className="text-sm text-muted-foreground">Ask me about trading strategies, market analysis, or risk management</p>
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
                placeholder="Ask about strategies, signals, or analysis..."
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
          onStartAnalysis={(coin, strategies, expertMode, settings) => {
            setShowStrategyAnalyzer(false)
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
