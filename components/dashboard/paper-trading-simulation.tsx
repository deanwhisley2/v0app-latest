"use client"

/**
 * Paper Trading Simulation - End-to-End Live Demo
 * Executes: Market Analysis → Joelin signal → Trade execution → monitoring → closure → reporting
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Brain, TrendingUp, TrendingDown, Target, Shield, Zap,
  DollarSign, Activity, Clock, CheckCircle2, AlertCircle,
  Loader2, Sparkles, BarChart3, LineChart, Play, Pause,
  ChevronRight, ChevronDown, X, Timer, ArrowUpRight, ArrowDownRight,
  Volume2, VolumeX, MessageSquare, Eye, RefreshCw, Trophy, Bell,

} from "lucide-react"
import { paperTradingEngine, type PaperPosition, type PaperOrder } from "@/lib/paper-trading"
import { tradingStrategies, analyzeWithAllStrategies } from "@/lib/trading-strategies"
import { coinsData } from "@/lib/coins-data"

// ============================================================
// Types
// ============================================================

type SimulationPhase = "idle" | "analysis" | "signal" | "executing" | "monitoring" | "closing" | "complete"

interface StrategySignal {
  name: string
  signal: "BUY" | "SELL" | "HOLD"
  confidence: number
  reason: string
}

interface AITradeRecommendation {
  entryPrice: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  takeProfit3: number
  riskLevel: "Low" | "Medium" | "High"
  reasoning: string
  confidence: number
}

interface PricePhase {
  label: string
  changePercent: number
  durationMs: number
  alert?: string
}

interface SimulationState {
  phase: SimulationPhase
  btcPrice: number
  signals: StrategySignal[]
  consensus: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL"
  overallConfidence: number
  recommendation: AITradeRecommendation | null
  order: PaperOrder | null
  position: PaperPosition | null
  currentPhase: number
  phaseStartTime: number
  alerts: Array<{ time: number; message: string; type: "info" | "success" | "warning" | "error" }>
  elapsed: number
  tradeResult: {
    entryPrice: number
    exitPrice: number
    pnl: number
    pnlPercent: number
    winRateImpact: number
    strategyAccuracy: string
  } | null
  soundEnabled: boolean
}

// ============================================================
// Price Simulation Phases
// ============================================================

const PRICE_PHASES: PricePhase[] = [
  { label: "Entry", changePercent: 0, durationMs: 2000, alert: "Position opened at $65,000 🚀" },
  { label: "Phase 1: Price Drop", changePercent: -1, durationMs: 8000, alert: "⚠️ Price dropping -1% — Stop loss at $63,700 approaching!" },
  { label: "Phase 2: Recovery", changePercent: 0, durationMs: 6000, alert: "📈 Price recovering back to entry level — Holding strong!" },
  { label: "Phase 3: TP1 Hit!", changePercent: 3, durationMs: 10000, alert: "🎯 Take Profit 1 hit! +3% = +$150 profit!" },
]

const BASE_PRICE = 65000
const TRADE_AMOUNT = 5000

// ============================================================
// Sound Effects using Web Audio API
// ============================================================

function playBeep(frequency: number = 800, duration: number = 150) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = frequency
    osc.type = "sine"
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration / 1000)
  } catch {
    // Audio not available
  }
}

function playSuccessSound() {
  playBeep(1200, 200)
  setTimeout(() => playBeep(1500, 300), 200)
}

function playAlertSound() {
  playBeep(600, 300)
  setTimeout(() => playBeep(400, 300), 300)
}

function playTradeSound() {
  playBeep(1000, 100)
  setTimeout(() => playBeep(1200, 100), 100)
  setTimeout(() => playBeep(1400, 200), 200)
}

// ============================================================
// Main Simulation Component
// ============================================================

export function PaperTradingSimulation() {
  const [state, setState] = useState<SimulationState>({
    phase: "idle",
    btcPrice: BASE_PRICE,
    signals: [],
    consensus: "NEUTRAL",
    overallConfidence: 0,
    recommendation: null,
    order: null,
    position: null,
    currentPhase: 0,
    phaseStartTime: 0,
    alerts: [],
    elapsed: 0,
    tradeResult: null,
    soundEnabled: true,
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const phaseIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const currentPriceRef = useRef<number>(BASE_PRICE)

  // ============================================================
  // STEP 1: Market Analysis
  // ============================================================

  const runMarketAnalysis = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: "analysis",
      alerts: [{ time: Date.now(), message: "🔍 Running market analysis on BTC/USDT...", type: "info" }],
      tradeResult: null,
      position: null,
      order: null,
      btcPrice: BASE_PRICE,
      currentPhase: 0,
      elapsed: 0,
    }))

    if (state.soundEnabled) playBeep(500, 100)

    // Simulate analysis delay
    setTimeout(() => {
      // Generate signals from all 3 strategies
      const signals: StrategySignal[] = [
        {
          name: "Smart Money Flow",
          signal: "BUY",
          confidence: 78,
          reason: "Institutional accumulation detected via shadow book. Cumulative delta diverging positively with price consolidation above VWAP.",
        },
        {
          name: "Momentum Breakout",
          signal: "BUY",
          confidence: 72,
          reason: "Price breaking above $64,800 resistance with 2.1x volume surge. RSI at 58 and rising. MACD histogram expanding.",
        },
        {
          name: "Volatility Compression",
          signal: "BUY",
          confidence: 81,
          reason: "Bollinger Band width at 3-month low. Volume declining for 5 periods. Kalman volatility estimate below threshold — explosive move expected.",
        },
      ]

      // Calculate consensus
      const buySignals = signals.filter(s => s.signal === "BUY").length
      const totalSignals = signals.length
      const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / totalSignals
      const consensus = buySignals === totalSignals ? "STRONG_BUY" as const : 
                        buySignals >= totalSignals / 2 ? "BUY" as const : "NEUTRAL" as const

      // Generate Joelin-style recommendation
      const entryPrice = BASE_PRICE
      const recommendation: AITradeRecommendation = {
        entryPrice,
        stopLoss: entryPrice * 0.98, // -2%
        takeProfit1: entryPrice * 1.03, // +3%
        takeProfit2: entryPrice * 1.05, // +5%
        takeProfit3: entryPrice * 1.08, // +8%
        riskLevel: "Medium",
        reasoning: `All 3 strategies align on BUY with ${avgConfidence.toFixed(0)}% average confidence. Smart Money Flow shows institutional accumulation, Momentum Breakout confirms with volume, and Volatility Compression predicts an explosive move. Entry at $${entryPrice.toLocaleString()} with tight -2% stop loss.`,
        confidence: avgConfidence,
      }

      if (state.soundEnabled) playSuccessSound()

      setState(prev => ({
        ...prev,
        phase: "signal",
        signals,
        consensus,
        overallConfidence: avgConfidence,
        recommendation,
        alerts: [
          ...prev.alerts,
          { time: Date.now(), message: `✅ Analysis complete! Consensus: ${consensus} (${avgConfidence.toFixed(0)}% confidence)`, type: "success" },
          { time: Date.now(), message: `📊 Entry: $${entryPrice.toLocaleString()} | SL: $${(entryPrice * 0.98).toLocaleString()} | TP1: $${(entryPrice * 1.03).toLocaleString()}`, type: "info" },
        ],
      }))
    }, 2500)
  }, [state.soundEnabled])

  // ============================================================
  // STEP 3: Execute Paper Trade
  // ============================================================

  const executeTrade = useCallback(() => {
    if (!state.recommendation) return

    setState(prev => ({
      ...prev,
      phase: "executing",
      alerts: [...prev.alerts, { time: Date.now(), message: "💼 Executing LONG position of $5,000 at market price...", type: "info" }],
    }))

    if (state.soundEnabled) playTradeSound()

    setTimeout(() => {
      try {
        const quantity = TRADE_AMOUNT / BASE_PRICE
        const order = paperTradingEngine.placeOrder({
          symbol: "BTC",
          side: "buy",
          type: "market",
          quantity,
          leverage: 1,
        })

        const portfolio = paperTradingEngine.getPortfolio()
        const position = portfolio.positions.find(p => p.symbol === "BTC") || null

        if (state.soundEnabled) playSuccessSound()

        setState(prev => ({
          ...prev,
          phase: "monitoring",
          order,
          position,
          currentPhase: 0,
          phaseStartTime: Date.now(),
          alerts: [
            ...prev.alerts,
            { time: Date.now(), message: `✅ Order filled! ${order.filledQuantity.toFixed(6)} BTC @ $${order.avgFillPrice.toLocaleString()}`, type: "success" },
            { time: Date.now(), message: `💰 Position: LONG ${(order.filledQuantity).toFixed(6)} BTC | Entry: $${order.avgFillPrice.toLocaleString()}`, type: "success" },
            { time: Date.now(), message: "📊 Monitoring price movement in real-time...", type: "info" },
          ],
        }))

        startTimeRef.current = Date.now()
        currentPriceRef.current = BASE_PRICE
      } catch (err) {
        setState(prev => ({
          ...prev,
          phase: "signal",
          alerts: [...prev.alerts, { time: Date.now(), message: `❌ Trade failed: ${err}`, type: "error" }],
        }))
      }
    }, 2000)
  }, [state.recommendation, state.soundEnabled])

  // ============================================================
  // STEP 4: Live Position Monitoring
  // ============================================================

  useEffect(() => {
    if (state.phase !== "monitoring") return

    const phase = PRICE_PHASES[state.currentPhase]
    if (!phase) return

    const startPrice = state.currentPhase === 0 ? BASE_PRICE : currentPriceRef.current
    const targetPrice = BASE_PRICE * (1 + phase.changePercent / 100)
    const steps = 20
    let step = 0

    phaseIntervalRef.current = setInterval(() => {
      step++
      const progress = step / steps
      const currentPrice = startPrice + (targetPrice - startPrice) * progress
      currentPriceRef.current = currentPrice

      // Update position P&L
      paperTradingEngine.updatePositions({ BTC: currentPrice })

      const portfolio = paperTradingEngine.getPortfolio()
      const position = portfolio.positions.find(p => p.symbol === "BTC") || null

      const elapsed = Date.now() - startTimeRef.current
      const pnlPercent = ((currentPrice - BASE_PRICE) / BASE_PRICE) * 100
      const pnl = (pnlPercent / 100) * TRADE_AMOUNT

      setState(prev => ({
        ...prev,
        btcPrice: currentPrice,
        position: position ? { ...position, currentPrice, pnl, pnlPercentage: pnlPercent } : null,
        elapsed,
      }))

      if (step >= steps) {
        if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current)

        // Show phase alert
        if (phase.alert) {
          if (state.soundEnabled) {
            if (phase.changePercent >= 3) playSuccessSound()
            else if (phase.changePercent < 0) playAlertSound()
            else playBeep(700, 150)
          }

          setState(prev => ({
            ...prev,
            alerts: [...prev.alerts, { time: Date.now(), message: phase.alert!, type: phase.changePercent >= 3 ? "success" : phase.changePercent < 0 ? "warning" : "info" }],
          }))
        }

        // Move to next phase or complete
        const nextPhase = state.currentPhase + 1
        if (nextPhase >= PRICE_PHASES.length) {
          // STEP 5: Close position at TP1
          setTimeout(() => closePosition(), 1500)
        } else {
          setTimeout(() => {
            setState(prev => ({
              ...prev,
              currentPhase: nextPhase,
              phaseStartTime: Date.now(),
            }))
          }, 1000)
        }
      }
    }, phase.durationMs / steps)

    return () => {
      if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current)
    }
  }, [state.phase, state.currentPhase, state.soundEnabled])

  // ============================================================
  // STEP 5: Close Position
  // ============================================================

  const closePosition = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: "closing",
      alerts: [...prev.alerts, { time: Date.now(), message: "🔒 Closing position at TP1...", type: "info" }],
    }))

    if (state.soundEnabled) playTradeSound()

    setTimeout(() => {
      try {
        const exitPrice = BASE_PRICE * 1.03 // TP1 at +3%
        currentPriceRef.current = exitPrice
        paperTradingEngine.updatePositions({ BTC: exitPrice })
        const closeOrder = paperTradingEngine.closePosition("BTC")

        const portfolio = paperTradingEngine.getPortfolio()
        const pnl = TRADE_AMOUNT * 0.03 // +3% = $150
        const pnlPercent = 3

        const tradeResult = {
          entryPrice: BASE_PRICE,
          exitPrice,
          pnl,
          pnlPercent,
          winRateImpact: portfolio.winRate,
          strategyAccuracy: "✅ All 3 strategies were correct — BUY signal validated!",
        }

        if (state.soundEnabled) playSuccessSound()

        setState(prev => ({
          ...prev,
          phase: "complete",
          btcPrice: exitPrice,
          position: null,
          tradeResult,
          alerts: [
            ...prev.alerts,
            { time: Date.now(), message: `🎯 Position closed at TP1! Exit: $${exitPrice.toLocaleString()}`, type: "success" },
            { time: Date.now(), message: `💰 Final P&L: +$${pnl.toFixed(2)} (+${pnlPercent}%)`, type: "success" },
            { time: Date.now(), message: "📈 Trade added to history. Performance dashboard updated.", type: "info" },
          ],
        }))
      } catch (err) {
        setState(prev => ({
          ...prev,
          phase: "monitoring",
          alerts: [...prev.alerts, { time: Date.now(), message: `❌ Close failed: ${err}`, type: "error" }],
        }))
      }
    }, 2000)
  }, [state.soundEnabled])

  // ============================================================
  // Reset
  // ============================================================

  const resetSimulation = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current)
    paperTradingEngine.resetPortfolio()
    currentPriceRef.current = BASE_PRICE

    setState({
      phase: "idle",
      btcPrice: BASE_PRICE,
      signals: [],
      consensus: "NEUTRAL",
      overallConfidence: 0,
      recommendation: null,
      order: null,
      position: null,
      currentPhase: 0,
      phaseStartTime: 0,
      alerts: [],
      elapsed: 0,
      tradeResult: null,
      soundEnabled: true,
    })
  }, [])

  // ============================================================
  // Toggle Sound
  // ============================================================

  const toggleSound = useCallback(() => {
    setState(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }))
  }, [])

  // ============================================================
  // Formatting Helpers
  // ============================================================

  const formatPrice = (price: number) => `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatPnl = (pnl: number) => `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`
  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "BUY": return "text-success"
      case "SELL": return "text-destructive"
      default: return "text-muted-foreground"
    }
  }

  const getSignalBg = (signal: string) => {
    switch (signal) {
      case "BUY": return "bg-success/10 border-success/30"
      case "SELL": return "bg-destructive/10 border-destructive/30"
      default: return "bg-muted/30 border-border"
    }
  }

  const getConsensusColor = (consensus: string) => {
    switch (consensus) {
      case "STRONG_BUY": return "text-success"
      case "BUY": return "text-success/80"
      case "STRONG_SELL": return "text-destructive"
      case "SELL": return "text-destructive/80"
      default: return "text-muted-foreground"
    }
  }

  const getConsensusBg = (consensus: string) => {
    switch (consensus) {
      case "STRONG_BUY": return "bg-success/20"
      case "BUY": return "bg-success/10"
      case "STRONG_SELL": return "bg-destructive/20"
      case "SELL": return "bg-destructive/10"
      default: return "bg-muted"
    }
  }

  // ============================================================
  // Render
  // ============================================================

  const isRunning = state.phase !== "idle" && state.phase !== "complete"

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-border bg-gradient-to-r from-primary/10 via-accent/5 to-success/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold">Paper Trading Simulation</h3>
              <p className="text-xs text-muted-foreground">End-to-end live demo — $0 real money at risk</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
              title={state.soundEnabled ? "Mute sounds" : "Enable sounds"}
            >
              {state.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {isRunning && (
              <div className="flex items-center gap-2 rounded-full bg-success/20 px-3 py-1">
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-success" />
                <span className="text-xs font-medium text-success">LIVE</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Main Simulation Area */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left Column: Analysis & Signals */}
        <div className="space-y-4 lg:col-span-2">
          {/* BTC Price Banner */}
          <Card className={`border-border p-4 transition-colors ${
            state.position ? (state.position.pnl >= 0 ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5") : ""
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/20">
                  <TrendingUp className="h-6 w-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BTC/USDT</p>
                  <p className="font-mono text-2xl font-bold">{formatPrice(state.btcPrice)}</p>
                </div>
              </div>
              <div className="text-right">
                {state.position && (
                  <>
                    <p className={`font-mono text-lg font-bold ${state.position.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatPnl(state.position.pnl)}
                    </p>
                    <p className={`text-sm font-medium ${state.position.pnlPercentage >= 0 ? "text-success" : "text-destructive"}`}>
                      {state.position.pnlPercentage >= 0 ? "+" : ""}{state.position.pnlPercentage.toFixed(2)}%
                    </p>
                  </>
                )}
                {state.phase === "monitoring" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Elapsed: {formatTime(state.elapsed)}
                  </p>
                )}
              </div>
            </div>

            {/* Price Animation Bar */}
            {state.phase === "monitoring" && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>${(BASE_PRICE * 0.97).toLocaleString()}</span>
                  <span className="font-medium text-foreground">Price Movement</span>
                  <span>${(BASE_PRICE * 1.05).toLocaleString()}</span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                      state.position && state.position.pnl >= 0 ? "bg-success" : "bg-destructive"
                    }`}
                    style={{
                      width: `${((state.btcPrice - BASE_PRICE * 0.97) / (BASE_PRICE * 0.08)) * 100}%`,
                    }}
                  />
                  {/* Current price indicator */}
                  <div
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-lg transition-all duration-500"
                    style={{
                      left: `${((state.btcPrice - BASE_PRICE * 0.97) / (BASE_PRICE * 0.08)) * 100}%`,
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>SL: ${(BASE_PRICE * 0.98).toLocaleString()}</span>
                  <span>Entry: ${BASE_PRICE.toLocaleString()}</span>
                  <span>TP1: ${(BASE_PRICE * 1.03).toLocaleString()}</span>
                </div>
              </div>
            )}
          </Card>

          {/* STEP 1: Market Analysis */}
          {(state.phase === "analysis" || state.phase === "signal") && (
            <Card className="border-border p-4">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-primary" />
                <h4 className="font-semibold">Step 1: Market Analysis — BTC/USDT</h4>
                {state.phase === "analysis" && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Analyzing...</span>
                  </div>
                )}
              </div>

              {state.phase === "analysis" && (
                <div className="space-y-3">
                  {[
                    { name: "Smart Money Flow", status: "Scanning shadow book...", progress: 60 },
                    { name: "Momentum Breakout", status: "Checking volume confirmation...", progress: 35 },
                    { name: "Volatility Compression", status: "Calculating Kalman volatility...", progress: 80 },
                  ].map((s, i) => (
                    <div key={i} className="rounded-lg bg-muted/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.status}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${s.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {state.phase === "signal" && state.signals.length > 0 && (
                <div className="space-y-3">
                  {/* Consensus Banner */}
                  <div className={`rounded-xl border p-4 text-center ${getConsensusBg(state.consensus)}`}>
                    <p className="text-xs text-muted-foreground mb-1">Consensus Signal</p>
                    <p className={`text-2xl font-bold ${getConsensusColor(state.consensus)}`}>
                      {state.consensus.replace("_", " ")}
                    </p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${state.consensus.includes("BUY") ? "bg-success" : "bg-muted-foreground"}`}
                          style={{ width: `${state.overallConfidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold">{state.overallConfidence.toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* Individual Strategy Signals */}
                  <div className="grid gap-2">
                    {state.signals.map((signal, i) => (
                      <div key={i} className={`rounded-lg border p-3 ${getSignalBg(signal.signal)}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{signal.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {signal.signal === "BUY" ? "BULLISH" : signal.signal === "SELL" ? "BEARISH" : "NEUTRAL"}
                            </Badge>
                          </div>
                          <span className={`text-sm font-bold ${getSignalColor(signal.signal)}`}>
                            {signal.signal}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{signal.reason}</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Confidence</span>
                          <span className="font-bold">{signal.confidence}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${signal.signal === "BUY" ? "bg-success" : signal.signal === "SELL" ? "bg-destructive" : "bg-muted-foreground"}`}
                            style={{ width: `${signal.confidence}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Joelin recommendation */}
                  {state.recommendation && (
                    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">Joelin trading recommendation</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="rounded-lg bg-background/50 p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Entry</p>
                          <p className="font-mono text-sm font-bold text-success">{formatPrice(state.recommendation.entryPrice)}</p>
                        </div>
                        <div className="rounded-lg bg-background/50 p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Stop Loss (-2%)</p>
                          <p className="font-mono text-sm font-bold text-destructive">{formatPrice(state.recommendation.stopLoss)}</p>
                        </div>
                        <div className="rounded-lg bg-background/50 p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">TP1 (+3%)</p>
                          <p className="font-mono text-sm font-bold text-success">{formatPrice(state.recommendation.takeProfit1)}</p>
                        </div>
                        <div className="rounded-lg bg-background/50 p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">TP2 (+5%)</p>
                          <p className="font-mono text-sm font-bold text-warning">{formatPrice(state.recommendation.takeProfit2)}</p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-background/50 p-3 mb-3">
                        <p className="text-xs text-muted-foreground">{state.recommendation.reasoning}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Risk Assessment</span>
                        <Badge variant={state.recommendation.riskLevel === "Low" ? "default" : state.recommendation.riskLevel === "Medium" ? "secondary" : "destructive"}>
                          {state.recommendation.riskLevel}
                        </Badge>
                      </div>
                    </Card>
                  )}

                  {/* Execute Button */}
                  <Button
                    onClick={executeTrade}
                    className="w-full gap-2 py-6 text-base font-bold bg-gradient-to-r from-success to-primary hover:from-success/90 hover:to-primary/90"
                  >
                    <Zap className="h-5 w-5" />
                    Execute LONG $5,000 at {formatPrice(BASE_PRICE)}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* STEP 3 & 4: Execution & Monitoring */}
          {state.phase === "executing" && (
            <Card className="border-primary/30 bg-primary/5 p-6">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <h4 className="text-lg font-bold mb-2">Executing Trade...</h4>
                <p className="text-sm text-muted-foreground">Placing market order for $5,000 LONG BTC/USDT</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex h-2 w-2 animate-pulse rounded-full bg-success" />
                  <span className="text-xs text-muted-foreground">Order being processed</span>
                </div>
              </div>
            </Card>
          )}

          {/* STEP 4: Live Monitoring */}
          {state.phase === "monitoring" && state.position && (
            <Card className={`border p-4 ${
              state.position.pnl >= 0 ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold">Live Position Monitoring</h4>
                </div>
                <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                  <span className="flex h-2 w-2 animate-pulse rounded-full bg-success mr-2" />
                  ACTIVE
                </Badge>
              </div>

              {/* Position Details */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Direction</p>
                  <p className="font-bold text-success">LONG</p>
                </div>
                <div className="rounded-lg bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Size</p>
                  <p className="font-bold">$5,000</p>
                </div>
                <div className="rounded-lg bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Entry</p>
                  <p className="font-mono font-bold">{formatPrice(state.position.avgEntryPrice)}</p>
                </div>
                <div className="rounded-lg bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Current</p>
                  <p className="font-mono font-bold">{formatPrice(state.position.currentPrice)}</p>
                </div>
              </div>

              {/* P&L Chart Mini */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Entry: {formatPrice(state.position.avgEntryPrice)}</span>
                  <span className={`font-bold ${state.position.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatPnl(state.position.pnl)}
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`absolute inset-y-0 left-1/2 rounded-full transition-all duration-500 ${
                      state.position.pnl >= 0 ? "bg-success" : "bg-destructive"
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(state.position.pnlPercentage) * 10, 50)}%`,
                      left: state.position.pnl >= 0 ? "50%" : `${50 - Math.min(Math.abs(state.position.pnlPercentage) * 10, 50)}%`,
                    }}
                  />
                  {/* Center line */}
                  <div className="absolute left-1/2 top-0 h-full w-0.5 bg-border" />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>-5%</span>
                  <span>0%</span>
                  <span>+5%</span>
                </div>
              </div>

              {/* Price Phases Progress */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Price Simulation Phases</p>
                <div className="flex gap-1">
                  {PRICE_PHASES.map((phase, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full py-1 text-center text-[10px] font-medium transition-all ${
                        i < state.currentPhase
                          ? "bg-success/20 text-success"
                          : i === state.currentPhase
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {phase.label.split(":")[0]}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* STEP 5: Closing */}
          {state.phase === "closing" && (
            <Card className="border-warning/30 bg-warning/5 p-6">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-warning mb-4" />
                <h4 className="text-lg font-bold mb-2">Closing Position...</h4>
                <p className="text-sm text-muted-foreground">Submitting market sell order for BTC/USDT</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex h-2 w-2 animate-pulse rounded-full bg-warning" />
                  <span className="text-xs text-muted-foreground">Order being processed</span>
                </div>
              </div>
            </Card>
          )}

          {/* STEP 6: Trade Complete */}
          {state.phase === "complete" && state.tradeResult && (
            <Card className="border-success/30 bg-gradient-to-br from-success/10 to-primary/5 p-6">
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20 mb-4">
                  <Trophy className="h-8 w-8 text-success" />
                </div>
                <h4 className="text-xl font-bold mb-2">Trade Complete! 🎉</h4>
                <p className="text-sm text-muted-foreground mb-6">Paper trade simulation finished successfully</p>

                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div className="rounded-xl bg-background/50 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Entry Price</p>
                    <p className="font-mono text-lg font-bold">{formatPrice(state.tradeResult.entryPrice)}</p>
                  </div>
                  <div className="rounded-xl bg-background/50 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Exit Price</p>
                    <p className="font-mono text-lg font-bold text-success">{formatPrice(state.tradeResult.exitPrice)}</p>
                  </div>
                  <div className="rounded-xl bg-background/50 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Profit</p>
                    <p className="font-mono text-lg font-bold text-success">+${state.tradeResult.pnl.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl bg-background/50 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Return</p>
                    <p className="font-mono text-lg font-bold text-success">+{state.tradeResult.pnlPercent}%</p>
                  </div>
                </div>

                <div className="mt-4 w-full max-w-md rounded-lg bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground text-center">{state.tradeResult.strategyAccuracy}</p>
                </div>

                <Button
                  onClick={resetSimulation}
                  className="mt-6 gap-2"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4" />
                  Run Simulation Again
                </Button>
              </div>
            </Card>
          )}

          {/* Idle State */}
          {state.phase === "idle" && (
            <Card className="border-border p-8">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 mb-6">
                  <Play className="h-10 w-10 text-primary" />
                </div>
                <h4 className="text-xl font-bold mb-2">Ready to Simulate</h4>
                <p className="text-sm text-muted-foreground mb-6 max-w-md">
                  Experience the full NEX trading pipeline: market analysis, Joelin signal generation, 
                  trade execution, and live position monitoring — all with simulated data.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-8 w-full max-w-lg">
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <Brain className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-medium">Analysis</p>
                    <p className="text-[10px] text-muted-foreground">3 strategies</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <Zap className="h-5 w-5 mx-auto mb-1 text-accent" />
                    <p className="text-xs font-medium">Execute</p>
                    <p className="text-[10px] text-muted-foreground">$5,000 LONG</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <Activity className="h-5 w-5 mx-auto mb-1 text-success" />
                    <p className="text-xs font-medium">Monitor</p>
                    <p className="text-[10px] text-muted-foreground">Live P&L</p>
                  </div>
                </div>
                <Button
                  onClick={runMarketAnalysis}
                  className="gap-2 py-6 px-8 text-base font-bold bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                >
                  <Play className="h-5 w-5" />
                  Start Simulation
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Alerts Feed */}
        <div className="space-y-4">
          <Card className="border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Activity Log</h4>
              </div>
              {state.alerts.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {state.alerts.length} events
                </Badge>
              )}
            </div>
            <div className="max-h-[600px] overflow-y-auto p-4 space-y-2">
              {state.alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground/60">Start the simulation to see events</p>
                </div>
              ) : (
                [...state.alerts].reverse().map((alert, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 text-sm ${
                      alert.type === "success"
                        ? "bg-success/10 text-success"
                        : alert.type === "warning"
                        ? "bg-warning/10 text-warning"
                        : alert.type === "error"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <p>{alert.message}</p>
                    <p className="text-[10px] opacity-60 mt-1">
                      {new Date(alert.time).toLocaleTimeString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
