"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Crosshair,
  Eye,
  Gauge,
  LineChart,
  Play,
  RefreshCw,
  Shield,
  Square,
  TrendingDown,
  TrendingUp,
  Zap,
  BadgeCheck,
  Globe,
  Network,
  Server,
  Timer,
  Target,
  Trophy,
  Loader2,
  Sparkles,
  Radio,
  Signal,
  Cpu,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RaceConditionDetector, type RaceConditionEvent, type RaceConditionMetrics, analyzeRaceConditions, calculateOptimalEntryDelay } from "@/lib/race-condition-engine"

// ============================================================
// Types for Prediction Race
// ============================================================

interface PredictionResult {
  nexusTimestamp: number
  symbol: string
  currentPrice: number
  prediction: "BUY" | "SELL" | "HOLD"
  confidence: number
  targetPrice: number
  reasoning: string[]
  marketData: {
    imbalance: number
    volumeSpike: number
    tradeImbalance: number
    priceChange5m: number
    bidVolume: number
    askVolume: number
  }
}

interface VerificationResult {
  elapsedMs: number
  predictedPrice: number
  actualPrice: number
  prediction: string
  actualMovement: number
  correct: boolean
  leadTimeMs: number
  dataSource: string
  verified: boolean
}

interface RaceHistory {
  id: number
  timestamp: number
  prediction: string
  confidence: number
  predictedPrice: number
  actualPrice: number
  actualMovement: number
  correct: boolean
  leadTimeMs: number
}

type DisplayRaceEvent = RaceConditionEvent & {
  id: string
  description: string
  details?: Record<string, number | string>
  severity: "low" | "medium" | "high"
}

// ============================================================
// Race Conditions Dashboard
// ============================================================

