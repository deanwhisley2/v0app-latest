"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineType,
  type BarData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type MouseEventParams,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import { formatChartTypeIndicator, type ChartTypeId } from "@/lib/chart-types"
import {
  toHeikinAshi,
  toHlcBars,
  toHlcMidline,
  toKagiLine,
  toLineBreak,
  toRenko,
  toVolumeColoredCandles,
} from "@/lib/chart-transforms"
import { mergeCanvasesToDataURL } from "@/lib/chart-canvas-snapshot"
import { cn } from "@/lib/utils"
import type { DrawingToolId } from "./chart-drawing-toolbar"

export type ProLightweightChartHandle = {
  /** Composite of all chart `<canvas>` layers (PNG data URL), or null if unavailable. */
  captureToDataURL: () => string | null
}

type ProLightweightChartProps = {
  symbol: string
  basePrice: number
  chartTypeId: ChartTypeId
  lineBreakLines: number
  interval: string
  drawingTool: DrawingToolId
  onDrawingConsumed?: () => void
  className?: string
}

const INTERVAL_BINANCE: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "5D": "3d",
  "1W": "1w",
  "1M": "1M",
}

const TF_BAR_SEC: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
  "5D": 86400,
  "1W": 604800,
  "1M": 2592000,
}

const CHART_BG = "#06080b"

function synthCandles(basePrice: number, bars: number, barSec: number): CandlestickData[] {
  const out: CandlestickData[] = []
  let p = basePrice * 0.97
  const now = Math.floor(Date.now() / 1000)
  const start = now - bars * barSec
  for (let i = 0; i < bars; i++) {
    const t = (start + i * barSec) as UTCTimestamp
    const o = p
    const c = p * (1 + (Math.random() - 0.48) * 0.018)
    const h = Math.max(o, c) * 1.004
    const l = Math.min(o, c) * 0.996
    out.push({ time: t, open: o, high: h, low: l, close: c })
    p = c
  }
  return out
}

function parseKlines(raw: unknown[]): CandlestickData[] {
  const out: CandlestickData[] = []
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue
    const t = Math.floor(Number(row[0]) / 1000) as UTCTimestamp
    out.push({
      time: t,
      open: parseFloat(String(row[1])),
      high: parseFloat(String(row[2])),
      low: parseFloat(String(row[3])),
      close: parseFloat(String(row[4])),
    })
  }
  return out
}

function parseVolumes(raw: unknown[]): number[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) =>
    Array.isArray(row) ? Math.max(0, parseFloat(String(row[5])) || 0) : 0
  )
}

function toHistogram(candles: CandlestickData[]): HistogramData[] {
  return candles.map((c) => {
    const up = c.close >= c.open
    return {
      time: c.time,
      value: (c.high - c.low) * 1200 + Math.abs(c.close - c.open) * 800,
      color: up ? "rgba(16,185,129,0.45)" : "rgba(244,63,94,0.45)",
    }
  })
}

function volFromKlines(raw: unknown[], candles: CandlestickData[]): HistogramData[] {
  const hist: HistogramData[] = []
  for (let i = 0; i < raw.length && i < candles.length; i++) {
    const row = raw[i]
    if (!Array.isArray(row)) continue
    const v = parseFloat(String(row[5]))
    const c = candles[i]
    const up = c.close >= c.open
    hist.push({
      time: c.time,
      value: Number.isFinite(v) ? v : 0,
      color: up ? "rgba(16,185,129,0.5)" : "rgba(244,63,94,0.5)",
    })
  }
  return hist
}

function closeLine(candles: CandlestickData[]): LineData[] {
  return candles.map((c) => ({ time: c.time, value: c.close }))
}

function columnHist(candles: CandlestickData[], volumes: number[]): HistogramData[] {
  const mx = Math.max(...volumes, 1e-9)
  return candles.map((c, i) => {
    const vol = volumes[i] ?? Math.abs(c.close - c.open) * 1e6
    const up = c.close >= c.open
    const t = vol / mx
    return {
      time: c.time,
      value: vol,
      color: up ? `rgba(34,211,238,${0.25 + t * 0.55})` : `rgba(244,63,94,${0.25 + t * 0.55})`,
    }
  })
}

function lineMarkers(data: LineData[]): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = []
  for (let i = 0; i < data.length; i++) {
    if (i % 14 === 0 || i === data.length - 1) {
      out.push({
        time: data[i].time,
        position: "inBar",
        shape: "circle",
        color: "#22d3ee",
        size: 0.85,
      })
    }
  }
  return out
}

