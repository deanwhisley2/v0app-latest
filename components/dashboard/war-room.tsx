"use client"

/**
 * WAR ROOM - Market Intelligence Dashboard
 * 
 * The command center for liquidity warfare operations.
 * Connected to REAL market data via Binance API and Gold API.
 * 
 * Features:
 * - Heat Map: Where are the stop clusters?
 * - Spoofing Alert: "Fake wall detected at $65,200"
 * - Liquidity Sweep: "Price tapped $64,800, stops triggered, reversal incoming"
 * - Smart Money Flow: "100 BTC moved off exchange → accumulation signal"
 * - Trade Signal: Only when 3+ factors align
 * 
 * The only metric that matters:
 * Risk-Weighted Return per Unit of Liquidity Taken
 */

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  AlertTriangle,
  Crosshair,
  Shield,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Zap,
  Radar,
  Map,
  Ghost,
  Brain,
  AlertCircle,
  CheckCircle2,
  Swords,
  Bomb,
  Scan,
  Minus,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useWarRoomData, type WarAlert } from "@/hooks/use-war-room-data"

// ============================================================
// War Room Component
// ============================================================

export function WarRoom() {
  const {
    data,
    alerts,
    isRunning,
    error,
    start,
    stop,
  } = useWarRoomData(10000) // Poll every 10 seconds

  const [activeTab, setActiveTab] = useState("overview")
  const [autoAnalyze, setAutoAnalyze] = useState(false)
  const alertsEndRef = useRef<HTMLDivElement>(null)

  // Auto-analyze toggle
  useEffect(() => {
    if (autoAnalyze) {
      start()
    } else {
      stop()
    }
  }, [autoAnalyze, start, stop])

  // Scroll alerts to bottom
  useEffect(() => {
    alertsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [alerts])

  // ============================================================
  // Helper Functions
  // ============================================================

  function getAlertIcon(type: string) {
    switch (type) {
      case "SPOOFING": return <ShieldAlert className="h-4 w-4" />
      case "LIQUIDITY_SWEEP": return <Zap className="h-4 w-4" />
      case "STOP_CLUSTER": return <Crosshair className="h-4 w-4" />
      case "DARK_POOL": return <Ghost className="h-4 w-4" />
      case "TRADE_SIGNAL": return <Swords className="h-4 w-4" />
      case "SENTIMENT": return <Brain className="h-4 w-4" />
      case "FUNDING": return <DollarSign className="h-4 w-4" />
      default: return <Activity className="h-4 w-4" />
    }
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString()
  }

  // ============================================================
  // Render
  // ============================================================

  const currentPrice = data?.btcPrice || 0
  const warfareReport = data?.warfareReport || null
  const sentimentReport = data?.sentimentReport || null
  const tradeSignal = data?.tradeSignal || null
  const adaptationReport = data?.adaptationReport || null
  const lastUpdate = data?.lastUpdate || 0

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radar className="h-8 w-8 text-red-500" />
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-ping" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WAR ROOM</h1>
            <p className="text-sm text-muted-foreground">Market Intelligence Weapon System</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {data?.isLive ? (
              <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                <Wifi className="h-3 w-3 mr-1" /> LIVE
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <WifiOff className="h-3 w-3 mr-1" /> SIMULATED
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-analyze" className="text-sm">Auto-Scan</Label>
            <Switch
              id="auto-analyze"
              checked={autoAnalyze}
              onCheckedChange={setAutoAnalyze}
            />
          </div>
          <Button
            variant={autoAnalyze ? "outline" : "default"}
            size="sm"
            onClick={() => { if (!autoAnalyze) start() }}
            disabled={autoAnalyze}
          >
            <Scan className="h-4 w-4 mr-2" />
            Scan Now
          </Button>
          <Badge variant={autoAnalyze ? "default" : "secondary"} className="text-xs">
            {autoAnalyze ? "SCANNING" : "PAUSED"}
          </Badge>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-500">{error}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => start()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Column - Market Intel */}
        <div className="col-span-8 space-y-4">
          {/* Price & Signal Bar */}
          <Card className="border-red-500/20 bg-black/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-sm text-muted-foreground">BTC/USD</div>
                    <div className="text-3xl font-bold font-mono">
                      ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    {data && (
                      <div className={`text-xs mt-1 ${data.btcChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {data.btcChange24h >= 0 ? '+' : ''}{data.btcChange24h.toFixed(2)}% (24h)
                      </div>
                    )}
                  </div>
                  <Separator orientation="vertical" className="h-12" />
                  <div>
                    <div className="text-sm text-muted-foreground">Signal</div>
                    <div className="flex items-center gap-2">
                      {tradeSignal?.action === "BUY" ? (
                        <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-sm px-3 py-1">
                          <TrendingUp className="h-4 w-4 mr-1" /> BUY
                        </Badge>
                      ) : tradeSignal?.action === "SELL" ? (
                        <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-sm px-3 py-1">
                          <TrendingDown className="h-4 w-4 mr-1" /> SELL
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-sm px-3 py-1">
                          <Minus className="h-4 w-4 mr-1" /> WAIT
                        </Badge>
                      )}
                      {tradeSignal && tradeSignal.action !== "WAIT" && (
                        <span className="text-sm text-muted-foreground">
                          {tradeSignal.confidence.toFixed(0)}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                  <Separator orientation="vertical" className="h-12" />
                  <div>
                    <div className="text-sm text-muted-foreground">Reason</div>
                    <div className="text-sm font-medium max-w-[300px] truncate">
                      {tradeSignal?.explanation || "Waiting for setup..."}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Last Scan</div>
                    <div className="text-sm">{lastUpdate ? formatTime(lastUpdate) : "--"}</div>
                  </div>
                  {data && (
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Volume</div>
                      <div className="text-sm font-mono">{data.btcVolume.toLocaleString()} BTC</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="overview">
                <Radar className="h-4 w-4 mr-2" /> Overview
              </TabsTrigger>
              <TabsTrigger value="clusters">
                <Crosshair className="h-4 w-4 mr-2" /> Stop Clusters
              </TabsTrigger>
              <TabsTrigger value="spoofing">
                <ShieldAlert className="h-4 w-4 mr-2" /> Spoofing
              </TabsTrigger>
              <TabsTrigger value="sweeps">
                <Zap className="h-4 w-4 mr-2" /> Sweeps
              </TabsTrigger>
              <TabsTrigger value="darkpool">
                <Ghost className="h-4 w-4 mr-2" /> Dark Pool
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <Card className="border-red-500/20">
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                      <Crosshair className="h-3 w-3" /> Stop Clusters
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-1">
                    <div className="text-2xl font-bold">
                      {warfareReport?.stopClusters.length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {warfareReport?.stopClusters.reduce((s, c) => s + c.estimatedStops, 0) || 0} total stops
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-orange-500/20">
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Spoofing Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-1">
                    <div className="text-2xl font-bold">
                      {warfareReport?.spoofingAlerts.length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {warfareReport?.spoofingAlerts.filter(s => s.confidence > 70).length || 0} high confidence
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-yellow-500/20">
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Liquidity Sweeps
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-1">
                    <div className="text-2xl font-bold">
                      {warfareReport?.liquiditySweeps.length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {warfareReport?.liquiditySweeps.filter(s => s.reversalConfirmed).length || 0} confirmed reversals
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-500/20">
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                      <Ghost className="h-3 w-3" /> Dark Pool
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-1">
                    <div className="text-2xl font-bold">
                      {warfareReport?.darkPoolSignals.length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {warfareReport?.darkPoolSignals.filter(d => d.inferredSide === "BUY").length || 0} accumulation signals
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sentiment Panel */}
              {sentimentReport && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Brain className="h-4 w-4" /> Sentiment Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Order Book Imbalance</div>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.abs(sentimentReport.orderBookImbalance.ratio) * 100}
                            className="h-2"
                          />
                          <span className="text-sm font-mono w-12 text-right">
                            {(sentimentReport.orderBookImbalance.ratio * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-xs mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {sentimentReport.orderBookImbalance.interpretation}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Funding Rate</div>
                        {sentimentReport.fundingRate ? (
                          <>
                            <div className="text-sm font-mono">
                              {sentimentReport.fundingRate.currentRate.toFixed(4)}%
                            </div>
                            <div className="text-xs mt-1">
                              <Badge variant="outline" className="text-[10px]">
                                {sentimentReport.fundingRate.interpretation}
                              </Badge>
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">No data</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Exchange Flow</div>
                        {sentimentReport.exchangeFlow ? (
                          <>
                            <div className="text-sm font-mono">
                              {sentimentReport.exchangeFlow.netFlow > 0 ? "+" : ""}
                              {sentimentReport.exchangeFlow.netFlow.toFixed(2)} BTC
                            </div>
                            <div className="text-xs mt-1">
                              <Badge variant="outline" className="text-[10px]">
                                {sentimentReport.exchangeFlow.interpretation}
                              </Badge>
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">No data</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Adaptation Insights */}
              {adaptationReport && adaptationReport.totalTrades > 0 && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Brain className="h-4 w-4" /> Adaptation Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="grid grid-cols-4 gap-4 mb-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Total Trades</div>
                        <div className="text-lg font-bold">{adaptationReport.totalTrades}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Win Rate</div>
                        <div className="text-lg font-bold">
                          {(adaptationReport.performance.winRate * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Avg Win / Avg Loss</div>
                        <div className="text-lg font-bold">
                          {adaptationReport.performance.avgLoss > 0
                            ? (adaptationReport.performance.avgWin / adaptationReport.performance.avgLoss).toFixed(2)
                            : "∞"}:1
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Sharpe</div>
                        <div className="text-lg font-bold">
                          {adaptationReport.performance.sharpeRatio.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {adaptationReport.recommendedAdjustments.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground mb-1">Recommendations:</div>
                        {adaptationReport.recommendedAdjustments.slice(0, 3).map((rec, i) => (
                          <div key={i} className="text-xs flex items-start gap-2">
                            <AlertCircle className="h-3 w-3 mt-0.5 text-yellow-500 shrink-0" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Stop Clusters Tab */}
            <TabsContent value="clusters">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Crosshair className="h-4 w-4" /> Stop Loss Cluster Map
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Red zones indicate concentrated stop losses. Institutions hunt these levels.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {warfareReport && warfareReport.stopClusters.length > 0 ? (
                    <div className="space-y-3">
                      {warfareReport.stopClusters.map((cluster, i) => (
                        <div key={i} className="border rounded-lg p-3 border-red-500/20 bg-red-500/5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Bomb className="h-4 w-4 text-red-500" />
                              <span className="font-mono font-bold">
                                ${cluster.price.toLocaleString()}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {cluster.side === "BUY" ? "ABOVE PRICE" : "BELOW PRICE"}
                              </Badge>
                            </div>
                            <Badge className={cluster.estimatedStops > 5000 ? "bg-red-500/20 text-red-500" : "bg-orange-500/20 text-orange-500"}>
                              {cluster.estimatedStops.toLocaleString()} stops
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Stop density</span>
                              <span>{(cluster.confidence).toFixed(0)}%</span>
                            </div>
                            <Progress value={cluster.confidence} className="h-1.5" />
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {cluster.estimatedStops > 5000
                              ? "⚠️ MASSIVE STOP CLUSTER - High probability of liquidity hunt"
                              : cluster.estimatedStops > 2000
                              ? "Large stop cluster - Watch for sweep"
                              : "Moderate stop cluster - Monitor"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Map className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No stop clusters detected yet</p>
                      <p className="text-xs">Run a scan to identify stop loss concentrations</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Spoofing Tab */}
            <TabsContent value="spoofing">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" /> Spoofing Detection
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Large orders that appear then vanish. Trade AGAINST the spoof direction.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {warfareReport && warfareReport.spoofingAlerts.length > 0 ? (
                    <div className="space-y-3">
                      {warfareReport.spoofingAlerts.map((spoof, i) => (
                        <div key={i} className="border rounded-lg p-3 border-orange-500/20 bg-orange-500/5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <ShieldAlert className="h-4 w-4 text-orange-500" />
                              <span className="font-mono font-bold">
                                ${spoof.price.toLocaleString()}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {spoof.side === "ASK" ? "SELL WALL" : "BUY WALL"}
                              </Badge>
                            </div>
                            <Badge className={spoof.confidence > 70 ? "bg-red-500/20 text-red-500" : "bg-yellow-500/20 text-yellow-500"}>
                              {spoof.confidence.toFixed(0)}% confidence
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {spoof.side === "ASK"
                              ? `Fake sell wall at $${spoof.price.toLocaleString()}. Real buying pressure underneath. Trade: BUY the dip.`
                              : `Fake buy wall at $${spoof.price.toLocaleString()}. Real selling pressure underneath. Trade: SELL the rally.`
                            }
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Size: {spoof.size.toFixed(4)} BTC | Duration: {spoof.duration} ticks
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No spoofing detected</p>
                      <p className="text-xs">Order book appears clean</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Liquidity Sweeps Tab */}
            <TabsContent value="sweeps">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Liquidity Sweep Detection
                  </CardTitle>
                  <CardDescription className="text-xs">
                    When price spikes through a level, grabs stops, reverses. THIS IS THE SIGNAL.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {warfareReport && warfareReport.liquiditySweeps.length > 0 ? (
                    <div className="space-y-3">
                      {warfareReport.liquiditySweeps.map((sweep, i) => (
                        <div key={i} className={`border rounded-lg p-3 ${
                          sweep.reversalConfirmed
                            ? "border-green-500/20 bg-green-500/5"
                            : "border-yellow-500/20 bg-yellow-500/5"
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {sweep.reversalConfirmed ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              )}
                              <span className="font-mono font-bold">
                                ${sweep.sweepPrice.toLocaleString()}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {sweep.direction === "UP" ? "SWEEP UP ↑" : "SWEEP DOWN ↓"}
                              </Badge>
                            </div>
                            <Badge className={
                              sweep.reversalConfirmed
                                ? "bg-green-500/20 text-green-500"
                                : "bg-yellow-500/20 text-yellow-500"
                            }>
                              {sweep.reversalConfirmed ? "REVERSAL CONFIRMED" : "WAITING FOR REVERSAL"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">Stops Triggered:</span>
                              <span className="ml-1 font-mono">{sweep.stopLossesTriggered.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Volume:</span>
                              <span className="ml-1 font-mono">{sweep.volume.toFixed(2)} BTC</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Confidence:</span>
                              <span className="ml-1 font-mono">{sweep.confidence.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="text-xs mt-2 font-medium">
                            {sweep.reversalConfirmed
                              ? `✅ ENTRY SIGNAL: Price swept ${sweep.direction}, stops triggered, reversal confirmed. Enter ${sweep.direction === "UP" ? "SHORT" : "LONG"}.`
                              : `⏳ Monitoring: Price swept ${sweep.direction}. Waiting for reversal confirmation before entering.`
                            }
                          </div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="text-center py-8 text-muted-foreground">
                       <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                       <p className="text-sm">No liquidity sweeps detected</p>
                       <p className="text-xs">Price action is clean - no stop hunts in progress</p>
                     </div>
                   )}
                 </CardContent>
               </Card>
             </TabsContent>

             {/* Dark Pool Tab */}
             <TabsContent value="darkpool">
               <Card>
                 <CardHeader className="p-4 pb-2">
                   <CardTitle className="text-sm flex items-center gap-2">
                     <Ghost className="h-4 w-4" /> Dark Pool Inference
                   </CardTitle>
                   <CardDescription className="text-xs">
                     When price moves on low volume = hidden buying/selling. Smart money accumulation/distribution.
                   </CardDescription>
                 </CardHeader>
                 <CardContent className="p-4 pt-2">
                   {warfareReport && warfareReport.darkPoolSignals.length > 0 ? (
                     <div className="space-y-3">
                       {warfareReport.darkPoolSignals.map((dp, i) => (
                         <div key={i} className="border rounded-lg p-3 border-purple-500/20 bg-purple-500/5">
                           <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                               <Ghost className="h-4 w-4 text-purple-500" />
                               <span className="font-mono font-bold">
                                 ${dp.price.toLocaleString()}
                               </span>
                               <Badge variant="outline" className="text-[10px]">
                                 {dp.inferredSide === "BUY" ? "ACCUMULATION" : "DISTRIBUTION"}
                               </Badge>
                             </div>
                             <Badge className={dp.confidence > 70 ? "bg-purple-500/20 text-purple-500" : "bg-gray-500/20 text-gray-500"}>
                               {dp.confidence.toFixed(0)}% confidence
                             </Badge>
                           </div>
                           <div className="grid grid-cols-3 gap-4 text-xs">
                             <div>
                               <span className="text-muted-foreground">Volume:</span>
                               <span className="ml-1 font-mono">{dp.volume.toFixed(2)} BTC</span>
                             </div>
                             <div>
                               <span className="text-muted-foreground">Price Impact:</span>
                               <span className="ml-1 font-mono">{dp.priceImpact.toFixed(2)}%</span>
                             </div>
                             <div>
                               <span className="text-muted-foreground">Signal:</span>
                               <span className="ml-1 font-mono">
                                 {dp.inferredSide === "BUY" ? "🐂 Accumulation" : "🐻 Distribution"}
                               </span>
                             </div>
                           </div>
                           <div className="text-xs mt-2">
                             {dp.inferredSide === "BUY"
                               ? `Smart money accumulating at $${dp.price.toLocaleString()}. Low volume = stealth buying.`
                               : `Smart money distributing at $${dp.price.toLocaleString()}. Low volume = stealth selling.`
                             }
                           </div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="text-center py-8 text-muted-foreground">
                       <Ghost className="h-8 w-8 mx-auto mb-2 opacity-50" />
                       <p className="text-sm">No dark pool activity detected</p>
                       <p className="text-xs">Price movement is proportional to visible volume</p>
                     </div>
                   )}
                 </CardContent>
               </Card>
             </TabsContent>
           </Tabs>
         </div>

         {/* Right Column - Alerts Feed */}
         <div className="col-span-4 space-y-4">
           <Card className="border-red-500/20 h-[calc(100vh-200px)] flex flex-col">
             <CardHeader className="p-3 pb-2 border-b border-red-500/10">
               <div className="flex items-center justify-between">
                 <CardTitle className="text-sm flex items-center gap-2">
                   <AlertTriangle className="h-4 w-4 text-red-500" />
                   Intelligence Feed
                 </CardTitle>
                 <Badge variant="outline" className="text-[10px]">
                   {alerts.filter(a => !a.acknowledged).length} new
                 </Badge>
               </div>
             </CardHeader>
             <CardContent className="p-2 flex-1 overflow-y-auto">
               {alerts.length > 0 ? (
                 <div className="space-y-1">
                   {alerts.map((alert) => (
                     <div
                       key={alert.id}
                       className={`text-xs p-2 rounded border ${
                         alert.severity === "CRITICAL"
                           ? "border-red-500/30 bg-red-500/10"
                           : alert.severity === "HIGH"
                           ? "border-orange-500/30 bg-orange-500/10"
                           : alert.severity === "MEDIUM"
                           ? "border-yellow-500/30 bg-yellow-500/5"
                           : "border-gray-500/20 bg-gray-500/5"
                       } ${alert.acknowledged ? "opacity-50" : ""}`}
                     >
                       <div className="flex items-center justify-between mb-1">
                         <div className="flex items-center gap-1">
                           {getAlertIcon(alert.type)}
                           <span className="font-semibold">{alert.type.replace(/_/g, " ")}</span>
                         </div>
                         <span className="text-[10px] text-muted-foreground">{formatTime(alert.timestamp)}</span>
                       </div>
                       <p className="text-[11px]">{alert.message}</p>
                     </div>
                   ))}
                   <div ref={alertsEndRef} />
                 </div>
               ) : (
                 <div className="text-center py-8 text-muted-foreground">
                   <Radar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                   <p className="text-sm">No intelligence yet</p>
                   <p className="text-xs">Run a scan to begin monitoring</p>
                 </div>
               )}
             </CardContent>
           </Card>
         </div>
       </div>
     </div>
   )
 }
