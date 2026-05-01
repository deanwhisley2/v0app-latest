"use client"

import { useState, useEffect, useRef } from "react"

import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Bot,
  Hand,
  Zap,
  Pause,
  Play,
  X,
  Eye,
  Settings,
  Activity,
  Clock,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { tradingStrategies } from "@/lib/trading-strategies"

interface LiveAnalysisOverlayProps {
  coin: { symbol: string; name: string; price: number; color: string }
  strategies: string[]
  expertMode: boolean
  autoTrade: boolean
  tradeAmount: number
  onClose: () => void
  onTrade: (type: "buy" | "sell", amount: number) => void
  onToggleAutoTrade: () => void
}

interface StrategySignal {
  strategyId: string
  signal: "BUY" | "SELL" | "HOLD" | "WAIT"
  confidence: number
  reason: string
  color: string
}

// Strategy colors for chart overlay
const strategyColors = {
  smart_money: "#A855F7", // Purple
  momentum: "#3B82F6", // Blue  
  trend: "#22C55E", // Green
  reversal: "#F97316", // Orange
}

export function LiveAnalysisOverlay({
  coin,
  strategies,
  expertMode,
  autoTrade,
  tradeAmount,
  onClose,
  onTrade,
  onToggleAutoTrade,
}: LiveAnalysisOverlayProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  const [signals, setSignals] = useState<StrategySignal[]>([])
  const [overallSignal, setOverallSignal] = useState<{
    action: "BUY" | "SELL" | "HOLD"
    confidence: number
    reasoning: string
  } | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [assistMode, setAssistMode] = useState(false)
  const [analysisCount, setAnalysisCount] = useState(0)
  const [suggestedStrategy, setSuggestedStrategy] = useState<string | null>(null)
  const [liveUpdate, setLiveUpdate] = useState<string>("")

  // Simulate real-time analysis
  useEffect(() => {
    if (isPaused) return

    const analyzeStrategies = () => {
      const newSignals: StrategySignal[] = strategies.map((strategyId) => {
        const strategy = tradingStrategies.find((s) => s.id === strategyId)
        if (!strategy) return null

        // Simulate analysis results
        const signals: ("BUY" | "SELL" | "HOLD" | "WAIT")[] = ["BUY", "SELL", "HOLD", "WAIT"]
        const randomSignal = signals[Math.floor(Math.random() * signals.length)]
        const confidence = 50 + Math.floor(Math.random() * 45)
        
        const reasons: Record<string, string[]> = {
          BUY: [
            "Bullish divergence detected",
            "Support level holding strong",
            "Volume confirms upward momentum",
            "Pattern completion indicates long entry",
          ],
          SELL: [
            "Bearish divergence detected",
            "Resistance rejection confirmed",
            "Volume declining on rally",
            "Pattern suggests short opportunity",
          ],
          HOLD: [
            "Awaiting confirmation",
            "Mixed signals - patience required",
            "Key level approaching",
          ],
          WAIT: [
            "No clear setup",
            "Consolidation phase",
            "Insufficient data",
          ],
        }

        return {
          strategyId,
          signal: randomSignal,
          confidence,
          reason: reasons[randomSignal][Math.floor(Math.random() * reasons[randomSignal].length)],
          color: strategyColors[strategy.category as keyof typeof strategyColors] || "#666",
        }
      }).filter(Boolean) as StrategySignal[]

      setSignals(newSignals)

      // Calculate overall signal
      const buyCount = newSignals.filter((s) => s.signal === "BUY").length
      const sellCount = newSignals.filter((s) => s.signal === "SELL").length
      const avgConfidence = Math.round(
        newSignals.reduce((acc, s) => acc + s.confidence, 0) / newSignals.length
      )

      let action: "BUY" | "SELL" | "HOLD" = "HOLD"
      let reasoning = ""
      
      if (buyCount > sellCount && buyCount >= 2) {
        action = "BUY"
        reasoning = `${buyCount}/${newSignals.length} strategies indicate bullish opportunity`
      } else if (sellCount > buyCount && sellCount >= 2) {
        action = "SELL"
        reasoning = `${sellCount}/${newSignals.length} strategies indicate bearish setup`
      } else {
        reasoning = "Mixed signals - recommend caution"
      }

      setOverallSignal({
        action,
        confidence: avgConfidence,
        reasoning,
      })

      // Check if AI should suggest a better strategy
      if (expertMode && avgConfidence < 60 && Math.random() > 0.7) {
        const betterStrategies = tradingStrategies.filter(
          (s) => !strategies.includes(s.id) && s.backtestResults && s.backtestResults.winRate > 60
        )
        if (betterStrategies.length > 0) {
          setSuggestedStrategy(betterStrategies[Math.floor(Math.random() * betterStrategies.length)].id)
        }
      }

      setAnalysisCount((c) => c + 1)
      setIsAnalyzing(false)

      // Live update messages
      const updates = [
        "Scanning order flow...",
        "Checking liquidity zones...",
        "Analyzing volume profile...",
        "Detecting smart money activity...",
        "Monitoring market structure...",
        "Evaluating risk/reward...",
      ]
      setLiveUpdate(updates[Math.floor(Math.random() * updates.length)])
    }

    // Initial analysis
    const initialTimeout = setTimeout(() => {
      analyzeStrategies()
    }, 2000)

    // Continuous updates
    const interval = setInterval(() => {
      analyzeStrategies()
    }, 5000)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [strategies, isPaused, expertMode])

  // Track last executed signal to prevent duplicate auto-trades
  const lastExecutedSignalRef = useRef<{ action: string; confidence: number } | null>(null)
  const onTradeRef = useRef(onTrade)
  onTradeRef.current = onTrade

  // Auto trade execution
  useEffect(() => {
    if (!autoTrade || !overallSignal) return
    if (overallSignal.confidence < 70) return
    if (overallSignal.action !== "BUY" && overallSignal.action !== "SELL") return

    // Prevent re-executing the same signal
    const last = lastExecutedSignalRef.current
    if (last && last.action === overallSignal.action && last.confidence === overallSignal.confidence) return

    lastExecutedSignalRef.current = { action: overallSignal.action, confidence: overallSignal.confidence }
    onTradeRef.current(overallSignal.action.toLowerCase() as "buy" | "sell", tradeAmount)
  }, [overallSignal, autoTrade, tradeAmount])



  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case "BUY":
        return <TrendingUp className="h-4 w-4 text-success" />
      case "SELL":
        return <TrendingDown className="h-4 w-4 text-destructive" />
      case "HOLD":
        return <AlertTriangle className="h-4 w-4 text-warning" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Top Analysis Bar */}
      <div className="pointer-events-auto absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-background/95 to-transparent px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${isPaused ? "bg-warning" : "animate-pulse bg-success"}`} />
            <span className="text-xs font-medium">
              {isPaused ? "Paused" : "Live Analysis"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {liveUpdate}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="h-7 w-7 p-0"
          >
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Strategy Signals Panel - Left Side */}
      <div className="pointer-events-auto absolute bottom-4 left-4 w-64 rounded-xl border border-border bg-card/95 backdrop-blur-sm">
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Strategy Signals</span>
            <span className="text-xs text-muted-foreground">#{analysisCount}</span>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto p-2">
          {isAnalyzing ? (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs text-muted-foreground">Analyzing...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {signals.map((signal) => {
                const strategy = tradingStrategies.find((s) => s.id === signal.strategyId)
                return (
                  <div
                    key={signal.strategyId}
                    className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: signal.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">
                          {strategy?.shortName}
                        </span>
                        <div className="flex items-center gap-1">
                          {getSignalIcon(signal.signal)}
                          <span className={`text-xs font-bold ${
                            signal.signal === "BUY" ? "text-success" :
                            signal.signal === "SELL" ? "text-destructive" :
                            "text-muted-foreground"
                          }`}>
                            {signal.confidence}%
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{signal.reason}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Overall Signal & Actions Panel - Right Side */}
      <div className="pointer-events-auto absolute bottom-4 right-4 w-72 rounded-xl border border-border bg-card/95 backdrop-blur-sm">
        {/* Overall Signal */}
        {overallSignal && (
          <div className={`border-b p-4 ${
            overallSignal.action === "BUY" ? "border-success/30 bg-success/10" :
            overallSignal.action === "SELL" ? "border-destructive/30 bg-destructive/10" :
            "border-warning/30 bg-warning/10"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">AI Recommendation</span>
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                overallSignal.action === "BUY" ? "bg-success/20 text-success" :
                overallSignal.action === "SELL" ? "bg-destructive/20 text-destructive" :
                "bg-warning/20 text-warning"
              }`}>
                {overallSignal.action === "BUY" && <TrendingUp className="h-3 w-3" />}
                {overallSignal.action === "SELL" && <TrendingDown className="h-3 w-3" />}
                {overallSignal.action === "HOLD" && <AlertTriangle className="h-3 w-3" />}
                {overallSignal.action}
              </div>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    overallSignal.action === "BUY" ? "bg-success" :
                    overallSignal.action === "SELL" ? "bg-destructive" :
                    "bg-warning"
                  }`}
                  style={{ width: `${overallSignal.confidence}%` }}
                />
              </div>
              <span className="text-sm font-bold">{overallSignal.confidence}%</span>
            </div>
            <p className="text-xs text-muted-foreground">{overallSignal.reasoning}</p>
          </div>
        )}

        {/* Suggested Strategy */}
        {suggestedStrategy && (
          <div className="border-b border-border bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-xs">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-primary font-medium">
                AI suggests adding: {tradingStrategies.find((s) => s.id === suggestedStrategy)?.shortName}
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-3 space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-1 bg-success hover:bg-success/90"
              onClick={() => onTrade("buy", tradeAmount)}
            >
              <TrendingUp className="h-3 w-3" />
              Manual Buy
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1 bg-destructive hover:bg-destructive/90"
              onClick={() => onTrade("sell", tradeAmount)}
            >
              <TrendingDown className="h-3 w-3" />
              Manual Sell
            </Button>
          </div>

          {expertMode && (
            <div className="flex gap-2">
              <Button
                variant={autoTrade ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1"
                onClick={onToggleAutoTrade}
              >
                <Bot className="h-3 w-3" />
                {autoTrade ? "Robot ON" : "Do Robot"}
              </Button>
              <Button
                variant={assistMode ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1"
                onClick={() => setAssistMode(!assistMode)}
              >
                <Hand className="h-3 w-3" />
                {assistMode ? "Assist ON" : "Assist"}
              </Button>
            </div>
          )}

          {/* Trade Amount (for auto trade) */}
          {expertMode && (
            <div className="rounded-lg bg-muted/50 p-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Trade Amount</span>
                <span className="font-mono font-medium">${tradeAmount}</span>
              </div>
              {autoTrade && (
                <div className="flex items-center gap-1 text-xs text-success">
                  <Activity className="h-3 w-3 animate-pulse" />
                  Robot monitoring for {overallSignal?.confidence || 0}%+ confidence signals
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chart Overlay - Strategy Lines (Visual) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {!isAnalyzing && signals.length > 0 && (
          <div className="flex gap-4">
            {signals.map((signal, index) => (
              <div
                key={signal.strategyId}
                className="flex flex-col items-center gap-1"
                style={{
                  transform: `translateY(${(index - 1) * 20}px)`,
                }}
              >
                <div
                  className="h-1 w-16 rounded-full opacity-60"
                  style={{ backgroundColor: signal.color }}
                />
                <span
                  className="text-xs font-bold opacity-80"
                  style={{ color: signal.color }}
                >
                  {tradingStrategies.find((s) => s.id === signal.strategyId)?.shortName}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
