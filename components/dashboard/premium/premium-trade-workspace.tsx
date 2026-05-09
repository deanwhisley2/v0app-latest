"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Lock,
  BookOpen,
  GraduationCap,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from "lucide-react"
import type { Coin } from "@/lib/coins-data"
import { NewsSection } from "@/components/dashboard/news-section"
import { NexTradingBot, type TradeParams } from "@/components/dashboard/nex-trading-bot"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartDrawingToolbar, type DrawingToolId } from "./chart-drawing-toolbar"
import { PremiumOrderBook } from "./premium-order-book"
import { PremiumOrderDeck } from "./premium-order-deck"
import { DEFAULT_CHART_TYPE, type ChartTypeId } from "@/lib/chart-types"
import { ChartTypeMenu } from "./chart-type-menu"
import {
  ProLightweightChart,
  type ProLightweightChartHandle,
} from "./pro-lightweight-chart"
import { StudyDrawingCanvas } from "./study-drawing-canvas"
import { SymbolBrowserPanel } from "./symbol-browser-panel"
import { TradingPairHero } from "./trading-pair-hero"
import { cn } from "@/lib/utils"

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "5D", "1W", "1M"] as const

type ConnectedEx = { id: string; name: string; balance: number; isDefault?: boolean; frozen?: boolean }

export type PremiumTradeWorkspaceProps = {
  selectedCoin: Coin
  tradeCatalog: Coin[]
  onCoinSelect: (symbol: string) => void
  onOrder: (type: "buy" | "sell", amount: number, leverage: number) => void
  connectedExchanges: ConnectedEx[]
  onNexExecute: (params: TradeParams) => void
  chartOverlay?: React.ReactNode
  advancedTradingLocked?: boolean
}

