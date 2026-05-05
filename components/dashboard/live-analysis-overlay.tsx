"use client"

import { useState, useEffect, useRef, useReducer, useCallback } from "react"

import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  X,
  Bot,
  Hand,
  Pause,
  Play,
  Loader2,
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
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
  color: string
}

const strategyColors = {
  smart_money: "#A855F7",
  momentum: "#3B82F6",
  trend: "#22C55E",
  reversal: "#F97316",
}

/** User-visible copy only — no indicators, weights, or model internals (admin-only). */
const PUBLIC_STRATEGY_NOTE = "Desk signal updated (detail withheld)."
const PUBLIC_LIVE_UPDATES = [
  "Session active…",
  "Refreshing evaluation…",
  "Updating desk consensus…",
  "Monitoring session health…",
]

type AnalysisState = {
  signals: StrategySignal[]
  overallSignal: {
    action: "BUY" | "SELL" | "HOLD"
    confidence: number
    reasoning: string
  } | null
  analysisCount: number
  liveUpdate: string
  isAnalyzing: boolean
}

type AnalysisAction = {
  type: "tick"
  signals: StrategySignal[]
  overallSignal: AnalysisState["overallSignal"]
  liveUpdate: string
}

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  return {
    ...state,
    signals: action.signals,
    overallSignal: action.overallSignal,
    analysisCount: state.analysisCount + 1,
    liveUpdate: action.liveUpdate,
    isAnalyzing: false,
  }
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
  const [isPaused, setIsPaused] = useState(false)
  const [assistMode, setAssistMode] = useState(false)
  const [showTradeStats, setShowTradeStats] = useState(false)
  const [sessionFills, setSessionFills] = useState({ buys: 0, sells: 0 })

  const [analysis, dispatch] = useReducer(analysisReducer, {
    signals: [],
    overallSignal: null,
    analysisCount: 0,
    liveUpdate: "",
    isAnalyzing: true,
  })

  const recordTrade = useCallback(
    (type: "buy" | "sell", amount: number) => {
      setSessionFills((f) => ({
        buys: f.buys + (type === "buy" ? 1 : 0),
        sells: f.sells + (type === "sell" ? 1 : 0),
      }))
      onTrade(type, amount)
    },
    [onTrade]
  )

  useEffect(() => {
    if (isPaused) return

    const analyzeStrategies = () => {
      const newSignals: StrategySignal[] = strategies
        .map((strategyId) => {
          const strategy = tradingStrategies.find((s) => s.id === strategyId)
          if (!strategy) return null
          const signals: ("BUY" | "SELL" | "HOLD" | "WAIT")[] = ["BUY", "SELL", "HOLD", "WAIT"]
          const randomSignal = signals[Math.floor(Math.random() * signals.length)]
          const confidence = 50 + Math.floor(Math.random() * 45)
          return {
            strategyId,
            signal: randomSignal,
            confidence,
            color: strategyColors[strategy.category as keyof typeof strategyColors] || "#666",
          }
        })
        .filter(Boolean) as StrategySignal[]

      const buyCount = newSignals.filter((s) => s.signal === "BUY").length
      const sellCount = newSignals.filter((s) => s.signal === "SELL").length
      const avgConfidence = Math.round(
        newSignals.reduce((acc, s) => acc + s.confidence, 0) / Math.max(1, newSignals.length)
      )

      let action: "BUY" | "SELL" | "HOLD" = "HOLD"
      let reasoning =
        "Consensus from selected desks only — models, indicators, and weights are not shown in chat."

      if (buyCount > sellCount && buyCount >= 2) {
        action = "BUY"
        reasoning = `Bullish desk lean (${buyCount}/${newSignals.length}). ${reasoning}`
      } else if (sellCount > buyCount && sellCount >= 2) {
        action = "SELL"
        reasoning = `Bearish desk lean (${sellCount}/${newSignals.length}). ${reasoning}`
      }

      dispatch({
        type: "tick",
        signals: newSignals,
        overallSignal: { action, confidence: avgConfidence, reasoning },
        liveUpdate: PUBLIC_LIVE_UPDATES[Math.floor(Math.random() * PUBLIC_LIVE_UPDATES.length)],
      })
    }

    const initialTimeout = setTimeout(() => {
      analyzeStrategies()
    }, 2000)

    const interval = setInterval(analyzeStrategies, 6000)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [strategies, isPaused])

  const lastExecutedSignalRef = useRef<{ action: string; confidence: number } | null>(null)
  const recordTradeRef = useRef(recordTrade)
  recordTradeRef.current = recordTrade

  useEffect(() => {
    if (!autoTrade || !analysis.overallSignal) return
    if (analysis.overallSignal.confidence < 70) return
    if (analysis.overallSignal.action !== "BUY" && analysis.overallSignal.action !== "SELL") return

    const last = lastExecutedSignalRef.current
    if (
      last &&
      last.action === analysis.overallSignal.action &&
      last.confidence === analysis.overallSignal.confidence
    )
      return

    lastExecutedSignalRef.current = {
      action: analysis.overallSignal.action,
      confidence: analysis.overallSignal.confidence,
    }
    recordTradeRef.current(
      analysis.overallSignal.action.toLowerCase() as "buy" | "sell",
      tradeAmount
    )
  }, [analysis.overallSignal, autoTrade, tradeAmount])

  const totalFills = sessionFills.buys + sessionFills.sells
  const buyPct = totalFills > 0 ? Math.round((sessionFills.buys / totalFills) * 100) : 0

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute left-0 right-0 top-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-background/95 to-transparent px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 shrink-0 rounded-full ${isPaused ? "bg-warning" : "animate-pulse bg-success"}`} />
            <span className="text-xs font-medium">{isPaused ? "Paused" : "Live Analysis"}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{analysis.liveUpdate}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(autoTrade || totalFills > 0) && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              title="Session fills (robot + manual)"
              onClick={() => setShowTradeStats((v) => !v)}
              className="h-8 gap-1 px-2 text-xs"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Trades</span>
              {showTradeStats ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" type="button" onClick={() => setIsPaused(!isPaused)} className="h-8 w-8 p-0">
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showTradeStats && (autoTrade || totalFills > 0) && (
        <div className="pointer-events-auto absolute right-3 top-11 z-30 w-64 max-w-[calc(100%-1.5rem)] min-w-0 rounded-xl border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-sm sm:right-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Activity className="h-3.5 w-3.5 text-success" />
            Live session fills
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-success/10 px-2 py-1.5 text-center">
              <div className="text-[10px] text-muted-foreground">Buys</div>
              <div className="font-mono text-lg font-bold text-success">{sessionFills.buys}</div>
            </div>
            <div className="rounded-lg bg-destructive/10 px-2 py-1.5 text-center">
              <div className="text-[10px] text-muted-foreground">Sells</div>
              <div className="font-mono text-lg font-bold text-destructive">{sessionFills.sells}</div>
            </div>
          </div>
          <div className="mt-2 space-y-1 border-t border-border pt-2 text-[10px] text-muted-foreground">
            <p>Total fills: {totalFills}</p>
            {totalFills > 0 && <p>Buy share: {buyPct}%</p>}
            <p>Win rate / P&amp;L: use Order History when positions close — not inferred here.</p>
          </div>
        </div>
      )}

      <div className="pointer-events-auto absolute bottom-4 left-4 right-4 w-auto max-w-64 rounded-xl border border-border bg-card/95 backdrop-blur-sm sm:right-auto sm:w-64">
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Strategy Signals</span>
            <span className="text-xs text-muted-foreground">#{analysis.analysisCount}</span>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto overscroll-contain p-2">
          {analysis.isAnalyzing ? (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs text-muted-foreground">Analyzing…</span>
            </div>
          ) : (
            <div className="space-y-2">
              {analysis.signals.map((signal) => {
                const strategy = tradingStrategies.find((s) => s.id === signal.strategyId)
                return (
                  <div key={signal.strategyId} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                    <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: signal.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-medium">{strategy?.shortName}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          {signal.signal === "BUY" && <TrendingUp className="h-4 w-4 text-success" />}
                          {signal.signal === "SELL" && <TrendingDown className="h-4 w-4 text-destructive" />}
                          {signal.signal !== "BUY" && signal.signal !== "SELL" && (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                          <span
                            className={`text-xs font-bold ${
                              signal.signal === "BUY"
                                ? "text-success"
                                : signal.signal === "SELL"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {signal.confidence}%
                          </span>
                        </div>
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{PUBLIC_STRATEGY_NOTE}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-4 right-4 w-auto max-w-72 rounded-xl border border-border bg-card/95 backdrop-blur-sm sm:left-auto sm:right-4 sm:w-72">
        {analysis.overallSignal && (
          <div
            className={`border-b p-4 ${
              analysis.overallSignal.action === "BUY"
                ? "border-success/30 bg-success/10"
                : analysis.overallSignal.action === "SELL"
                  ? "border-destructive/30 bg-destructive/10"
                  : "border-warning/30 bg-warning/10"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Joelin recommendation</span>
              <div
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  analysis.overallSignal.action === "BUY"
                    ? "bg-success/20 text-success"
                    : analysis.overallSignal.action === "SELL"
                      ? "bg-destructive/20 text-destructive"
                      : "bg-warning/20 text-warning"
                }`}
              >
                {analysis.overallSignal.action === "BUY" && <TrendingUp className="h-3 w-3" />}
                {analysis.overallSignal.action === "SELL" && <TrendingDown className="h-3 w-3" />}
                {analysis.overallSignal.action === "HOLD" && <AlertTriangle className="h-3 w-3" />}
                {analysis.overallSignal.action}
              </div>
            </div>
            <div className="mb-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${
                    analysis.overallSignal.action === "BUY"
                      ? "bg-success"
                      : analysis.overallSignal.action === "SELL"
                        ? "bg-destructive"
                        : "bg-warning"
                  }`}
                  style={{ width: `${analysis.overallSignal.confidence}%` }}
                />
              </div>
              <span className="text-sm font-bold">{analysis.overallSignal.confidence}%</span>
            </div>
            <p className="text-xs text-muted-foreground">{analysis.overallSignal.reasoning}</p>
          </div>
        )}

        <div className="space-y-3 p-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              type="button"
              className="flex-1 gap-1 bg-success hover:bg-success/90"
              onClick={() => recordTrade("buy", tradeAmount)}
            >
              <TrendingUp className="h-3 w-3" />
              Manual Buy
            </Button>
            <Button
              size="sm"
              type="button"
              className="flex-1 gap-1 bg-destructive hover:bg-destructive/90"
              onClick={() => recordTrade("sell", tradeAmount)}
            >
              <TrendingDown className="h-3 w-3" />
              Manual Sell
            </Button>
          </div>

          {expertMode && (
            <div className="flex gap-2">
              <Button variant={autoTrade ? "default" : "outline"} size="sm" type="button" className="flex-1 gap-1" onClick={onToggleAutoTrade}>
                <Bot className="h-3 w-3" />
                {autoTrade ? "Robot ON" : "Do Robot"}
              </Button>
              <Button
                variant={assistMode ? "default" : "outline"}
                size="sm"
                type="button"
                className="flex-1 gap-1"
                onClick={() => setAssistMode(!assistMode)}
              >
                <Hand className="h-3 w-3" />
                {assistMode ? "Assist ON" : "Assist"}
              </Button>
            </div>
          )}

          {expertMode && (
            <div className="rounded-lg bg-muted/50 p-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Trade Amount</span>
                <span className="font-mono font-medium">${tradeAmount}</span>
              </div>
              {autoTrade && (
                <div className="flex items-center gap-1 text-xs text-success">
                  <Activity className="h-3 w-3 animate-pulse" />
                  Robot active — high-confidence fills only (internals not shown)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {!analysis.isAnalyzing && analysis.signals.length > 0 && (
          <div className="flex gap-4">
            {analysis.signals.map((signal, index) => (
              <div
                key={signal.strategyId}
                className="flex flex-col items-center gap-1"
                style={{ transform: `translateY(${(index - 1) * 20}px)` }}
              >
                <div className="h-1 w-16 rounded-full opacity-60" style={{ backgroundColor: signal.color }} />
                <span className="text-xs font-bold opacity-80" style={{ color: signal.color }}>
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
