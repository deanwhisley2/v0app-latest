"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, BarChart3, CandlestickChart, ChevronDown, ChevronUp, Circle, Eraser, Eye, EyeOff,
  Layout, LayoutDashboard, Layers, LineChart, Maximize2, Minimize2, Move, Paintbrush, PanelRight,
  Pencil, Plus, Save, Settings, Square, Trash2, TrendingUp, Type, Undo2, Redo2, Download, Upload,
  AlertTriangle, Check, X, Search, Star, Bookmark, Lightbulb, Zap, ArrowUpRight, ArrowDownRight,
  Minus, MoreHorizontal, Clock, Activity, RefreshCw, Play, Pause, Sparkles, Gauge, Target,
  Crosshair, Ruler, MessageSquare, Hash, Bolt, StickyNote, Palette, SlidersHorizontal,
  Sun, Moon, Monitor, Text, Columns2, Columns3, PanelLeft, PanelRightOpen, PanelRightClose,
  List, Grid, SplitSquareHorizontal, SplitSquareVertical, Maximize, Minimize, ZoomIn, ZoomOut,
  Hand, Pointer, MousePointerClick, MousePointer2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getBinanceKlines, getBinancePrice, getBinanceDepth, getBinance24hr } from "@/lib/binance-api"
import { detectPatterns, PATTERN_NAMES, PATTERN_EMOJIS } from "@/lib/candle-patterns"
import type { Candle, ChartLayoutType, ChartStyle, Timeframe, Drawing, DrawingTool, DrawingColor, DrawingPoint, IndicatorConfig, ChartConfig, WorkspacePreset, UserPreferences, PatternAlert, TradingAsset } from "@/lib/trading-workspace-types"
import { CHART_LAYOUTS, CHART_STYLES, TIMEFRAMES, DRAWING_TOOLS, DRAWING_COLORS, DEFAULT_ASSETS, BUILT_IN_PRESETS, DEFAULT_PREFERENCES } from "@/lib/trading-workspace-types"

// ============================================================
// Chart Canvas Component
// ============================================================
interface ChartCanvasProps {
  chartConfig: ChartConfig
  candles: Candle[]
  width: number
  height: number
  teachMode: boolean
  activeDrawingTool: DrawingTool | null
  drawingColor: DrawingColor
  drawingThickness: number
  drawings: Drawing[]
  onDrawingsChange: (drawings: Drawing[]) => void
  preferences: UserPreferences
  patternAlerts: PatternAlert[]
  indicators: IndicatorConfig[]
}