export function PremiumTradeWorkspace({
  selectedCoin,
  tradeCatalog,
  onCoinSelect,
  onOrder,
  connectedExchanges,
  onNexExecute,
  chartOverlay,
  advancedTradingLocked = false,
}: PremiumTradeWorkspaceProps) {
  const [interval, setInterval] = useState<(typeof TIMEFRAMES)[number]>("1H")
  const [chartTypeId, setChartTypeId] = useState<ChartTypeId>(DEFAULT_CHART_TYPE)
  const [lineBreakLines, setLineBreakLines] = useState(3)
  const [drawingTool, setDrawingTool] = useState<DrawingToolId>("cursor")
  const [bottomTab, setBottomTab] = useState<"news" | "info">("news")
  const [pairBrowserOpen, setPairBrowserOpen] = useState(false)

  const chartCardRef = useRef<HTMLDivElement>(null)
  const chartLiveRef = useRef<ProLightweightChartHandle>(null)
  const [chartFullscreen, setChartFullscreen] = useState(false)
  const [studyMode, setStudyMode] = useState(false)
  const [studySnapshotUrl, setStudySnapshotUrl] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      const el = chartCardRef.current
      const active = !!el && document.fullscreenElement === el
      setChartFullscreen(active)
      if (!active) {
        setStudyMode(false)
        setStudySnapshotUrl(null)
      }
    }
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  useEffect(() => {
    setStudyMode(false)
    setStudySnapshotUrl(null)
  }, [selectedCoin.symbol, interval])

  const toggleChartFullscreen = useCallback(async () => {
    const el = chartCardRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) await el.requestFullscreen()
      else await document.exitFullscreen()
    } catch {
      /* ignore */
    }
  }, [])

  const exitStudyMode = useCallback(() => {
    setStudyMode(false)
    setStudySnapshotUrl(null)
  }, [])

  const pauseStudyLive = useCallback(() => {
    const url = chartLiveRef.current?.captureToDataURL()
    if (url) setStudySnapshotUrl(url)
  }, [])

  const resumeStudyLive = useCallback(() => {
    setStudySnapshotUrl(null)
  }, [])

  const quick = tradeCatalog.slice(0, 8).map((c) => c.symbol)
  const symbols = quick.length >= 4 ? quick : ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX"]

  const consumeDrawing = useCallback(() => {
    setDrawingTool("cursor")
  }, [])

  return (
    <div className="space-y-4">
      <TradingPairHero
        coin={selectedCoin}
        quoteVolume={selectedCoin.volume}
        onPickSymbol={onCoinSelect}
        quickSymbols={symbols}
      />

      {advancedTradingLocked ? (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-warning/20 p-2">
              <Lock className="h-4 w-4 text-warning" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warning">Advanced Trade Deck is locked</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Pairs, timeframes, candles and order book unlock at higher user levels.
              </p>
              <p className="mt-2 rounded-md border border-border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
                Locked preview: Pairs | 1m 5m 15m 30m 1H 4H 1D 5D 1W 1M | Candles | Order book
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] xl:items-stretch">
          {/* Chart column */}
          <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:flex-row">
            <div className="hidden shrink-0 lg:block">
              <ChartDrawingToolbar activeTool={drawingTool} onToolChange={setDrawingTool} vertical />
            </div>

            <div
              ref={chartCardRef}
              className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#050608] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
            <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPairBrowserOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 hover:text-white"
                  aria-expanded={pairBrowserOpen}
                  aria-haspopup="dialog"
                >
                  <LayoutGrid className="h-3.5 w-3.5 opacity-90" aria-hidden />
                  Pairs
                </button>
                <div className="scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setInterval(tf)}
                      className={cn(
                        "shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors",
                        interval === tf
                          ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/35"
                          : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={toggleChartFullscreen}
                  title={chartFullscreen ? "Exit full screen" : "Full screen chart"}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 text-[11px] font-semibold text-zinc-200 transition-all duration-200 hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-100"
                >
                  {chartFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span className="hidden sm:inline">{chartFullscreen ? "Exit" : "Full"}</span>
                </button>
                {chartFullscreen && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudyMode((v) => !v)
                      setStudySnapshotUrl(null)
                    }}
                    title={studyMode ? "Leave study mode" : "Study mode"}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-all duration-300",
                      studyMode
                        ? "border-violet-400/40 bg-violet-500/20 text-violet-100 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                        : "border-white/[0.1] bg-white/[0.04] text-zinc-200 hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-violet-100"
                    )}
                  >
                    <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Study</span>
                  </button>
                )}
                <ChartTypeMenu
                  value={chartTypeId}
                  onChange={setChartTypeId}
                  lineBreakLines={lineBreakLines}
                  onLineBreakLinesChange={setLineBreakLines}
                />
              </div>
            </div>

            <div className="lg:hidden border-b border-white/[0.06] px-2 py-2">
              <ChartDrawingToolbar activeTool={drawingTool} onToolChange={setDrawingTool} vertical={false} />
            </div>

            <div className="relative min-h-0 flex-1 p-2 sm:p-3">
              <SymbolBrowserPanel
                open={pairBrowserOpen}
                onClose={() => setPairBrowserOpen(false)}
                catalog={tradeCatalog}
                selectedSymbol={selectedCoin.symbol}
                onSelect={onCoinSelect}
              />

              {chartFullscreen && studyMode && !studySnapshotUrl && (
                <div
                  className="pointer-events-none absolute inset-2 z-[5] rounded-xl bg-gradient-to-b from-slate-950/30 via-slate-900/40 to-slate-950/50 shadow-[inset_0_0_100px_rgba(6,182,212,0.08)] backdrop-blur-[4px] animate-in fade-in duration-500"
                  aria-hidden
                />
              )}

              {chartFullscreen && studyMode && (
                <div className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-wrap items-center justify-end gap-2 sm:right-4 sm:top-4">
                  {!studySnapshotUrl ? (
                    <button
                      type="button"
                      onClick={pauseStudyLive}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-100 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-amber-500/25"
                    >
                      <Pause className="h-3.5 w-3.5" aria-hidden />
                      Pause live
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={resumeStudyLive}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-100 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-emerald-500/25"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden />
                      Resume live
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={exitStudyMode}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-[11px] font-semibold text-zinc-100 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/10"
                  >
                    <BookOpen className="h-3.5 w-3.5 opacity-80" aria-hidden />
                    Exit study
                  </button>
                </div>
              )}

              {studySnapshotUrl ? (
                <div className="relative z-0 flex min-h-[360px] h-[min(56vh,720px)] w-full flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#06080b] shadow-inner">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={studySnapshotUrl}
                    alt="Frozen chart frame for study annotations"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <StudyDrawingCanvas />
                </div>
              ) : (
                <ProLightweightChart
                  ref={chartLiveRef}
                  className="relative z-0"
                  symbol={selectedCoin.symbol}
                  basePrice={selectedCoin.price}
                  chartTypeId={chartTypeId}
                  lineBreakLines={lineBreakLines}
                  interval={interval}
                  drawingTool={drawingTool}
                  onDrawingConsumed={consumeDrawing}
                />
              )}
              {chartOverlay}
            </div>
            </div>
          </div>

          <div className="min-h-[320px] xl:min-h-0">
            <PremiumOrderBook coin={selectedCoin} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          {connectedExchanges.length > 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#07090d] p-3">
              <NexTradingBot
                selectedCoin={selectedCoin}
                connectedExchanges={connectedExchanges}
                onExecuteTrade={onNexExecute}
              />
            </div>
          ) : (
            <PremiumOrderDeck coin={selectedCoin} onOrder={onOrder} />
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#07090d]">
          <Tabs value={bottomTab} onValueChange={(v) => setBottomTab(v as "news" | "info")}>
            <TabsList className="h-11 w-full justify-start rounded-none border-b border-white/[0.06] bg-transparent p-0 px-3">
              <TabsTrigger
                value="news"
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-xs font-semibold uppercase tracking-wide data-[state=active]:border-cyan-500 data-[state=active]:bg-transparent data-[state=active]:text-cyan-200"
              >
                News
              </TabsTrigger>
              <TabsTrigger
                value="info"
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-xs font-semibold uppercase tracking-wide data-[state=active]:border-cyan-500 data-[state=active]:bg-transparent data-[state=active]:text-cyan-200"
              >
                Market info
              </TabsTrigger>
            </TabsList>
            <TabsContent value="news" className="m-0 p-3 pt-0">
              <NewsSection />
            </TabsContent>
            <TabsContent value="info" className="m-0 space-y-2 p-4 text-sm text-zinc-400">
              <p>
                Live spot data loads from Binance public endpoints when available. Order book and ladder
                values shown here are illustrative for UI layout.
              </p>
              <p className="text-xs text-zinc-500">
                Drawing tools: Fibonacci and horizontal lines attach to the active series; erase clears overlays.
                Trend adds a two-point guide line.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
