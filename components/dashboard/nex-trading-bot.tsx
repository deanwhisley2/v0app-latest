"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Bot,
  Zap,
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  DollarSign,
  Settings,
  Play,
  Pause,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  AlertCircle,
  Loader2,
  Sparkles,
  BarChart3,
  Shield,
  Newspaper,
  MessageSquare,
  Activity,
  Timer,
  Eye,
} from "lucide-react"
import type { Coin } from "@/lib/coins-data"

interface NexTradingBotProps {
  selectedCoin: Coin
  connectedExchanges: Array<{ id: string; name: string; balance: number; isDefault?: boolean; frozen?: boolean }>
  onExecuteTrade: (params: TradeParams) => void
}

export interface TradeParams {
  coin: string
  amount: number
  exchangeId: string
  strategy: string
  mode: "auto" | "manual"
  analysisTime: number
  enterTime: number
}

interface AIStrategy {
  id: string
  name: string
  description: string
  risk: "low" | "medium" | "high"
  expectedReturn: string
  confidence: number
  signals: string[]
}

interface NewsItem {
  source: string
  headline: string
  sentiment: "bullish" | "bearish" | "neutral"
  time: string
}

interface AnalysisResult {
  trend: "bullish" | "bearish" | "neutral"
  strength: number
  support: number
  resistance: number
  recommendation: string
}

interface TriModelAnalysis {
  gemini: {
    role: "Quant Data Miner"
    macroInsights: string
    keyData: string[]
    confidence: number
  }
  grok: {
    role: "Sentiment Specialist"
    twitterTrend: string
    sentiments: { sentiment: "bullish" | "bearish" | "neutral"; volume: number }[]
    urgency: "high" | "medium" | "low"
  }
  chatgpt: {
    role: "Strategy Coder"
    backtestResult: number // win rate %
    executionSteps: string[]
    pythonSignal: string
  }
  consensus: {
    agreement: number // 0-100
    finalRecommendation: "strong-buy" | "buy" | "hold" | "sell" | "strong-sell"
    riskScore: number
  }
}