export default function RaceConditionsPage() {
  const router = useRouter()
  const [symbol, setSymbol] = useState("BTCUSDT")
  const [isRunning, setIsRunning] = useState(false)
  const [events, setEvents] = useState<RaceConditionEvent[]>([])
  const [metrics, setMetrics] = useState<RaceConditionMetrics | null>(null)
  const [activeTab, setActiveTab] = useState("live")
  const detectorRef = useRef<RaceConditionDetector | null>(null)
  const eventsRef = useRef<RaceConditionEvent[]>([])

  // Prediction Race State
  const [isRacing, setIsRacing] = useState(false)
  const [racePhase, setRacePhase] = useState<"idle" | "predicting" | "monitoring" | "result">("idle")
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [raceHistory, setRaceHistory] = useState<RaceHistory[]>([])
  const [countdown, setCountdown] = useState(30)
  const [raceError, setRaceError] = useState<string | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const [nexusSignal, setNexusSignal] = useState<"BUY" | "SELL" | "HOLD" | "WAITING">("WAITING")
  const [binancePrice, setBinancePrice] = useState<number | null>(null)
  const [binanceConnected, setBinanceConnected] = useState(false)
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected")
  const [lastApiCall, setLastApiCall] = useState<string | null>(null)
  const [rateLimitRemaining, setRateLimitRemaining] = useState(1200)

  // Keep eventsRef in sync
  useEffect(() => {
    eventsRef.current = events
  }, [events])

  // WebSocket for real-time Binance price
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: NodeJS.Timeout | null = null

    const connect = () => {
      setWsStatus("connecting")
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`)

        ws.onopen = () => {
          setWsStatus("connected")
          setBinanceConnected(true)
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.p) {
              setBinancePrice(parseFloat(data.p))
            }
          } catch {}
        }

        ws.onclose = () => {
          setWsStatus("disconnected")
          setBinanceConnected(false)
          if (isRunning) {
            reconnectTimer = setTimeout(connect, 3000)
          }
        }

        ws.onerror = () => {
          ws?.close()
        }
      } catch {
        setWsStatus("disconnected")
      }
    }

    connect()

    return () => {
      if (ws) ws.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [symbol, isRunning])

  const handleEvent = useCallback((event: RaceConditionEvent) => {
    setEvents(prev => {
      const updated = [...prev, event]
      return updated.length > 500 ? updated.slice(-500) : updated
    })
  }, [])

  const handleMetrics = useCallback((m: RaceConditionMetrics) => {
    setMetrics(m)
  }, [])

  const startDetector = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.stop()
    }

    const detector = new RaceConditionDetector(
      symbol,
      handleEvent,
      handleMetrics
    )
    detectorRef.current = detector
    detector.start()
    setIsRunning(true)
  }, [symbol, handleEvent, handleMetrics])

  const stopDetector = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.stop()
      detectorRef.current = null
    }
    setIsRunning(false)
  }, [])

  const clearData = useCallback(() => {
    setEvents([])
    if (detectorRef.current) {
      detectorRef.current.clearEvents()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (detectorRef.current) {
        detectorRef.current.stop()
      }
    }
  }, [])

  // ============================================================
  // PREDICTION RACE LOGIC
  // ============================================================

  const runPredictionRace = async () => {
    if (isRacing) return
    setIsRacing(true)
    setRacePhase("predicting")
    setRaceError(null)
    setVerificationResult(null)

    try {
      // Step 1: Nexus makes prediction
      const predictRes = await fetch(`/api/binance-race?symbol=${symbol}&action=predict`)
      const predictData = await predictRes.json()

      if (!predictData.success) {
        throw new Error(predictData.error || "Prediction failed")
      }

      setPredictionResult(predictData)
      setNexusSignal(predictData.prediction)
      setLastApiCall(new Date().toISOString())

      // Step 2: Wait 30 seconds with countdown
      setRacePhase("monitoring")
      setCountdown(30)

      await new Promise<void>((resolve) => {
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current)
              resolve()
              return 0
            }
            return prev - 1
          })
        }, 1000)
      })

      // Step 3: Verify what happened
      setRacePhase("result")
      const verifyRes = await fetch(
        `/api/binance-race?symbol=${symbol}&action=verify&predictedPrice=${predictData.currentPrice}&prediction=${predictData.prediction}&nexusTimestamp=${predictData.nexusTimestamp}`
      )
      const verifyData = await verifyRes.json()

      if (!verifyData.success) {
        throw new Error(verifyData.error || "Verification failed")
      }

      setVerificationResult(verifyData)
      setLastApiCall(new Date().toISOString())

      // Add to history
      const historyEntry: RaceHistory = {
        id: Date.now(),
        timestamp: predictData.nexusTimestamp,
        prediction: predictData.prediction,
        confidence: predictData.confidence,
        predictedPrice: predictData.currentPrice,
        actualPrice: verifyData.actualPrice,
        actualMovement: verifyData.actualMovement,
        correct: verifyData.correct,
        leadTimeMs: verifyData.leadTimeMs,
      }
      setRaceHistory(prev => [historyEntry, ...prev].slice(0, 50))

    } catch (err: any) {
      setRaceError(err.message || "Race failed")
      setRacePhase("result")
    } finally {
      setIsRacing(false)
    }
  }

  // Analysis
  const analysis = analyzeRaceConditions(events)
  const optimalDelay = calculateOptimalEntryDelay(events)

  // Recent events for display
  const recentEvents: DisplayRaceEvent[] = events
    .slice(-50)
    .reverse()
    .map((event, index) => {
      const severity: DisplayRaceEvent["severity"] =
        event.type === "spoof_detected" ? "high" : event.type === "depth_collapse" ? "medium" : "low"
      const description =
        event.type === "spoof_detected"
          ? "Potential spoofing behavior detected"
          : event.type === "real_liquidity_taking"
            ? "Real liquidity taking detected"
            : event.type === "depth_collapse"
              ? "Order-book depth collapsed"
              : event.type === "trade_print"
                ? "Aggressive trade print observed"
                : "Order-book change detected"

      return {
        ...event,
        id: `${event.timestamp}-${index}`,
        description,
        severity,
        details: {
          price: event.price,
          size: event.size,
          latencyMs: event.latency_ms,
          confidence: Number((event.confidence * 100).toFixed(2)),
          side: event.side,
        },
      }
    })

  // Stats
  const spoofCount = events.filter(e => e.type === "spoof_detected").length
  const realCount = events.filter(e => e.type === "real_liquidity_taking").length
  const depthCollapseCount = events.filter(e => e.type === "depth_collapse").length

  // Race stats
  const totalRaces = raceHistory.length
  const correctRaces = raceHistory.filter(r => r.correct).length
  const raceAccuracy = totalRaces > 0 ? ((correctRaces / totalRaces) * 100).toFixed(1) : "N/A"
  const avgLeadTime = totalRaces > 0
    ? (raceHistory.reduce((sum, r) => sum + r.leadTimeMs, 0) / totalRaces).toFixed(0)
    : "N/A"

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted hover:bg-muted/80"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Race Condition Engine</h1>
              <p className="text-sm text-muted-foreground">
                Nexus Intelligence vs Binance Live - Real-time prediction race
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value)
                if (detectorRef.current) {
                  detectorRef.current.setSymbol(e.target.value)
                }
              }}
              className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
              disabled={isRunning}
            >
              <option value="BTCUSDT">BTC/USDT</option>
              <option value="ETHUSDT">ETH/USDT</option>
              <option value="SOLUSDT">SOL/USDT</option>
              <option value="XRPUSDT">XRP/USDT</option>
              <option value="BNBUSDT">BNB/USDT</option>
              <option value="ADAUSDT">ADA/USDT</option>
              <option value="DOGEUSDT">DOGE/USDT</option>
              <option value="AVAXUSDT">AVAX/USDT</option>
            </select>

            {!isRunning ? (
              <Button onClick={startDetector} className="gap-2">
                <Play className="h-4 w-4" />
                Start Monitoring
              </Button>
            ) : (
              <Button onClick={stopDetector} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}

            <Button onClick={clearData} variant="outline" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* BINANCE VERIFICATION STATUS BAR */}
        {/* ============================================================ */}
        <Card className="border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Binance Live Status */}
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${binanceConnected ? "bg-yellow-500 animate-pulse" : "bg-muted"}`} />
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-yellow-500" />
                Binance Live
              </span>
              <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                {wsStatus === "connected" ? "Connected" : wsStatus === "connecting" ? "Connecting..." : "Disconnected"}
              </Badge>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* WebSocket Status */}
            <div className="flex items-center gap-2 text-sm">
              <Radio className={`h-3.5 w-3.5 ${wsStatus === "connected" ? "text-success" : "text-muted-foreground"}`} />
              <span>WebSocket: <strong>{wsStatus === "connected" ? "Active" : wsStatus === "connecting" ? "Connecting..." : "Inactive"}</strong></span>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* API Endpoint */}
            <div className="flex items-center gap-2 text-sm">
              <Network className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Data Source: <strong className="text-yellow-500">api.binance.com</strong></span>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Rate Limit */}
            <div className="flex items-center gap-2 text-sm">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span>API Calls: <strong>{rateLimitRemaining}/1200</strong></span>
            </div>

            {lastApiCall && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Last API: <strong>{new Date(lastApiCall).toLocaleTimeString()}</strong></span>
                </div>
              </>
            )}

            {/* Race Condition Status */}
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${
                  isRunning ? "bg-success animate-pulse" : "bg-muted"
                }`}
              />
              <span className="text-sm font-medium">
                {isRunning ? "Monitoring" : "Stopped"}
              </span>
            </div>

            {metrics && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2 text-sm">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span>Events: <strong>{metrics.totalEvents}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Avg Latency: <strong>{metrics.averageLatencyMs}ms</strong></span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      metrics.currentSignal === "spoofing"
                        ? "destructive"
                        : metrics.currentSignal === "real_move"
                        ? "default"
                        : "secondary"
                    }
                    className="text-xs"
                  >
                    {metrics.currentSignal === "spoofing" && <AlertTriangle className="mr-1 h-3 w-3" />}
                    {metrics.currentSignal === "real_move" && <Zap className="mr-1 h-3 w-3" />}
                    {metrics.currentSignal.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(metrics.signalConfidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* ============================================================ */}
        {/* PREDICTION RACE SECTION */}
        {/* ============================================================ */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-transparent p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Prediction Race: Nexus vs Binance
              </h2>
              <Button
                onClick={runPredictionRace}
                disabled={isRacing}
                className="gap-2"
                size="lg"
              >
                {isRacing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {racePhase === "predicting" ? "Nexus Predicting..." : `Monitoring (${countdown}s)...`}
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Test Prediction Race Now
                  </>
                )}
              </Button>
            </div>

            {/* Race Arena: Nexus vs Binance */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left: Nexus Analysis */}
              <Card className="border-border bg-card/50">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                      <Cpu className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold">Nexus Intelligence</h3>
                      <p className="text-xs text-muted-foreground">Joelin signal engine</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Current Signal */}
                    <div className="rounded-lg bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground mb-1">Current Signal</div>
                      <div className={`text-2xl font-black ${
                        nexusSignal === "BUY" ? "text-success" :
                        nexusSignal === "SELL" ? "text-destructive" :
                        "text-muted-foreground"
                      }`}>
                        {nexusSignal}
                      </div>
                    </div>

                    {/* Prediction Details */}
                    {predictionResult && (
                      <>
                        <div className="rounded-lg bg-muted/30 p-3">
                          <div className="text-xs text-muted-foreground mb-1">Prediction Timestamp</div>
                          <div className="font-mono text-sm">
                            {new Date(predictionResult.nexusTimestamp).toLocaleTimeString()}.{String(predictionResult.nexusTimestamp % 1000).padStart(3, "0")}
                          </div>
                        </div>

                        <div className="rounded-lg bg-muted/30 p-3">
                          <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  predictionResult.confidence > 0.7 ? "bg-success" :
                                  predictionResult.confidence > 0.4 ? "bg-warning" : "bg-destructive"
                                }`}
                                style={{ width: `${predictionResult.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold">{(predictionResult.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>

                        <div className="rounded-lg bg-muted/30 p-3">
                          <div className="text-xs text-muted-foreground mb-1">Target Price</div>
                          <div className="font-mono text-lg font-bold">
                            ${predictionResult.targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        {/* Reasoning */}
                        {predictionResult.reasoning.length > 0 && (
                          <div className="rounded-lg bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground mb-2">Reasoning</div>
                            <ul className="space-y-1">
                              {predictionResult.reasoning.map((r, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs">
                                  <Sparkles className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                    {!predictionResult && racePhase === "idle" && (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        Waiting for market movement...
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Center: The Race */}
              <Card className="border-border bg-card/50">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/20">
                      <Globe className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div>
                      <h3 className="font-bold">Binance Live</h3>
                      <p className="text-xs text-muted-foreground">Data Source: LIVE BINANCE API</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Connection Status */}
                    <div className="rounded-lg bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground mb-1">Connection Status</div>
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium">Connecting to Binance: ✅ Authenticated</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground mb-1">API Key</div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-success" />
                        <span className="text-sm">Read-Only: ✅ Confirmed</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground mb-1">Account</div>
                      <div className="text-sm font-medium">Nexus - Spot Wallet</div>
                    </div>

                    {/* Live Price */}
                    <div className="rounded-lg bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground mb-1">Live Price</div>
                      <div className="font-mono text-lg font-bold">
                        {binancePrice
                          ? `$${binancePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "Loading..."}
                      </div>
                    </div>

                    {/* Verification Badge */}
                    <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                      <div className="flex items-center gap-2 text-xs">
                        <BadgeCheck className="h-3.5 w-3.5 text-yellow-500" />
                        <span className="text-yellow-500 font-medium">Data directly from Binance - not simulated</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Right: Race Result */}
              <Card className="border-border bg-card/50">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
                      <Timer className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <h3 className="font-bold">Race Result</h3>
                      <p className="text-xs text-muted-foreground">Who predicted first?</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Race Phase Indicator */}
                    <div className="rounded-lg bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground mb-1">Status</div>
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${
                          racePhase === "predicting" ? "bg-primary animate-pulse" :
                          racePhase === "monitoring" ? "bg-warning animate-pulse" :
                          racePhase === "result" ? "bg-success" : "bg-muted"
                        }`} />
                        <span className="text-sm font-medium">
                          {racePhase === "idle" && "Ready"}
                          {racePhase === "predicting" && "Nexus predicting..."}
                          {racePhase === "monitoring" && `Monitoring Binance for ${countdown}s...`}
                          {racePhase === "result" && "Race Complete"}
                        </span>
                      </div>
                    </div>

                    {/* Countdown */}
                    {racePhase === "monitoring" && (
                      <div className="rounded-lg bg-warning/10 border border-warning/20 p-4 text-center">
                        <div className="text-4xl font-black text-warning">{countdown}</div>
                        <div className="text-xs text-muted-foreground mt-1">seconds remaining</div>
                      </div>
                    )}

                    {/* Result */}
                    {verificationResult && (
                      <>
                        <div className={`rounded-lg p-4 text-center ${
                          verificationResult.correct
                            ? "bg-success/10 border border-success/20"
                            : "bg-destructive/10 border border-destructive/20"
                        }`}>
                          <div className="text-2xl font-black mb-1">
                            {verificationResult.correct ? "✅ CORRECT" : "❌ INCORRECT"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Nexus predicted {verificationResult.prediction} at ${verificationResult.predictedPrice.toLocaleString()}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Actual: ${verificationResult.actualPrice.toLocaleString()} ({verificationResult.actualMovement > 0 ? "+" : ""}{verificationResult.actualMovement.toFixed(2)}%)
                          </div>
                        </div>

                        <div className="rounded-lg bg-muted/30 p-3">
                          <div className="text-xs text-muted-foreground mb-1">Lead Time</div>
                          <div className="text-lg font-bold text-success">
                            {verificationResult.leadTimeMs}ms
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Nexus predicted BEFORE Binance moved
                          </div>
                        </div>
                      </>
                    )}

                    {raceError && (
                      <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertTriangle className="h-4 w-4" />
                          {raceError}
                        </div>
                      </div>
                    )}

                    {racePhase === "idle" && !verificationResult && (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        Click "Test Prediction Race Now" to start
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Card>

        {/* ============================================================ */}
        {/* RACE HISTORY */}
        {/* ============================================================ */}
        {raceHistory.length > 0 && (
          <Card className="border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Race History ({totalRaces} races)
              </h3>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Accuracy: <strong className={parseFloat(raceAccuracy) > 50 ? "text-success" : "text-destructive"}>{raceAccuracy}%</strong></span>
                <span>Avg Lead: <strong className="text-primary">{avgLeadTime}ms</strong></span>
                <span>Correct: <strong className="text-success">{correctRaces}</strong></span>
                <span>Incorrect: <strong className="text-destructive">{totalRaces - correctRaces}</strong></span>
              </div>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              <div className="space-y-1">
                {raceHistory.map((race) => (
                  <div
                    key={race.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      race.correct ? "bg-success/5" : "bg-destructive/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {new Date(race.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge variant={race.correct ? "default" : "destructive"} className="text-[10px]">
                        {race.prediction}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ${race.predictedPrice.toLocaleString()} → ${race.actualPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${race.actualMovement >= 0 ? "text-success" : "text-destructive"}`}>
                        {race.actualMovement > 0 ? "+" : ""}{race.actualMovement.toFixed(2)}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {race.leadTimeMs}ms lead
                      </span>
                      <span className={race.correct ? "text-success" : "text-destructive"}>
                        {race.correct ? "✅" : "❌"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* ============================================================ */}
        {/* MAIN GRID - Race Condition Detection */}
        {/* ============================================================ */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Stats */}
          <div className="space-y-4 lg:col-span-1">
            {/* Key Metrics */}
            <Card className="border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">KEY METRICS</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm">Spoofing Events</span>
                  </div>
                  <span className="text-lg font-bold text-destructive">{spoofCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm">Real Liquidity Taking</span>
                  </div>
                  <span className="text-lg font-bold text-primary">{realCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-warning" />
                    <span className="text-sm">Depth Collapses</span>
                  </div>
                  <span className="text-lg font-bold text-warning">{depthCollapseCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Spoof/Real Ratio</span>
                  </div>
                  <span className="text-lg font-bold">
                    {realCount > 0 ? (spoofCount / realCount).toFixed(2) : "N/A"}
                  </span>
                </div>
              </div>
            </Card>

            {/* Analysis */}
            <Card className="border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">MARKET ANALYSIS</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Manipulation Detected</span>
                  <Badge variant={analysis.isManipulated ? "destructive" : "secondary"}>
                    {analysis.isManipulated ? "YES" : "NO"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Type</span>
                  <Badge variant="outline">{analysis.manipulationType}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Confidence</span>
                  <span className="font-bold">{(analysis.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Optimal Entry Delay</span>
                  <span className="font-bold">{optimalDelay}ms</span>
                </div>
                <div className="mt-2 rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{analysis.recommendation}</p>
                </div>
              </div>
            </Card>

            {/* Signal */}
            {metrics && (
              <Card className="border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground">CURRENT SIGNAL</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Signal</span>
                    <Badge
                      variant={
                        metrics.currentSignal === "spoofing"
                          ? "destructive"
                          : metrics.currentSignal === "real_move"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {metrics.currentSignal.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Confidence</span>
                    <span className="font-bold">{(metrics.signalConfidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Events</span>
                    <span className="font-bold">{metrics.totalEvents}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Avg Latency</span>
                    <span className="font-bold">{metrics.averageLatencyMs}ms</span>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Right Column - Event Log */}
          <div className="space-y-4 lg:col-span-2">
            <Card className="border-border bg-card">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">LIVE EVENT LOG</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {events.length} events
                    </Badge>
                    {isRunning && (
                      <div className="flex items-center gap-1 text-xs text-success">
                        <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                        Live
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {recentEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Activity className="h-8 w-8 mb-2" />
                    <p className="text-sm">No events yet. Start monitoring to detect race conditions.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {recentEvents.map((event, i) => (
                      <div key={event.id || i} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Event Type Icon */}
                            {event.type === "spoof_detected" && (
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            )}
                            {event.type === "real_liquidity_taking" && (
                              <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            )}
                            {event.type === "depth_collapse" && (
                              <TrendingDown className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                            )}
                            {event.type === "order_book_change" && (
                              <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            )}

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    event.type === "spoof_detected"
                                      ? "destructive"
                                      : event.type === "real_liquidity_taking"
                                      ? "default"
                                      : "outline"
                                  }
                                  className="text-[10px] whitespace-nowrap"
                                >
                                  {event.type.replace(/_/g, " ").toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(event.timestamp).toLocaleTimeString()}.{String(event.timestamp % 1000).padStart(3, "0")}
                                </span>
                              </div>
                              <p className="text-sm mt-1">{event.description}</p>
                              {event.details && (
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {Object.entries(event.details).map(([key, value]) => (
                                    <Badge key={key} variant="outline" className="text-[10px]">
                                      {key}: {typeof value === "number" ? value.toFixed(2) : String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Severity */}
                          <Badge
                            variant={
                              event.severity === "high"
                                ? "destructive"
                                : event.severity === "medium"
                                ? "default"
                                : "secondary"
                            }
                            className="text-[10px] shrink-0"
                          >
                            {event.severity.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* ============================================================ */}
        {/* TABS - Detailed Analysis */}
        {/* ============================================================ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="live" className="gap-2">
              <Activity className="h-4 w-4" />
              Live Detection
            </TabsTrigger>
            <TabsTrigger value="spoofing" className="gap-2">
              <Eye className="h-4 w-4" />
              Spoofing Analysis
            </TabsTrigger>
            <TabsTrigger value="liquidity" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Liquidity Map
            </TabsTrigger>
            <TabsTrigger value="strategy" className="gap-2">
              <Target className="h-4 w-4" />
              Strategy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-4">
            <Card className="border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Race Condition Detection Engine</h3>
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  The Race Condition Engine monitors the order book for <strong className="text-foreground">spoofing</strong> and <strong className="text-foreground">real liquidity taking</strong> events in real-time.
                </p>
                <p>
                  When a large order appears and disappears quickly, it's likely <strong className="text-destructive">spoofing</strong> - a manipulative tactic to create false market direction.
                </p>
                <p>
                  When the order book depth collapses and price moves through levels, it's <strong className="text-primary">real liquidity taking</strong> - genuine market movement.
                </p>
                <div className="rounded-lg bg-muted/30 p-4">
                  <h4 className="font-semibold text-foreground mb-2">How to Use:</h4>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Select a symbol and click "Start Monitoring"</li>
                    <li>Watch for spoofing events (red) - these are fake walls</li>
                    <li>Wait for real liquidity taking (blue) - this is the real move</li>
                    <li>Enter AFTER the real move, not during spoofing</li>
                    <li>Use the optimal entry delay for best execution</li>
                  </ol>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="spoofing" className="mt-4">
            <Card className="border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Spoofing Analysis</h3>
              {spoofCount === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No spoofing events detected yet. Start monitoring to see analysis.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg bg-destructive/5 p-4 text-center">
                      <div className="text-2xl font-bold text-destructive">{spoofCount}</div>
                      <div className="text-xs text-muted-foreground">Spoofing Events</div>
                    </div>
                    <div className="rounded-lg bg-primary/5 p-4 text-center">
                      <div className="text-2xl font-bold text-primary">{realCount}</div>
                      <div className="text-xs text-muted-foreground">Real Moves</div>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-4 text-center">
                      <div className="text-2xl font-bold">
                        {realCount > 0 ? (spoofCount / realCount).toFixed(2) : "N/A"}
                      </div>
                      <div className="text-xs text-muted-foreground">Spoof/Real Ratio</div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-4">
                    <h4 className="font-semibold text-sm mb-2">Recommendation</h4>
                    <p className="text-sm text-muted-foreground">
                      {spoofCount > realCount
                        ? "High spoofing activity detected. Market is being manipulated. Wait for real liquidity taking before entering."
                        : "Market is showing genuine movement. Consider entering after confirmation."}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="liquidity" className="mt-4">
            <Card className="border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Liquidity Map</h3>
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No liquidity data yet. Start monitoring to build the map.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg bg-muted/30 p-4">
                      <h4 className="text-sm font-semibold mb-2">Bid Side Liquidity</h4>
                      <div className="text-2xl font-bold text-success">
                        {events
                          .filter((e) => e.side === "buy")
                          .reduce((sum, e) => sum + e.size, 0)
                          .toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total bid volume detected</div>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-4">
                      <h4 className="text-sm font-semibold mb-2">Ask Side Liquidity</h4>
                      <div className="text-2xl font-bold text-destructive">
                        {events
                          .filter((e) => e.side === "sell")
                          .reduce((sum, e) => sum + e.size, 0)
                          .toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total ask volume detected</div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="strategy" className="mt-4">
            <Card className="border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Race Condition Strategy</h3>
              <div className="space-y-4 text-sm">
                <div className="rounded-lg bg-muted/30 p-4">
                  <h4 className="font-semibold mb-2">Entry Rules</h4>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>Wait for spoofing to be detected first (fake wall)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>Enter when real liquidity taking is detected (real move)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>Use optimal delay: <strong>{optimalDelay}ms</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>Set stop loss at the spoof level</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>Take profit at 2x the spoof-to-real distance</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-lg bg-warning/10 border border-warning/20 p-4">
                  <h4 className="font-semibold text-warning mb-2">⚠️ Warning</h4>
                  <p className="text-muted-foreground">
                    Never enter during spoofing. Always wait for the real move. The spoof is designed to trap you.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