function ChartCanvas({
  chartConfig, candles, width, height, teachMode, activeDrawingTool, drawingColor,
  drawingThickness, drawings, onDrawingsChange, preferences, patternAlerts, indicators,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<DrawingPoint[]>([])
  const [hoveredCandle, setHoveredCandle] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null)
  const [draggingDrawing, setDraggingDrawing] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [showOHLC, setShowOHLC] = useState(false)
  const [ohlcData, setOhlcData] = useState<Candle | null>(null)

  const padding = { top: 20, right: 20, bottom: 40, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const priceRange = useMemo(() => {
    if (candles.length === 0) return { min: 0, max: 100, range: 100 }
    const min = Math.min(...candles.map(c => c.low))
    const max = Math.max(...candles.map(c => c.high))
    const pad = (max - min) * 0.1 || max * 0.01
    return { min: min - pad, max: max + pad, range: max - min + pad * 2 }
  }, [candles])

  const priceToY = useCallback((price: number) =>
    padding.top + chartHeight - ((price - priceRange.min) / priceRange.range) * chartHeight,
    [priceRange, chartHeight])

  const indexToX = useCallback((index: number) => {
    const cw = chartWidth / Math.max(candles.length, 1)
    return padding.left + index * cw + cw / 2
  }, [chartWidth, candles.length])

  const xToIndex = useCallback((x: number) => {
    const cw = chartWidth / Math.max(candles.length, 1)
    return Math.floor((x - padding.left) / cw)
  }, [chartWidth, candles.length])

  // Main chart render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(0, 0, width, height)

    // Grid
    if (preferences.showGridLines) {
      ctx.strokeStyle = "#2a2a3e"
      ctx.lineWidth = 0.5
      for (let i = 0; i <= 10; i++) {
        const y = padding.top + (chartHeight / 10) * i
        ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke()
        const price = priceRange.max - (priceRange.range / 10) * i
        ctx.fillStyle = "#666"; ctx.font = "10px monospace"; ctx.textAlign = "right"
        ctx.fillText(price.toFixed(2), padding.left - 5, y + 3)
      }
      const step = Math.max(1, Math.floor(candles.length / 10))
      for (let i = 0; i < candles.length; i += step) {
        const x = indexToX(i)
        ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, height - padding.bottom); ctx.stroke()
        const date = new Date(candles[i].time)
        const ts = ["1d","1w"].includes(chartConfig.timeframe)
          ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
        ctx.fillStyle = "#666"; ctx.font = "10px monospace"; ctx.textAlign = "center"
        ctx.fillText(ts, x, height - padding.bottom + 15)
      }
    }

    // Candles
    const cw = Math.max(2, chartWidth / candles.length - 1)
    const hc = cw / 2
    candles.forEach((candle, i) => {
      const x = indexToX(i) - hc
      const oy = priceToY(candle.open), cy = priceToY(candle.close)
      const hy = priceToY(candle.high), ly = priceToY(candle.low)
      const bullish = candle.close >= candle.open
      const bt = Math.min(oy, cy), bh = Math.max(1, Math.abs(cy - oy))
      const bc = chartConfig.candleColors.bullish, rc = chartConfig.candleColors.bearish
      if (chartConfig.candleColors.showWicks) {
        ctx.strokeStyle = chartConfig.candleColors.wickColor; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + hc, hy); ctx.lineTo(x + hc, ly); ctx.stroke()
      }
      ctx.fillStyle = bullish ? bc : rc
      ctx.fillRect(x, bt, cw, bh)
      if (chartConfig.candleColors.showBorders) {
        ctx.strokeStyle = bullish ? bc : rc; ctx.lineWidth = chartConfig.candleColors.borderThickness
        ctx.strokeRect(x, bt, cw, bh)
      }
      if (chartConfig.volumeEnabled && preferences.showVolume) {
        const mv = Math.max(...candles.map(c => c.volume))
        ctx.fillStyle = bullish ? bc + "40" : rc + "40"
        ctx.fillRect(x, height - padding.bottom + 5, cw, (candle.volume / mv) * 30)
      }
    })

    // Indicators
    indicators.forEach(ind => {
      if (!ind.enabled) return
      if (ind.type === "ma" || ind.type === "ema") {
        (ind.maPeriods || [20]).forEach(period => {
          const vals: (number | null)[] = []
          for (let i = 0; i < candles.length; i++) {
            if (i < period - 1) { vals.push(null); continue }
            let sum = 0; for (let j = 0; j < period; j++) sum += candles[i - j].close
            vals.push(sum / period)
          }
          ctx.strokeStyle = ind.color || "#3b82f6"; ctx.lineWidth = 1.5
          ctx.beginPath()
          vals.forEach((v, i) => {
            if (v === null) return
            const x = indexToX(i), y = priceToY(v)
            if (i === vals.findIndex(vv => vv !== null)) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          })
          ctx.stroke()
          if (preferences.showIndicatorLabels && vals[vals.length - 1] !== null) {
            ctx.fillStyle = ind.color || "#3b82f6"; ctx.font = "10px monospace"; ctx.textAlign = "left"
            ctx.fillText(ind.type.toUpperCase() + "(" + period + "): " + vals[vals.length - 1]!.toFixed(2), padding.left + 5, padding.top + 15)
          }
        })
      }
      if (ind.type === "bollinger") {
        const period = ind.bbPeriod || 20, sd = ind.bbStdDev || 2
        const upper: (number | null)[] = [], lower: (number | null)[] = []
        for (let i = 0; i < candles.length; i++) {
          if (i < period - 1) { upper.push(null); lower.push(null); continue }
          let sum = 0; for (let j = 0; j < period; j++) sum += candles[i - j].close
          const avg = sum / period
          let variance = 0; for (let j = 0; j < period; j++) variance += Math.pow(candles[i - j].close - avg, 2)
          const std = Math.sqrt(variance / period)
          upper.push(avg + std * sd); lower.push(avg - std * sd)
        }
        ctx.strokeStyle = ind.color || "#a855f7"; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
        ctx.beginPath()
        upper.forEach((v, i) => { if (v === null) return; const x = indexToX(i), y = priceToY(v); if (i === upper.findIndex(vv => vv !== null)) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
        ctx.stroke(); ctx.setLineDash([])
        ctx.beginPath()
        lower.forEach((v, i) => { if (v === null) return; const x = indexToX(i), y = priceToY(v); if (i === lower.findIndex(vv => vv !== null)) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
        ctx.stroke(); ctx.setLineDash([])
      }
    })

    // Pattern markers
    patternAlerts.forEach(alert => {
      const ci = candles.findIndex(c => c.time === alert.timestamp)
      if (ci === -1) return
      ctx.fillStyle = "#eab308"; ctx.font = "16px sans-serif"; ctx.textAlign = "center"
      ctx.fillText("🔔", indexToX(ci), priceToY(alert.price) - 15)
    })

    // Crosshair
    if (preferences.crosshairEnabled && hoveredCandle !== null && hoveredCandle >= 0 && hoveredCandle < candles.length) {
      const candle = candles[hoveredCandle]
      const x = indexToX(hoveredCandle), y = priceToY(candle.close)
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, height - padding.bottom); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = "#fff"; ctx.font = "11px monospace"; ctx.textAlign = "left"
      ctx.fillText(candle.close.toFixed(2), width - padding.right + 5, y + 3)
      ctx.fillText(new Date(candle.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }), x - 20, height - padding.bottom + 30)
    }

    // OHLC box
    if (showOHLC && ohlcData) {
      ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(10, 10, 160, 90)
      ctx.strokeStyle = "#444"; ctx.lineWidth = 1; ctx.strokeRect(10, 10, 160, 90)
      ctx.fillStyle = "#fff"; ctx.font = "10px monospace"; ctx.textAlign = "left"
      ctx.fillText("O: " + ohlcData.open.toFixed(2), 15, 25)
      ctx.fillText("H: " + ohlcData.high.toFixed(2), 15, 40)
      ctx.fillText("L: " + ohlcData.low.toFixed(2), 15, 55)
      ctx.fillText("C: " + ohlcData.close.toFixed(2), 15, 70)
      ctx.fillText("V: " + ohlcData.volume.toFixed(2), 15, 85)
      if (preferences.showPercentChange) {
        const chg = ((ohlcData.close - ohlcData.open) / ohlcData.open) * 100
        ctx.fillStyle = chg >= 0 ? "#22c55e" : "#ef4444"
        ctx.fillText((chg >= 0 ? "+" : "") + chg.toFixed(2) + "%", 15, 100)
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "10px sans-serif"; ctx.textAlign = "right"
    ctx.fillText(chartConfig.symbol + " • " + chartConfig.timeframe + " • " + chartConfig.chartStyle, width - padding.right, padding.top + 10)
  }, [candles, width, height, chartConfig, priceRange, priceToY, indexToX, preferences, indicators, patternAlerts, hoveredCandle, showOHLC, ohlcData])

  // Teach mode overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !teachMode) return
    const ctx = overlay.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    overlay.width = width * dpr; overlay.height = height * dpr
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height)

    drawings.forEach(drawing => {
      const color = DRAWING_COLORS.find(c => c.name === drawing.color)?.hex || "#fff"
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = drawing.thickness
      ctx.lineCap = "round"; ctx.lineJoin = "round"
      if (drawing.id === selectedDrawing) { ctx.shadowColor = color; ctx.shadowBlur = 8 }
      switch (drawing.tool) {
        case "freehand":
          if (drawing.points.length < 2) break
          ctx.beginPath(); drawing.points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }); ctx.stroke()
          break
        case "line":
          if (drawing.points.length < 2) break
          ctx.beginPath(); ctx.moveTo(drawing.points[0].x, drawing.points[0].y); ctx.lineTo(drawing.points[1].x, drawing.points[1].y); ctx.stroke()
          break
        case "rectangle":
          if (drawing.points.length < 2) break
          const rx = Math.min(drawing.points[0].x, drawing.points[1].x), ry = Math.min(drawing.points[0].y, drawing.points[1].y)
          ctx.strokeRect(rx, ry, Math.abs(drawing.points[1].x - drawing.points[0].x), Math.abs(drawing.points[1].y - drawing.points[0].y))
          ctx.fillStyle = color + "15"; ctx.fillRect(rx, ry, Math.abs(drawing.points[1].x - drawing.points[0].x), Math.abs(drawing.points[1].y - drawing.points[0].y))
          break
        case "circle":
          if (drawing.points.length < 2) break
          const cx = drawing.points[0].x, cy = drawing.points[0].y
          const cr = Math.sqrt(Math.pow(drawing.points[1].x - cx, 2) + Math.pow(drawing.points[1].y - cy, 2))
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = color + "15"; ctx.fill()
          break
        case "arrow":
          if (drawing.points.length < 2) break
          const ax1 = drawing.points[0].x, ay1 = drawing.points[0].y, ax2 = drawing.points[1].x, ay2 = drawing.points[1].y
          const angle = Math.atan2(ay2 - ay1, ax2 - ax1), hl = 12
          ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(ax2, ay2)
          ctx.lineTo(ax2 - hl * Math.cos(angle - Math.PI / 6), ay2 - hl * Math.sin(angle - Math.PI / 6))
          ctx.lineTo(ax2 - hl * Math.cos(angle + Math.PI / 6), ay2 - hl * Math.sin(angle + Math.PI / 6))
          ctx.closePath(); ctx.fill()
          break
        case "text": case "sticky_note":
          if (drawing.points.length === 0) break
          const tx = drawing.points[0].x, ty = drawing.points[0].y
          if (drawing.tool === "sticky_note") { ctx.fillStyle = color + "30"; ctx.fillRect(tx - 5, ty - 12, 120, 30); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(tx - 5, ty - 12, 120, 30) }
          ctx.fillStyle = color; ctx.font = "12px sans-serif"; ctx.textAlign = "left"; ctx.fillText(drawing.text || "", tx, ty + 4)
          break
        case "number_label":
          if (drawing.points.length === 0) break
          ctx.fillStyle = color; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"
          ctx.fillText(drawing.text || "1", drawing.points[0].x, drawing.points[0].y + 5)
          break
        case "lightning_bolt":
          if (drawing.points.length === 0) break
          const lx = drawing.points[0].x, ly = drawing.points[0].y
          ctx.strokeStyle = "#eab308"; ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(lx - 5, ly - 10); ctx.lineTo(lx + 3, ly - 2); ctx.lineTo(lx - 2, ly + 2); ctx.lineTo(lx + 5, ly + 10); ctx.stroke()
          break
      }
      ctx.shadowBlur = 0
    })

    // Current drawing preview
    if (currentPoints.length > 0) {
      const color = DRAWING_COLORS.find(c => c.name === drawingColor)?.hex || "#fff"
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = drawingThickness; ctx.lineCap = "round"; ctx.lineJoin = "round"
      if (activeDrawingTool === "freehand" && currentPoints.length >= 2) {
        ctx.beginPath(); currentPoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }); ctx.stroke()
      } else if ((activeDrawingTool === "line" || activeDrawingTool === "rectangle" || activeDrawingTool === "circle" || activeDrawingTool === "arrow") && currentPoints.length === 1) {
        if (activeDrawingTool === "line") { ctx.beginPath(); ctx.moveTo(currentPoints[0].x, currentPoints[0].y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke() }
        else if (activeDrawingTool === "rectangle") { ctx.strokeRect(Math.min(currentPoints[0].x, mousePos.x), Math.min(currentPoints[0].y, mousePos.y), Math.abs(mousePos.x - currentPoints[0].x), Math.abs(mousePos.y - currentPoints[0].y)) }
        else if (activeDrawingTool === "circle") { const cx = currentPoints[0].x, cy = currentPoints[0].y, cr = Math.sqrt(Math.pow(mousePos.x - cx, 2) + Math.pow(mousePos.y - cy, 2)); ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke() }
        else if (activeDrawingTool === "arrow") { const ax1 = currentPoints[0].x, ay1 = currentPoints[0].y, ax2 = mousePos.x, ay2 = mousePos.y, angle = Math.atan2(ay2 - ay1, ax2 - ax1), hl = 12; ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ax2, ay2); ctx.lineTo(ax2 - hl * Math.cos(angle - Math.PI / 6), ay2 - hl * Math.sin(angle - Math.PI / 6)); ctx.lineTo(ax2 - hl * Math.cos(angle + Math.PI / 6), ay2 - hl * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fill() }
      }
    }
  }, [teachMode, drawings, currentPoints, activeDrawingTool, drawingColor, drawingThickness, width, height, mousePos, selectedDrawing])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    if (teachMode && activeDrawingTool) {
      setIsDrawing(true)
      if (activeDrawingTool === "freehand") setCurrentPoints([{ x, y }])
      else if (["line", "rectangle", "circle", "arrow"].includes(activeDrawingTool)) {
        if (currentPoints.length === 0) setCurrentPoints([{ x, y }])
        else { onDrawingsChange([...drawings, { id: "d-" + Date.now(), tool: activeDrawingTool, points: [...currentPoints, { x, y }], color: drawingColor, thickness: drawingThickness, createdAt: Date.now() }]); setCurrentPoints([]); setIsDrawing(false) }
      } else if (["text", "sticky_note", "number_label", "lightning_bolt"].includes(activeDrawingTool)) {
        const text = activeDrawingTool === "number_label" ? String(drawings.filter(d => d.tool === "number_label").length + 1) : activeDrawingTool === "lightning_bolt" ? "⚡" : "Type here..."
        onDrawingsChange([...drawings, { id: "d-" + Date.now(), tool: activeDrawingTool, points: [{ x, y }], color: drawingColor, thickness: drawingThickness, text, createdAt: Date.now() }])
      }
    } else {
      const clicked = drawings.find(d => d.points.length > 0 && Math.sqrt(Math.pow(x - d.points[0].x, 2) + Math.pow(y - d.points[0].y, 2)) < 10)
      if (clicked) { setSelectedDrawing(clicked.id); setDraggingDrawing(clicked.id); setDragOffset({ x: x - clicked.points[0].x, y: y - clicked.points[0].y }) }
      else { setSelectedDrawing(null); setIsPanning(true); setPanStart({ x, y }) }
    }
  }, [teachMode, activeDrawingTool, currentPoints, drawingColor, drawingThickness, drawings, onDrawingsChange])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    setMousePos({ x, y })
    const index = xToIndex(x)
    if (index >= 0 && index < candles.length) { setHoveredCandle(index); if (preferences.showOHLCOnHover) { setShowOHLC(true); setOhlcData(candles[index]) } }
    else { setHoveredCandle(null); setShowOHLC(false) }
    if (isDrawing && activeDrawingTool === "freehand") setCurrentPoints(prev => [...prev, { x, y }])
    if (draggingDrawing) {
      const drawing = drawings.find(d => d.id === draggingDrawing)
      if (drawing) {
        const dx = x - dragOffset.x - drawing.points[0].x, dy = y - dragOffset.y - drawing.points[0].y
        onDrawingsChange(drawings.map(d => d.id === draggingDrawing ? { ...d, points: d.points.map(p => ({ x: p.x + dx, y: p.y + dy })) } : d))
        setDragOffset({ x, y })
      }
    }
    if (isPanning) { setOffset(prev => prev + (x - panStart.x)); setPanStart({ x, y }) }
  }, [isDrawing, activeDrawingTool, draggingDrawing, dragOffset, isPanning, panStart, drawings, onDrawingsChange, candles, xToIndex, preferences])

  const handleMouseUp = useCallback(() => { setIsDrawing(false); setIsPanning(false); setDraggingDrawing(null) }, [])
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => { e.preventDefault(); setZoom(prev => Math.max(0.5, Math.min(5, prev + (e.deltaY > 0 ? -0.1 : 0.1)))) }, [])

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={canvasRef} width={width} height={height} className="absolute top-0 left-0"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}
        style={{ cursor: teachMode && activeDrawingTool ? "crosshair" : "default" }} />
      <canvas ref={overlayRef} width={width} height={height} className="absolute top-0 left-0 pointer-events-none" style={{ opacity: teachMode ? 1 : 0 }} />
      {teachMode && <div className="absolute top-1 left-1 bg-yellow-500/20 text-yellow-400 text-[10px] px-1 rounded">📝 Teach Mode</div>}
      {teachMode && drawings.length > 0 && <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">{drawings.length} drawings</div>}
    </div>
  )
}