/** Avoids lightweight-charts `ensureDefined` throw when a ref points at an already-removed series. */
function safeRemoveSeries(chart: IChartApi, series: ISeriesApi<SeriesType> | null | undefined) {
  if (!series) return
  try {
    chart.removeSeries(series)
  } catch {
    /* already detached */
  }
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const ProLightweightChart = forwardRef<ProLightweightChartHandle, ProLightweightChartProps>(
  function ProLightweightChart(
    {
      symbol,
      basePrice,
      chartTypeId,
      lineBreakLines,
      interval,
      drawingTool,
      onDrawingConsumed,
      className,
    },
    ref
  ) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const trendRef = useRef<ISeriesApi<"Line"> | null>(null)
  const parallelRef = useRef<ISeriesApi<"Line"> | null>(null)
  const highLowRefs = useRef<{ hi?: ISeriesApi<"Line">; lo?: ISeriesApi<"Line"> }>({})
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const priceLinesRef = useRef<ReturnType<ISeriesApi<SeriesType>["createPriceLine"]>[]>([])
  const dataRef = useRef<CandlestickData[]>([])
  const [hint, setHint] = useState<{ t: string; o: string; h: string; l: string; c: string } | null>(null)
  const [measureHint, setMeasureHint] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const measureClicks = useRef<{ time: Time; price: number }[]>([])
  const markerAccum = useRef<SeriesMarker<Time>[]>([])

  useImperativeHandle(
    ref,
    () => ({
      captureToDataURL: () => {
        const el = wrapRef.current
        if (!el) return null
        return mergeCanvasesToDataURL(el)
      },
    }),
    []
  )

  const seriesSupportsPriceLines = (s: ISeriesApi<SeriesType> | null) => {
    const t = s?.seriesType()
    return t === "Candlestick" || t === "Line" || t === "Area" || t === "Baseline" || t === "Bar"
  }

  const clearDrawings = useCallback(() => {
    const main = mainRef.current
    if (main && seriesSupportsPriceLines(main)) {
      for (const line of priceLinesRef.current) {
        main.removePriceLine(line)
      }
    }
    priceLinesRef.current = []
    const chart = chartRef.current
    if (trendRef.current && chart) {
      safeRemoveSeries(chart, trendRef.current)
      trendRef.current = null
    }
    if (parallelRef.current && chart) {
      safeRemoveSeries(chart, parallelRef.current)
      parallelRef.current = null
    }
    // Do not remove `highLowRefs` here: those series are the main chart in High–Low mode, not overlays.
    // Removing them without clearing `mainRef` left a stale handle and broke the next `removeSeries(main)`.
    markerAccum.current = []
    markersRef.current?.setMarkers([])
  }, [])

  const applyFib = useCallback(() => {
    const main = mainRef.current
    const data = dataRef.current
    if (!main || !seriesSupportsPriceLines(main) || data.length < 5) return
    clearDrawings()
    const slice = data.slice(-90)
    const hi = Math.max(...slice.map((c) => c.high))
    const lo = Math.min(...slice.map((c) => c.low))
    const r = hi - lo
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((f) => hi - r * f)
    const colors = ["#22d3ee", "#a78bfa", "#fbbf24", "#fb7185", "#34d399", "#60a5fa", "#f472b6"]
    levels.forEach((price, i) => {
      const line = main.createPriceLine({
        price,
        color: colors[i % colors.length],
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: i === 0 ? "Fib" : "",
      })
      priceLinesRef.current.push(line)
    })
  }, [clearDrawings])

  const applyHLine = useCallback(() => {
    const main = mainRef.current
    const data = dataRef.current
    if (!main || !seriesSupportsPriceLines(main) || !data.length) return
    clearDrawings()
    const last = data[data.length - 1]
    const line = main.createPriceLine({
      price: last.close,
      color: "#38bdf8",
      lineWidth: 1,
      axisLabelVisible: true,
      title: "H",
    })
    priceLinesRef.current.push(line)
  }, [clearDrawings])

  const applyTrend = useCallback(() => {
    const chart = chartRef.current
    const data = dataRef.current
    if (!chart || data.length < 4) return
    clearDrawings()
    const a = data[Math.floor(data.length * 0.65)]
    const b = data[data.length - 1]
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#facc15",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    lineSeries.setData([
      { time: a.time, value: a.low },
      { time: b.time, value: b.high },
    ] as LineData[])
    trendRef.current = lineSeries
  }, [clearDrawings])

  const applyParallel = useCallback(() => {
    const chart = chartRef.current
    const data = dataRef.current
    if (!chart || data.length < 4) return
    clearDrawings()
    const a = data[Math.floor(data.length * 0.6)]
    const b = data[data.length - 1]
    const mid = (a.low + b.high) / 2
    const off = mid * 0.0025
    const upper = chart.addSeries(LineSeries, {
      color: "#a78bfa",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    upper.setData([
      { time: a.time, value: a.low + off },
      { time: b.time, value: b.high + off },
    ] as LineData[])
    const lower = chart.addSeries(LineSeries, {
      color: "#a78bfa",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    lower.setData([
      { time: a.time, value: a.low - off },
      { time: b.time, value: b.high - off },
    ] as LineData[])
    parallelRef.current = upper
    trendRef.current = lower
  }, [clearDrawings])

  const applyRect = useCallback(() => {
    const main = mainRef.current
    const data = dataRef.current
    if (!main || !seriesSupportsPriceLines(main) || data.length < 5) return
    clearDrawings()
    const slice = data.slice(-28)
    const hi = Math.max(...slice.map((c) => c.high))
    const lo = Math.min(...slice.map((c) => c.low))
    priceLinesRef.current.push(
      main.createPriceLine({
        price: hi,
        color: "#f472b6",
        lineWidth: 1,
        lineStyle: 0,
        title: "Box↑",
      })
    )
    priceLinesRef.current.push(
      main.createPriceLine({
        price: lo,
        color: "#34d399",
        lineWidth: 1,
        lineStyle: 0,
        title: "Box↓",
      })
    )
  }, [clearDrawings])

  // Mount chart
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: "#9ca3af",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(6,182,212,0.35)", width: 1 as const },
        horzLine: { color: "rgba(6,182,212,0.35)", width: 1 as const },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      autoSize: true,
    })

    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) chart.resize(w, h)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      markersRef.current?.detach()
      markersRef.current = null
      chart.remove()
      chartRef.current = null
      mainRef.current = null
      volRef.current = null
      trendRef.current = null
      parallelRef.current = null
      highLowRefs.current = {}
      priceLinesRef.current = []
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.applyOptions({
      handleScroll: {
        mouseWheel: !locked,
        pressedMouseMove: !locked,
        horzTouchDrag: !locked,
        vertTouchDrag: !locked,
      },
    })
  }, [locked])

  // Series + data
  useEffect(() => {
    const chart = chartRef.current
    const el = wrapRef.current
    if (!chart || !el) return

    markersRef.current?.detach()
    markersRef.current = null

    if (trendRef.current) safeRemoveSeries(chart, trendRef.current)
    if (parallelRef.current) safeRemoveSeries(chart, parallelRef.current)

    // High–Low: `mainRef` is the same series as `highLowRefs.hi`. Remove `lo` then `hi` once,
    // then null `mainRef` if it pointed at `hi` — never call `removeSeries(main)` after that.
    const lo = highLowRefs.current.lo
    const hi = highLowRefs.current.hi
    if (lo) {
      safeRemoveSeries(chart, lo)
      highLowRefs.current.lo = undefined
    }
    if (hi) {
      safeRemoveSeries(chart, hi)
      highLowRefs.current.hi = undefined
      if (mainRef.current === hi) mainRef.current = null
    }

    if (mainRef.current) safeRemoveSeries(chart, mainRef.current)
    if (volRef.current) safeRemoveSeries(chart, volRef.current)
    mainRef.current = null
    volRef.current = null
    trendRef.current = null
    parallelRef.current = null
    highLowRefs.current = {}
    priceLinesRef.current = []

    const devBlock = process.env.NEXT_PUBLIC_DEV_LOCAL_ONLY === "1"
    const pair = `${symbol.toUpperCase()}USDT`
    const binanceInterval = INTERVAL_BINANCE[interval] ?? "1h"
    const barSec = TF_BAR_SEC[interval] ?? 3600

    let cancelled = false
    let crossHandler: ((param: MouseEventParams) => void) | null = null

    ;(async () => {
      let candles: CandlestickData[] = []
      let rawK: unknown[] = []
      if (!devBlock) {
        try {
          const u = new URL("/api/binance", window.location.origin)
          u.searchParams.set("endpoint", "/api/v3/klines")
          u.searchParams.set("symbol", pair)
          u.searchParams.set("interval", binanceInterval)
          u.searchParams.set("limit", "320")
          const res = await fetch(u.toString())
          if (res.ok) {
            rawK = (await res.json()) as unknown[]
            candles = parseKlines(rawK)
          }
        } catch {
          /* ignore */
        }
      }
      if (!candles.length) {
        candles = synthCandles(basePrice, 220, barSec)
        rawK = []
      }
      const volumes = parseVolumes(rawK)
      dataRef.current = candles
      if (cancelled) return

      let ohlc = candles
      if (chartTypeId === "heikinAshi") ohlc = toHeikinAshi(candles)
      else if (chartTypeId === "renko") ohlc = toRenko(candles)
      else if (chartTypeId === "lineBreak") ohlc = toLineBreak(candles, lineBreakLines)
      else if (chartTypeId === "hlcBars") ohlc = toHlcBars(candles)

      const kagiLine = chartTypeId === "kagi" ? toKagiLine(candles) : null
      const showVolume =
        chartTypeId !== "columns" && chartTypeId !== "kagi" && !kagiLine

      let main: ISeriesApi<SeriesType>

      const addVolume = (hist: HistogramData[]) => {
        const vol = chart.addSeries(HistogramSeries, {
          priceScaleId: "volume",
          priceFormat: { type: "volume" },
        })
        vol.setData(hist)
        volRef.current = vol
        chart.priceScale("volume").applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        })
        main.priceScale().applyOptions({
          scaleMargins: { top: 0.02, bottom: 0.28 },
        })
      }

      if (kagiLine) {
        main = chart.addSeries(LineSeries, {
          color: "#fbbf24",
          lineWidth: 2,
          crosshairMarkerVisible: true,
        })
        main.setData(kagiLine)
        mainRef.current = main
        markersRef.current = createSeriesMarkers(main, [])
        chart.timeScale().fitContent()
      } else if (chartTypeId === "columns") {
        main = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
        })
        main.setData(columnHist(ohlc, volumes.length ? volumes : ohlc.map(() => 1)))
        mainRef.current = main
        main.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.1 } })
        chart.timeScale().fitContent()
      } else if (chartTypeId === "highLow") {
        const hi = chart.addSeries(LineSeries, {
          color: "#f87171",
          lineWidth: 1,
          priceLineVisible: false,
        })
        hi.setData(ohlc.map((c) => ({ time: c.time, value: c.high })) as LineData[])
        const lo = chart.addSeries(LineSeries, {
          color: "#34d399",
          lineWidth: 1,
          priceLineVisible: false,
        })
        lo.setData(ohlc.map((c) => ({ time: c.time, value: c.low })) as LineData[])
        highLowRefs.current = { hi, lo }
        main = hi
        mainRef.current = hi
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        } else {
          hi.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.18 } })
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "bars" || chartTypeId === "hlcBars") {
        main = chart.addSeries(BarSeries, {
          upColor: "#10b981",
          downColor: "#f43f5e",
        })
        main.setData(ohlc as BarData[])
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (
        chartTypeId === "candles" ||
        chartTypeId === "heikinAshi" ||
        chartTypeId === "renko" ||
        chartTypeId === "lineBreak"
      ) {
        main = chart.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#f43f5e",
          borderUpColor: "#10b981",
          borderDownColor: "#f43f5e",
          wickUpColor: "#10b981",
          wickDownColor: "#f43f5e",
        })
        main.setData(ohlc)
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "hollowCandles") {
        main = chart.addSeries(CandlestickSeries, {
          upColor: CHART_BG,
          downColor: CHART_BG,
          borderUpColor: "#10b981",
          borderDownColor: "#f43f5e",
          wickUpColor: "#6ee7b7",
          wickDownColor: "#fb7185",
          borderVisible: true,
        })
        main.setData(ohlc)
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "volumeCandles") {
        const vc =
          volumes.length === ohlc.length && volumes.some((v) => v > 0)
            ? toVolumeColoredCandles(ohlc, volumes)
            : ohlc
        main = chart.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#f43f5e",
          borderUpColor: "#10b981",
          borderDownColor: "#f43f5e",
          wickUpColor: "#10b981",
          wickDownColor: "#f43f5e",
        })
        main.setData(vc)
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "line" || chartTypeId === "lineMarkers") {
        const ld = closeLine(ohlc)
        main = chart.addSeries(LineSeries, {
          color: "#22d3ee",
          lineWidth: 2,
          crosshairMarkerVisible: true,
        })
        main.setData(ld)
        mainRef.current = main
        markersRef.current = createSeriesMarkers(
          main,
          chartTypeId === "lineMarkers" ? lineMarkers(ld) : []
        )
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "stepLine") {
        const ld = closeLine(ohlc)
        main = chart.addSeries(LineSeries, {
          color: "#22d3ee",
          lineWidth: 2,
          lineType: LineType.WithSteps,
          crosshairMarkerVisible: true,
        })
        main.setData(ld)
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "area") {
        main = chart.addSeries(AreaSeries, {
          topColor: "rgba(34,211,238,0.35)",
          bottomColor: "rgba(34,211,238,0.02)",
          lineColor: "#22d3ee",
          lineWidth: 2,
        })
        main.setData(closeLine(ohlc))
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "hlcArea") {
        main = chart.addSeries(AreaSeries, {
          topColor: "rgba(167,139,250,0.28)",
          bottomColor: "rgba(167,139,250,0.02)",
          lineColor: "#c4b5fd",
          lineWidth: 2,
        })
        main.setData(toHlcMidline(ohlc))
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else if (chartTypeId === "baseline") {
        const closes = ohlc.map((c) => c.close)
        const base = median(closes)
        main = chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: base },
          topLineColor: "#22d3ee",
          topFillColor1: "rgba(34,211,238,0.35)",
          topFillColor2: "rgba(34,211,238,0.05)",
          bottomLineColor: "#f43f5e",
          bottomFillColor1: "rgba(244,63,94,0.28)",
          bottomFillColor2: "rgba(244,63,94,0.05)",
          lineWidth: 2,
        })
        main.setData(closeLine(ohlc))
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      } else {
        main = chart.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#f43f5e",
          borderUpColor: "#10b981",
          borderDownColor: "#f43f5e",
          wickUpColor: "#10b981",
          wickDownColor: "#f43f5e",
        })
        main.setData(ohlc)
        mainRef.current = main
        if (showVolume) {
          const hist =
            rawK.length && volumes.some((v) => v > 0)
              ? volFromKlines(rawK, ohlc)
              : toHistogram(ohlc)
          addVolume(hist)
        }
        chart.timeScale().fitContent()
      }

      if (!markersRef.current && mainRef.current) {
        markersRef.current = createSeriesMarkers(mainRef.current, [])
      }

      crossHandler = (param: MouseEventParams) => {
        if (!param.time || param.point === undefined) {
          setHint(null)
          return
        }
        const m = mainRef.current
        if (!m) {
          setHint(null)
          return
        }
        const d = param.seriesData.get(m)
        if (!d || typeof d !== "object") {
          setHint(null)
          return
        }
        if ("open" in d && "high" in d && "low" in d && "close" in d) {
          const c = d as CandlestickData
          setHint({
            t: String(param.time),
            o: c.open.toFixed(4),
            h: c.high.toFixed(4),
            l: c.low.toFixed(4),
            c: c.close.toFixed(4),
          })
        } else if ("value" in d) {
          const l = d as LineData
          setHint({
            t: String(param.time),
            o: "—",
            h: "—",
            l: "—",
            c: l.value.toFixed(4),
          })
        }
      }
      if (!cancelled && crossHandler) chart.subscribeCrosshairMove(crossHandler)
    })()

    return () => {
      cancelled = true
      if (crossHandler) chart.unsubscribeCrosshairMove(crossHandler)
    }
  }, [symbol, basePrice, chartTypeId, lineBreakLines, interval])

  // Drawing & interaction tools
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (drawingTool === "magnet") {
      chart.applyOptions({ crosshair: { mode: CrosshairMode.Magnet } })
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "crosshair") {
      chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal } })
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "cursor") {
      chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal } })
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "zoom") {
      chart.timeScale().fitContent()
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "erase") {
      clearDrawings()
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "fib") {
      applyFib()
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "hline") {
      applyHLine()
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "trend") {
      applyTrend()
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "parallel") {
      applyParallel()
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "rect") {
      applyRect()
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "lock") {
      setLocked((v) => !v)
      onDrawingConsumed?.()
      return
    }
    if (drawingTool === "brush") {
      onDrawingConsumed?.()
      return
    }
  }, [
    drawingTool,
    applyFib,
    applyHLine,
    applyTrend,
    applyParallel,
    applyRect,
    clearDrawings,
    onDrawingConsumed,
  ])

  // Click tools: vline, ruler, text
  useEffect(() => {
    const chart = chartRef.current
    const main = mainRef.current
    if (!chart || !main) return

    const clickTools: DrawingToolId[] = ["vline", "ruler", "text"]
    if (!clickTools.includes(drawingTool)) {
      measureClicks.current = []
      return
    }

    const handler = (param: MouseEventParams) => {
      if (!param.point || param.time === undefined) return
      const d = param.seriesData.get(main)
      if (!d || typeof d !== "object") return
      const px =
        "close" in d
          ? (d as CandlestickData).close
          : "value" in d
            ? (d as LineData).value
            : null
      if (px === null || Number.isNaN(px)) return

      if (drawingTool === "vline") {
        if (!markersRef.current) markersRef.current = createSeriesMarkers(main, [])
        markerAccum.current.push({
          time: param.time as Time,
          position: "inBar",
          shape: "arrowDown",
          color: "#fbbf24",
          size: 1,
        })
        markersRef.current.setMarkers([...markerAccum.current])
        onDrawingConsumed?.()
        return
      }

      if (drawingTool === "ruler") {
        measureClicks.current.push({ time: param.time as Time, price: px })
        if (measureClicks.current.length >= 2) {
          const [a, b] = measureClicks.current
          const pct = ((b.price - a.price) / Math.max(a.price, 1e-12)) * 100
          setMeasureHint(`Δ ${pct >= 0 ? "+" : ""}${pct.toFixed(3)}%  ·  ${(b.price - a.price).toFixed(4)}`)
          measureClicks.current = []
          onDrawingConsumed?.()
        }
        return
      }

      if (drawingTool === "text") {
        const label = typeof window !== "undefined" ? window.prompt("Label text", "Note") : null
        if (label && seriesSupportsPriceLines(main)) {
          const line = main.createPriceLine({
            price: px,
            color: "#e879f9",
            lineWidth: 1,
            title: label.slice(0, 24),
          })
          priceLinesRef.current.push(line)
        }
        onDrawingConsumed?.()
      }
    }

    chart.subscribeClick(handler)
    return () => {
      chart.unsubscribeClick(handler)
    }
  }, [drawingTool, onDrawingConsumed])

  const chartTypeCaption = formatChartTypeIndicator(chartTypeId, { lineBreakLines })

  return (
    <div className={cn("relative flex min-h-[320px] flex-1 flex-col", className)}>
      <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border border-white/[0.1] bg-black/75 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100/95 shadow-lg backdrop-blur-sm">
        {chartTypeCaption}
      </div>
      {measureHint && (
        <div className="pointer-events-none absolute right-3 top-2 z-10 max-w-[220px] rounded-lg border border-fuchsia-500/30 bg-black/85 px-3 py-2 font-mono text-[10px] text-fuchsia-100 shadow-xl">
          {measureHint}
        </div>
      )}
      {hint && (
        <div className="pointer-events-none absolute left-14 top-2 z-10 rounded-lg border border-white/10 bg-black/80 px-3 py-2 font-mono text-[10px] text-zinc-200 shadow-xl backdrop-blur-md sm:left-4">
          <div className="text-zinc-500">Time {hint.t}</div>
          <div className="mt-1 grid grid-cols-4 gap-x-3 gap-y-0.5 text-[10px]">
            <span className="text-zinc-500">O</span>
            <span className="text-zinc-500">H</span>
            <span className="text-zinc-500">L</span>
            <span className="text-zinc-500">C</span>
            <span className="text-amber-200/90">{hint.o}</span>
            <span className="text-emerald-300/90">{hint.h}</span>
            <span className="text-rose-300/90">{hint.l}</span>
            <span className="text-cyan-200">{hint.c}</span>
          </div>
        </div>
      )}
      {locked && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded border border-amber-500/40 bg-amber-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
          Pan/zoom locked
        </div>
      )}
      <div
        ref={wrapRef}
        className="h-[min(56vh,720px)] w-full min-h-[360px] flex-1 rounded-xl"
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
      />
    </div>
  )
  }
)

ProLightweightChart.displayName = "ProLightweightChart"
