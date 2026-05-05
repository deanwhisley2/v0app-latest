import type { CandlestickData, LineData, UTCTimestamp } from "lightweight-charts"

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Classic Heikin Ashi OHLC. */
export function toHeikinAshi(data: CandlestickData[]): CandlestickData[] {
  if (!data.length) return []
  const out: CandlestickData[] = []
  let haOpen = (data[0].open + data[0].close) / 2
  for (const c of data) {
    const haClose = (c.open + c.high + c.low + c.close) / 4
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow = Math.min(c.low, haOpen, haClose)
    out.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    })
    haOpen = (haOpen + haClose) / 2
  }
  return out
}

/** HLC-style bars: open tracks previous close. */
export function toHlcBars(data: CandlestickData[]): CandlestickData[] {
  if (!data.length) return []
  const out: CandlestickData[] = []
  let prevClose = data[0].open
  for (const c of data) {
    const o = prevClose
    const h = c.high
    const l = c.low
    const cl = c.close
    out.push({ time: c.time, open: o, high: h, low: l, close: cl })
    prevClose = cl
  }
  return out
}

/** Midline (H+L+C)/3 for area-style smoothing. */
export function toHlcMidline(data: CandlestickData[]): LineData[] {
  return data.map((c) => ({
    time: c.time,
    value: (c.high + c.low + c.close) / 3,
  }))
}

/** Simplified Renko: brick size from recent range; emits fewer bricks. */
export function toRenko(data: CandlestickData[], brickRatio = 0.35): CandlestickData[] {
  if (data.length < 5) return data
  const ranges = data.slice(-80).map((c) => c.high - c.low)
  const brick = Math.max(median(ranges) * brickRatio, Math.abs(data.at(-1)!.close) * 0.00025)
  const bricks: CandlestickData[] = []
  let last = data[0].close

  const pushBrick = (open: number, close: number, time: UTCTimestamp) => {
    bricks.push({
      time,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
    })
  }

  for (const c of data) {
    let move = c.close - last
    let guard = 0
    while (Math.abs(move) >= brick && guard++ < 4000) {
      const step = move > 0 ? brick : -brick
      const next = last + step
      pushBrick(last, next, c.time as UTCTimestamp)
      last = next
      move = c.close - last
    }
  }
  if (!bricks.length) return data.slice(-120)
  return bricks
}

/**
 * Line break [n]: emit a bar when close breaks prior n-bar high/low (simplified).
 */
export function toLineBreak(data: CandlestickData[], lines: number): CandlestickData[] {
  const n = Math.max(2, Math.min(10, Math.floor(lines)))
  if (data.length <= n) return data
  const out: CandlestickData[] = []
  for (let i = n; i < data.length; i++) {
    const slice = data.slice(i - n, i)
    const hi = Math.max(...slice.map((x) => x.high))
    const lo = Math.min(...slice.map((x) => x.low))
    const c = data[i]
    if (c.close > hi || c.close < lo) out.push(c)
  }
  return out.length >= 8 ? out : data.slice(-160)
}

/** Kagi-style zigzag from reversal % of last pivot. */
export function toKagiLine(data: CandlestickData[], reversalRatio = 0.0045): LineData[] {
  if (!data.length) return []
  const out: LineData[] = []
  let pivot = data[0].close
  out.push({ time: data[0].time, value: pivot })
  for (const c of data) {
    const rev = Math.abs(c.close - pivot) / Math.max(pivot, 1e-12)
    if (rev >= reversalRatio) {
      pivot = c.close
      out.push({ time: c.time, value: c.close })
    }
  }
  return out.length >= 2 ? out : data.map((c) => ({ time: c.time, value: c.close }))
}

/** Volume-weighted candle coloring (intensity ∝ volume / max volume). */
export function toVolumeColoredCandles(
  data: CandlestickData[],
  volumes: number[]
): CandlestickData[] {
  if (!volumes.length || volumes.length !== data.length) return data
  const mx = Math.max(...volumes, 1e-9)
  return data.map((c, i) => {
    const vol = volumes[i] ?? 0
    const intensity = Math.min(1, vol / mx)
    const up = c.close >= c.open
    const base = up ? "16,185,129" : "244,63,94"
    return {
      ...c,
      color: `rgba(${base},${0.28 + intensity * 0.55})`,
      borderColor: `rgba(${base},${0.45 + intensity * 0.5})`,
      wickColor: `rgba(${base},0.9)`,
    }
  })
}