// ============================================================
// MAIN PAGE COMPONENT
// ============================================================
export default function TradingWorkspacePage() {
  const router = useRouter()
  const [layout, setLayout] = useState("single")
  const [charts, setCharts] = useState([{
    id: "chart-1", symbol: "BTCUSDT", timeframe: "5m", chartStyle: "candlestick",
    indicators: [
      { type: "ma", enabled: false, maPeriods: [20, 50], color: "#3b82f6" },
      { type: "ema", enabled: false, maPeriods: [9], color: "#f97316" },
      { type: "bollinger", enabled: false, bbPeriod: 20, bbStdDev: 2, color: "#a855f7" },
      { type: "rsi", enabled: false, rsiPeriod: 14, color: "#a855f7" },
      { type: "macd", enabled: false, macdFast: 12, macdSlow: 26, macdSignal: 9 },
      { type: "volume", enabled: true },
    ],
    drawings: [],
    candleColors: { bullish: "#22c55e", bearish: "#ef4444", wickColor: "#666", showWicks: true, showBorders: true, borderThickness: 1 },
    volumeEnabled: true,
  }])
  const [candlesMap, setCandlesMap] = useState({})
  const [teachMode, setTeachMode] = useState(false)
  const [activeDrawingTool, setActiveDrawingTool] = useState(null)
  const [drawingColor, setDrawingColor] = useState("red")
  const [drawingThickness, setDrawingThickness] = useState(2)
  const [preferences, setPreferences] = useState({
    showGrid: true, showCrosshair: true, showVolume: true, showIndicators: true,
    chartStyle: "candlestick", theme: "dark", soundEnabled: false, notificationsEnabled: true,
  })
  const [patternAlerts, setPatternAlerts] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [showAssetSearch, setShowAssetSearch] = useState(false)
  const [assetSearch, setAssetSearch] = useState("")
  const [assets, setAssets] = useState([
    { symbol: "BTCUSDT", name: "Bitcoin", price: 0, change: 0 },
    { symbol: "ETHUSDT", name: "Ethereum", price: 0, change: 0 },
    { symbol: "SOLUSDT", name: "Solana", price: 0, change: 0 },
    { symbol: "BNBUSDT", name: "BNB", price: 0, change: 0 },
    { symbol: "XRPUSDT", name: "Ripple", price: 0, change: 0 },
  ])
  const [currentPrice, setCurrentPrice] = useState(0)
  const [priceChange, setPriceChange] = useState(0)
  const [priceChangePercent, setPriceChangePercent] = useState(0)
  const [highPrice, setHighPrice] = useState(0)
  const [lowPrice, setLowPrice] = useState(0)
  const [volume, setVolume] = useState(0)
  const [isLive, setIsLive] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [activeRightTab, setActiveRightTab] = useState("orders")
  const [fullscreen, setFullscreen] = useState(false)
  const chartContainerRef = useRef(null)
  const [chartSize, setChartSize] = useState({ width: 800, height: 500 })
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] })
  const [showOrderBook, setShowOrderBook] = useState(true)
  const [showTradePanel, setShowTradePanel] = useState(true)
  const [showWatchlist, setShowWatchlist] = useState(true)
  const [showToolbar, setShowToolbar] = useState(true)
  const [showStatusBar, setShowStatusBar] = useState(true)
  const [theme, setTheme] = useState("dark")

  // Fetch market data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [priceRes, klinesRes, depthRes, tickerRes] = await Promise.all([
          fetch("/api/binance?endpoint=/api/v3/ticker/price&symbol=BTCUSDT"),
          fetch("/api/binance?endpoint=/api/v3/klines&symbol=BTCUSDT&interval=1m&limit=100"),
          fetch("/api/binance?endpoint=/api/v3/depth&symbol=BTCUSDT&limit=50"),
          fetch("/api/binance?endpoint=/api/v3/ticker/24hr&symbol=BTCUSDT"),
        ])
        const priceData = await priceRes.json()
        const klinesData = await klinesRes.json()
        const depthData = await depthRes.json()
        const tickerData = await tickerRes.json()

        setCurrentPrice(parseFloat(priceData.price))
        setPriceChange(parseFloat(tickerData.priceChange))
        setPriceChangePercent(parseFloat(tickerData.priceChangePercent))
        setHighPrice(parseFloat(tickerData.highPrice))
        setLowPrice(parseFloat(tickerData.lowPrice))
        setVolume(parseFloat(tickerData.volume))

        const candles = klinesData.map(k => ({
          time: k[0] / 1000,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }))
        setCandlesMap({ "chart-1": candles })

        const bids = depthData.bids.slice(0, 20).map(b => [b[0], b[1]])
        const asks = depthData.asks.slice(0, 20).map(a => [a[0], a[1]])
        setOrderBook({ bids, asks })
        setLastUpdate(new Date())
      } catch (err) {
        console.error("Failed to fetch market data:", err)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  // Update asset prices
  useEffect(() => {
    const updateAssets = async () => {
      try {
        const symbols = assets.map(a => a.symbol).join(",")
        const res = await fetch("/api/binance?endpoint=/api/v3/ticker/24hr&symbols=" + encodeURIComponent("[" + symbols.split(",").map(s => '"' + s + '"').join(",") + "]"))
        const data = await res.json()
        if (Array.isArray(data)) {
          setAssets(prev => prev.map(a => {
            const ticker = data.find(t => t.symbol === a.symbol)
            return ticker ? { ...a, price: parseFloat(ticker.lastPrice), change: parseFloat(ticker.priceChangePercent) } : a
          }))
        }
      } catch (err) {
        console.error("Failed to update assets:", err)
      }
    }
    updateAssets()
  }, [])

  // Resize observer
  useEffect(() => {
    if (!chartContainerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setChartSize({ width: Math.floor(width), height: Math.floor(height) })
      }
    })
    observer.observe(chartContainerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-emerald-400">NEX</span>
            <span className="text-xs text-zinc-500">Trading Workspace</span>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-1">
            <Badge variant={isLive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
              {isLive ? "● LIVE" : "PAUSED"}
            </Badge>
            <span className="text-xs text-zinc-500">{lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowToolbar(!showToolbar)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowRightPanel(!showRightPanel)}>
            {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings(true)}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          {showToolbar && (
            <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800 bg-zinc-900/30 shrink-0 overflow-x-auto">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAssetSearch(true)}>
                <Search className="h-3 w-3 mr-1" /> BTCUSDT
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">1m</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 bg-zinc-800">5m</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">15m</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">1h</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">4h</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">1d</Button>
              <Separator orientation="vertical" className="h-4" />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <CandlestickChart className="h-3 w-3 mr-1" /> Candle
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <LineChart className="h-3 w-3 mr-1" /> Line
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Activity className="h-3 w-3 mr-1" /> Indicators
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Pencil className="h-3 w-3 mr-1" /> Draw
              </Button>
              <Button variant="ghost" size="sm" className={"h-6 text-[10px] px-2 " + (teachMode ? "bg-yellow-500/20 text-yellow-400" : "")} onClick={() => setTeachMode(!teachMode)}>
                <Lightbulb className="h-3 w-3 mr-1" /> Teach
              </Button>
            </div>
          )}

          {/* Chart */}
          <div ref={chartContainerRef} className="flex-1 relative">
            {candlesMap["chart-1"] && candlesMap["chart-1"].length > 0 ? (
              <ChartComponent
                candles={candlesMap["chart-1"]}
                width={chartSize.width}
                height={chartSize.height}
                teachMode={teachMode}
                activeDrawingTool={activeDrawingTool}
                drawingColor={drawingColor}
                drawingThickness={drawingThickness}
                drawings={charts[0]?.drawings || []}
                setDrawings={(drawings) => setCharts(prev => prev.map((c, i) => i === 0 ? { ...c, drawings } : c))}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading chart data...
              </div>
            )}
          </div>

          {/* Status Bar */}
          {showStatusBar && (
            <div className="flex items-center justify-between px-3 py-1 border-t border-zinc-800 bg-zinc-900/30 shrink-0">
              <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                <span>O: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.open?.toFixed(2) || "--"}</span>
                <span>H: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.high?.toFixed(2) || "--"}</span>
                <span>L: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.low?.toFixed(2) || "--"}</span>
                <span>C: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.close?.toFixed(2) || "--"}</span>
                <span>Vol: {volume?.toFixed(2) || "--"}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span>24h H: {highPrice?.toFixed(2)}</span>
                <span>24h L: {lowPrice?.toFixed(2)}</span>
                <span className={priceChange >= 0 ? "text-green-400" : "text-red-400"}>
                  {priceChangePercent?.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        {showRightPanel && (
          <div className="w-72 border-l border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0">
            <Tabs value={activeRightTab} onValueChange={setActiveRightTab} className="flex flex-col h-full">
              <TabsList className="grid grid-cols-3 mx-2 mt-2 h-7">
                <TabsTrigger value="orders" className="text-[10px] py-0">Orders</TabsTrigger>
                <TabsTrigger value="book" className="text-[10px] py-0">Book</TabsTrigger>
                <TabsTrigger value="info" className="text-[10px] py-0">Info</TabsTrigger>
              </TabsList>

              <TabsContent value="orders" className="flex-1 p-2 overflow-auto">
                <div className="text-[10px] text-zinc-500 mb-2">Place Order</div>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-7 text-[10px] bg-green-500/20 text-green-400 hover:bg-green-500/30">Buy</Button>
                    <Button size="sm" className="flex-1 h-7 text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30">Sell</Button>
                  </div>
                  <div>
                    <Label className="text-[10px] text-zinc-500">Price</Label>
                    <Input className="h-7 text-xs" placeholder={currentPrice?.toFixed(2)} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-zinc-500">Amount</Label>
                    <Input className="h-7 text-xs" placeholder="0.001" />
                  </div>
                  <Button size="sm" className="w-full h-7 text-[10px]">Place Order</Button>
                </div>
              </TabsContent>

              <TabsContent value="book" className="flex-1 p-2 overflow-auto">
                <div className="text-[10px] text-zinc-500 mb-2">Order Book</div>
                <div className="space-y-0.5">
                  {orderBook.asks?.slice(0, 10).reverse().map((ask, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-red-400">{parseFloat(ask[0]).toFixed(2)}</span>
                      <span className="text-zinc-400">{parseFloat(ask[1]).toFixed(4)}</span>
                    </div>
                  ))}
                  <div className="border-t border-b border-zinc-700 py-1 my-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-green-400">{currentPrice?.toFixed(2)}</span>
                    </div>
                  </div>
                  {orderBook.bids?.slice(0, 10).map((bid, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-green-400">{parseFloat(bid[0]).toFixed(2)}</span>
                      <span className="text-zinc-400">{parseFloat(bid[1]).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="info" className="flex-1 p-2 overflow-auto">
                <div className="text-[10px] text-zinc-500 mb-2">Market Info</div>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between"><span className="text-zinc-500">24h Volume</span><span>{volume?.toFixed(2)} BTC</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">24h High</span><span className="text-green-400">{highPrice?.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">24h Low</span><span className="text-red-400">{lowPrice?.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Change</span><span className={priceChange >= 0 ? "text-green-400" : "text-red-400"}>{priceChangePercent?.toFixed(2)}%</span></div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