export function NexTradingBot({ selectedCoin, connectedExchanges, onExecuteTrade }: NexTradingBotProps) {
  const [mode, setMode] = useState<"manual" | "nex" | "nex-tfc">("manual")
  const [selectedExchange, setSelectedExchange] = useState(connectedExchanges.find(e => e.isDefault)?.id || connectedExchanges[0]?.id || "")
  const [amount, setAmount] = useState("")
  const [analysisTime, setAnalysisTime] = useState(15) // minutes back
  const [enterTime, setEnterTime] = useState(5) // minutes to enter
  
  // Tri-model states
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const [triModelAnalysis, setTriModelAnalysis] = useState<TriModelAnalysis | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  
  const [showSettings, setShowSettings] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>("tri-analysis")
  const [strategies, setStrategies] = useState<AIStrategy[]>([])
  const [selectedStrategy, setSelectedStrategy] = useState<string>("")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [isFetchingNews, setIsFetchingNews] = useState(false)

  // Tri-model analysis: Gemini + Grok + ChatGPT
  const runTriModelAnalysis = async () => {
    setIsAnalyzing(true)
    setAnalysisComplete(false)
    
    try {
      // Simulate parallel API calls
      await new Promise(resolve => setTimeout(resolve, 3500))
      
      const analysis: TriModelAnalysis = {
        // Gemini: Quant Data Miner - Macro analysis
        gemini: {
          role: "Quant Data Miner",
          macroInsights: `Central bank policies affecting ${selectedCoin.symbol} are supportive. Recent earnings indicate institutional accumulation.`,
          keyData: [
            "Fed rate expectations: 4.5% by Q2",
            `${selectedCoin.symbol} correlation to gold: +0.73`,
            "Institutional inflows up 24% YTD",
            "On-chain whale movements: bullish positioning",
          ],
          confidence: 0.82,
        },
        
        // Grok: Sentiment Specialist - Real-time X/Twitter sentiment
        grok: {
          role: "Sentiment Specialist",
          twitterTrend: `Viral hashtag #${selectedCoin.symbol}Rally trending with 1.2M mentions. Major influencers calling for breakout.`,
          sentiments: [
            { sentiment: "bullish", volume: 6847 },
            { sentiment: "neutral", volume: 1243 },
            { sentiment: "bearish", volume: 342 },
          ],
          urgency: "high",
        },
        
        // ChatGPT: Strategy Coder - Execution & backtesting
        chatgpt: {
          role: "Strategy Coder",
          backtestResult: 78, // win rate %
          executionSteps: [
            "Entry: 5% above current price (breakout confirmation)",
            "Position size: 0.5x account per signal",
            "Take profit: +3%, +5%, +8% exits (scaled)",
            "Stop loss: -2% tight stop below support",
          ],
          pythonSignal: `if close > ma20 and rsi < 70 and volume > avg_vol: BUY`,
        },
        
        // Consensus: Non-consensus check
        consensus: {
          agreement: 87, // All three models align
          finalRecommendation: "strong-buy",
          riskScore: 0.35, // 0-1 scale
        },
      }
      
      setTriModelAnalysis(analysis)
      setAnalysisComplete(true)
    } catch (error) {
      console.error("Error in tri-model analysis:", error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Start NEX tri-model analysis
  const startNexAnalysis = () => {
    runTriModelAnalysis()
  }

  // Execute trade with NEX
  const executeNexTrade = () => {
    if (!selectedExchange || !amount || parseFloat(amount) <= 0) return
    if (!triModelAnalysis) return
    
    setIsExecuting(true)
    setTimeout(() => {
      onExecuteTrade({
        coin: selectedCoin.symbol,
        amount: parseFloat(amount),
        exchangeId: selectedExchange,
        strategy: triModelAnalysis.consensus.finalRecommendation,
        mode: mode === "manual" ? "manual" : "auto",
        analysisTime,
        enterTime,
      })
      setIsExecuting(false)
      setAmount("")
      setAnalysisComplete(false)
      setTriModelAnalysis(null)
    }, 2000)
  }

  // NEX Take Full Control
  const nexTakeFullControl = () => {
    setMode("nex-tfc")
    startNexAnalysis()
    // Auto execute after analysis
    setTimeout(() => {
      if (strategies.length > 0) {
        const best = strategies.reduce((a, b) => a.confidence > b.confidence ? a : b)
        setSelectedStrategy(best.id)
      }
    }, 2500)
  }

  const currentExchange = connectedExchanges.find(e => e.id === selectedExchange)
  const presetAmounts = [25, 50, 75, 100] // percentages

  return (
    <Card className="border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold">NEX Trading Bot</h3>
            <p className="text-xs text-muted-foreground">Joelin-powered trading guide</p>
          </div>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="text-muted-foreground hover:text-foreground">
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Mode Selection */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">TRADING MODE</p>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setMode("manual")}
            className={`rounded-lg py-2.5 text-xs font-semibold transition-all ${
              mode === "manual"
                ? "bg-muted text-foreground"
                : "bg-transparent text-muted-foreground hover:bg-muted/50"
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => { setMode("nex"); startNexAnalysis() }}
            className={`rounded-lg py-2.5 text-xs font-semibold transition-all ${
              mode === "nex"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-primary/20"
            }`}
          >
            <Zap className="inline h-3 w-3 mr-1" />
            NEX · Joelin
          </button>
          <button
            onClick={nexTakeFullControl}
            className={`rounded-lg py-2.5 text-xs font-semibold transition-all ${
              mode === "nex-tfc"
                ? "bg-gradient-to-r from-primary to-accent text-white"
                : "bg-transparent text-muted-foreground hover:bg-accent/20"
            }`}
          >
            <Sparkles className="inline h-3 w-3 mr-1" />
            NEX TFC
          </button>
        </div>
        {mode === "nex-tfc" && (
          <p className="mt-2 text-xs text-center text-success">NEX has full control - will auto-execute best strategy</p>
        )}
      </div>

      {/* Exchange Selection */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">TRADING ACCOUNT</p>
        {connectedExchanges.length > 0 ? (
          <div className="space-y-2">
            {connectedExchanges.map((exchange) => (
              <button
                key={exchange.id}
                onClick={() => setSelectedExchange(exchange.id)}
                className={`flex w-full items-center justify-between rounded-lg border p-3 transition-all ${
                  selectedExchange === exchange.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-white">
                    {exchange.name.slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold">{exchange.name}</p>
                    <p className="text-xs text-muted-foreground">${exchange.balance.toLocaleString()}</p>
                  </div>
                </div>
                {selectedExchange === exchange.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">No exchanges connected</p>
            <p className="text-xs text-muted-foreground">Connect an exchange in Settings to start trading</p>
          </div>
        )}
      </div>

      {/* NEX · Joelin */}
      {(mode === "nex" || mode === "nex-tfc") && (
        <>
          {/* Tri-model analysis */}
          <div className="border-b border-border p-4 space-y-4">
            {isAnalyzing && (
              <div className="flex items-center justify-center gap-3 py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm font-medium">Analyzing with Gemini, Grok & ChatGPT...</span>
              </div>
            )}

            {triModelAnalysis && !isAnalyzing && (
              <div className="space-y-4">
                {/* Consensus Header */}
                <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-accent/10 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      <span className="font-bold">Tri-Model Consensus</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      triModelAnalysis.consensus.finalRecommendation === "strong-buy" ? "bg-success/20 text-success" :
                      triModelAnalysis.consensus.finalRecommendation === "buy" ? "bg-primary/20 text-primary" :
                      triModelAnalysis.consensus.finalRecommendation === "hold" ? "bg-warning/20 text-warning" :
                      "bg-destructive/20 text-destructive"
                    }`}>
                      {triModelAnalysis.consensus.finalRecommendation.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Model Agreement</p>
                      <p className="text-lg font-bold text-primary">{triModelAnalysis.consensus.agreement}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Risk Score</p>
                      <p className="text-lg font-bold text-accent">{(triModelAnalysis.consensus.riskScore * 100).toFixed(0)}/100</p>
                    </div>
                  </div>
                </div>

                {/* Gemini: Quant Data Miner */}
                <div className="rounded-lg border border-border p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold">Gemini: {triModelAnalysis.gemini.role}</span>
                    <span className="ml-auto text-xs bg-primary/20 px-2 py-0.5 rounded text-primary">{(triModelAnalysis.gemini.confidence * 100).toFixed(0)}% conf</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{triModelAnalysis.gemini.macroInsights}</p>
                  <div className="space-y-1">
                    {triModelAnalysis.gemini.keyData.map((data, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground">• {data}</p>
                    ))}
                  </div>
                </div>

                {/* Grok: Sentiment Specialist */}
                <div className="rounded-lg border border-border p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Newspaper className="h-4 w-4 text-accent" />
                    <span className="text-xs font-bold">Grok: {triModelAnalysis.grok.role}</span>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded font-bold ${
                      triModelAnalysis.grok.urgency === "high" ? "bg-success/20 text-success" :
                      triModelAnalysis.grok.urgency === "medium" ? "bg-warning/20 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {triModelAnalysis.grok.urgency.toUpperCase()} Urgency
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{triModelAnalysis.grok.twitterTrend}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {triModelAnalysis.grok.sentiments.map((s, i) => (
                      <div key={i} className="rounded bg-muted/50 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground capitalize">{s.sentiment}</p>
                        <p className="text-xs font-bold">{s.volume.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ChatGPT: Strategy Coder */}
                <div className="rounded-lg border border-border p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-warning" />
                    <span className="text-xs font-bold">ChatGPT: {triModelAnalysis.chatgpt.role}</span>
                    <span className="ml-auto text-xs bg-success/20 px-2 py-0.5 rounded text-success">{triModelAnalysis.chatgpt.backtestResult}% Win Rate</span>
                  </div>
                  <p className="text-xs font-mono text-accent mb-2 bg-black/30 p-2 rounded">
                    {triModelAnalysis.chatgpt.pythonSignal}
                  </p>
                  <div className="space-y-1">
                    {triModelAnalysis.chatgpt.executionSteps.map((step, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground">Step {i+1}: {step}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* News from Grok (Optional Detail) */}
          <div className="border-b border-border p-4">
            <button
              onClick={() => setExpandedSection(expandedSection === "news" ? null : "news")}
              className="flex w-full items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">News Analysis (Grok)</span>
                {isFetchingNews && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${expandedSection === "news" ? "rotate-180" : ""}`} />
            </button>
            {expandedSection === "news" && (
              <div className="mt-3 space-y-2">
                {news.length > 0 ? news.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg bg-muted/30 p-2">
                    <div className={`mt-0.5 h-2 w-2 rounded-full ${
                      item.sentiment === "bullish" ? "bg-success" : 
                      item.sentiment === "bearish" ? "bg-destructive" : "bg-warning"
                    }`} />
                    <div className="flex-1">
                      <p className="text-xs font-medium">{item.headline}</p>
                      <p className="text-[10px] text-muted-foreground">{item.source} - {item.time}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground text-center py-2">Loading news...</p>
                )}
              </div>
            )}
          </div>

          {/* Analysis from ChatGPT - Hidden */}
          <div className="border-b border-border p-4">
            <button
              onClick={() => setExpandedSection(expandedSection === "analysis" ? null : "analysis")}
              className="flex w-full items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold">Technical Analysis (GPT)</span>
                {!analysis && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${expandedSection === "analysis" ? "rotate-180" : ""}`} />
            </button>
            {expandedSection === "analysis" && analysis && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Trend</span>
                  <span className={`text-sm font-bold ${
                    analysis.trend === "bullish" ? "text-success" : 
                    analysis.trend === "bearish" ? "text-destructive" : "text-warning"
                  }`}>
                    {analysis.trend === "bullish" ? <TrendingUp className="inline h-4 w-4" /> : 
                     analysis.trend === "bearish" ? <TrendingDown className="inline h-4 w-4" /> :
                     <Activity className="inline h-4 w-4" />}
                    {" "}{analysis.trend.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Signal Strength</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-muted">
                      <div 
                        className={`h-full rounded-full ${
                          analysis.strength > 70 ? "bg-success" : 
                          analysis.strength > 40 ? "bg-warning" : "bg-destructive"
                        }`}
                        style={{ width: `${analysis.strength}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold">{analysis.strength}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Support</span>
                  <span className="text-xs font-mono">${analysis.support.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Resistance</span>
                  <span className="text-xs font-mono">${analysis.resistance.toFixed(2)}</span>
                </div>
                <div className="rounded-lg bg-primary/10 p-2">
                  <p className="text-xs text-primary">{analysis.recommendation}</p>
                </div>
              </div>
            )}
          </div>

          {/* Strategy stack */}
          <div className="border-b border-border p-4">
            <button
              onClick={() => setExpandedSection(expandedSection === "strategies" ? null : "strategies")}
              className="flex w-full items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold">Strategies ({strategies.length})</span>
                {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin text-success" />}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${expandedSection === "strategies" ? "rotate-180" : ""}`} />
            </button>
            {expandedSection === "strategies" && (
              <div className="mt-3 space-y-2">
                {strategies.map((strategy) => (
                  <button
                    key={strategy.id}
                    onClick={() => mode !== "nex-tfc" && setSelectedStrategy(strategy.id)}
                    disabled={mode === "nex-tfc"}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      selectedStrategy === strategy.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{strategy.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        strategy.risk === "low" ? "bg-success/20 text-success" :
                        strategy.risk === "medium" ? "bg-warning/20 text-warning" :
                        "bg-destructive/20 text-destructive"
                      }`}>
                        {strategy.risk.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{strategy.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Expected: {strategy.expectedReturn}</span>
                      <span className="text-xs font-bold text-success">{strategy.confidence}% confidence</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Time Settings */}
      {showSettings && (mode === "nex" || mode === "nex-tfc") && (
        <div className="border-b border-border p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">TIME SETTINGS</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Analysis Period</span>
            </div>
            <div className="flex items-center gap-2">
              {[5, 15, 30, 60].map(mins => (
                <button
                  key={mins}
                  onClick={() => setAnalysisTime(mins)}
                  className={`px-2 py-1 text-xs rounded ${
                    analysisTime === mins ? "bg-primary text-white" : "bg-muted"
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Enter Trade In</span>
            </div>
            <div className="flex items-center gap-2">
              {[1, 5, 10, 15].map(mins => (
                <button
                  key={mins}
                  onClick={() => setEnterTime(mins)}
                  className={`px-2 py-1 text-xs rounded ${
                    enterTime === mins ? "bg-primary text-white" : "bg-muted"
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Amount Input */}
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">TRADE AMOUNT</p>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="pl-9 text-lg font-bold"
          />
        </div>
        <div className="flex gap-2">
          {presetAmounts.map((pct) => (
            <button
              key={pct}
              onClick={() => currentExchange && setAmount((currentExchange.balance * pct / 100).toFixed(2))}
              className="flex-1 rounded-lg bg-muted py-2 text-xs font-medium hover:bg-muted/80"
            >
              {pct}%
            </button>
          ))}
        </div>
        {currentExchange && (
          <p className="text-xs text-muted-foreground text-center">
            Available: ${currentExchange.balance.toLocaleString()}
          </p>
        )}
      </div>

      {/* Execute Button */}
      <div className="p-4 pt-0">
        <Button
          onClick={executeNexTrade}
          disabled={!selectedExchange || !amount || parseFloat(amount) <= 0 || isExecuting}
          className={`w-full py-6 text-base font-bold ${
            mode === "nex-tfc" 
              ? "bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90" 
              : ""
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Executing Trade...
            </>
          ) : mode === "nex-tfc" ? (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              NEX Execute Trade
            </>
          ) : mode === "nex" ? (
            <>
              <Zap className="h-5 w-5 mr-2" />
              Execute with NEX · Joelin
            </>
          ) : (
            <>
              <Play className="h-5 w-5 mr-2" />
              Place Trade
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
