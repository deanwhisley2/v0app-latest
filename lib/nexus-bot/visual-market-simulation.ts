/**
 * Client-only visual market simulation for active Nexus Bot sessions.
 * Does not read prices, reserves, or payout logic — cosmetic only.
 */

export const VISUAL_MARKET_ASSETS = ["BTC", "ETH", "SOL", "XRP", "ADA"] as const

export const VISUAL_HOLD_STATUSES = [
  "Market unstable",
  "Monitoring liquidity",
  "Waiting for confirmation",
  "Trend unclear",
  "Volume below threshold",
  "Scanning alternative pairs",
] as const

export type VisualCandle = {
  o: number
  h: number
  l: number
  c: number
  mark?: "buy" | "sell"
}

export type VisualFeedLine = {
  id: number
  text: string
  tone: "buy" | "sell" | "neutral" | "hold" | "asset"
}

export type VisualSimSnapshot = {
  candles: VisualCandle[]
  statusLine: string
  asset: string
  feed: VisualFeedLine[]
  isHolding: boolean
}

type SimMode = "hold" | "scan" | "buy_burst" | "sell_burst" | "pause" | "rotate"

type SimRuntime = {
  rng: () => number
  assetIdx: number
  mode: SimMode
  modeTicksLeft: number
  burstLeft: number
  feedId: number
  candles: VisualCandle[]
  feed: VisualFeedLine[]
  lastClose: number
}

const MAX_CANDLES = 26
const NEXUS_BOT_LABEL = "NexusBot"

export function hashVisualSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

function holdTicksForSession(rng: () => number, progressPct: number): number {
  const base = 2 + Math.floor(rng() * 14)
  if (progressPct < 20) return base + Math.floor(rng() * 4)
  if (progressPct > 85) return base + Math.floor(rng() * 6)
  return base + Math.floor(rng() * 10)
}

function nextCandle(rng: () => number, prevClose: number, volatile: boolean): VisualCandle {
  const body = (0.02 + rng() * 0.08) * (volatile ? 1.35 : 0.75)
  const dir = rng() > 0.48 ? 1 : -1
  const o = prevClose
  const c = Math.min(0.92, Math.max(0.08, o + dir * body * (0.35 + rng() * 0.65)))
  const wickPad = body * (0.25 + rng() * 0.55)
  const h = Math.min(0.96, Math.max(o, c) + wickPad)
  const l = Math.max(0.04, Math.min(o, c) - wickPad)
  return { o, h, l, c }
}

function pushFeed(rt: SimRuntime, text: string, tone: VisualFeedLine["tone"]): void {
  rt.feedId += 1
  rt.feed = [{ id: rt.feedId, text, tone }, ...rt.feed].slice(0, 4)
}

function assetLabel(asset: string): string {
  return asset
}

function startMode(rt: SimRuntime, mode: SimMode, rng: () => number, progressPct: number): void {
  rt.mode = mode
  switch (mode) {
    case "hold": {
      rt.modeTicksLeft = holdTicksForSession(rng, progressPct)
      pushFeed(rt, pick(rng, VISUAL_HOLD_STATUSES), "hold")
      break
    }
    case "scan": {
      rt.modeTicksLeft = 1 + Math.floor(rng() * 2)
      pushFeed(rt, "Scanning opportunities", "neutral")
      break
    }
    case "buy_burst": {
      rt.burstLeft = 1 + Math.floor(rng() * 3)
      rt.modeTicksLeft = rt.burstLeft
      pushFeed(rt, "Opportunity detected", "neutral")
      break
    }
    case "sell_burst": {
      rt.burstLeft = 1 + Math.floor(rng() * 2)
      rt.modeTicksLeft = rt.burstLeft
      break
    }
    case "pause": {
      rt.modeTicksLeft = 1 + Math.floor(rng() * 5)
      pushFeed(rt, pick(rng, ["Monitoring market", "Holding position", "Waiting for confirmation"]), "neutral")
      break
    }
    case "rotate": {
      rt.modeTicksLeft = 1
      rt.assetIdx = Math.floor(rng() * VISUAL_MARKET_ASSETS.length)
      const a = assetLabel(VISUAL_MARKET_ASSETS[rt.assetIdx]!)
      const msg = pick(rng, [
        `Switching market focus to ${a}`,
        `Liquidity moved to ${a}`,
        `Monitoring ${a} volatility`,
      ])
      pushFeed(rt, msg, "asset")
      break
    }
    default:
      rt.modeTicksLeft = 1
  }
}

function pickNextMode(rt: SimRuntime, rng: () => number, progressPct: number): SimMode {
  const r = rng()
  if (rt.mode === "hold" || rt.mode === "pause") {
    if (r < 0.35) return "buy_burst"
    if (r < 0.55) return "scan"
    if (r < 0.7) return "rotate"
    return "hold"
  }
  if (r < 0.22) return "hold"
  if (r < 0.38) return "pause"
  if (r < 0.48) return "rotate"
  if (r < 0.72) return "buy_burst"
  if (r < 0.88) return "sell_burst"
  if (progressPct > 75 && r > 0.5) return "hold"
  return "scan"
}

export function createVisualSimRuntime(seed: string): SimRuntime {
  const rng = mulberry32(hashVisualSeed(seed))
  const candles: VisualCandle[] = []
  let lastClose = 0.42 + rng() * 0.18
  for (let i = 0; i < 8; i++) {
    const c = nextCandle(rng, lastClose, false)
    candles.push(c)
    lastClose = c.c
  }
  const rt: SimRuntime = {
    rng,
    assetIdx: Math.floor(rng() * VISUAL_MARKET_ASSETS.length),
    mode: "scan",
    modeTicksLeft: 1,
    burstLeft: 0,
    feedId: 0,
    candles,
    feed: [],
    lastClose,
  }
  pushFeed(rt, "Session started", "neutral")
  pushFeed(rt, `Monitoring ${assetLabel(VISUAL_MARKET_ASSETS[rt.assetIdx]!)}`, "asset")
  return rt
}

export function stepVisualSimulation(
  rt: SimRuntime,
  progressPct: number,
): VisualSimSnapshot {
  const rng = rt.rng
  let isHolding = false

  if (rt.modeTicksLeft <= 0) {
    startMode(rt, pickNextMode(rt, rng, progressPct), rng, progressPct)
  }

  const volatile = rt.mode === "buy_burst" || rt.mode === "sell_burst"
  const addCandle = rt.mode !== "hold" || rng() > 0.55
  if (addCandle) {
    const mark: "buy" | "sell" | undefined =
      rt.mode === "buy_burst" && rt.burstLeft === rt.modeTicksLeft
        ? "buy"
        : rt.mode === "sell_burst" && rt.burstLeft === rt.modeTicksLeft
          ? "sell"
          : undefined
    const c = nextCandle(rng, rt.lastClose, volatile)
    if (mark) c.mark = mark
    rt.candles = [...rt.candles, c].slice(-MAX_CANDLES)
    rt.lastClose = c.c

    if (mark === "buy") {
      const n = rt.burstLeft > 1 ? "Buy cycles recorded" : "Buy cycle recorded"
      pushFeed(rt, rt.burstLeft === rt.modeTicksLeft ? "First entry opened" : n, "buy")
    } else if (mark === "sell") {
      pushFeed(rt, "Sell cycle recorded", "sell")
      if (rng() > 0.4) pushFeed(rt, "Bullish trades updated", "sell")
    }
  }

  if (rt.mode === "buy_burst" && rt.modeTicksLeft === 1 && rng() > 0.5) {
    pushFeed(rt, "Profit reserve updating", "neutral")
  }

  rt.modeTicksLeft -= 1
  if (rt.mode === "hold") isHolding = true

  const asset = assetLabel(VISUAL_MARKET_ASSETS[rt.assetIdx]!)
  let statusLine = `${asset} · ${NEXUS_BOT_LABEL}`
  if (rt.mode === "hold" && rt.feed[0]?.tone === "hold") {
    statusLine = rt.feed[0].text
  } else if (rt.mode === "rotate" && rt.feed[0]?.tone === "asset") {
    statusLine = rt.feed[0].text
  } else if (rt.mode === "buy_burst") {
    statusLine = "Executing buy…"
  } else if (rt.mode === "sell_burst") {
    statusLine = "Taking profit…"
  } else if (rt.mode === "pause") {
    statusLine = pick(rng, ["Monitoring market", "Holding position"])
  } else {
    statusLine = pick(rng, ["Analyzing structure…", "Desk flow active…", `Scanning ${asset}…`])
  }

  return {
    candles: rt.candles,
    statusLine,
    asset,
    feed: rt.feed,
    isHolding,
  }
}

export function visualTickDelayMs(rng: () => number, isHolding: boolean): number {
  if (isHolding) return 2200 + Math.floor(rng() * 4800)
  return 1400 + Math.floor(rng() * 3600)
}

export function candleChartLayout(candles: VisualCandle[]): {
  paths: Array<{ x: number; bodyY: number; bodyH: number; wickTop: number; wickBottom: number; up: boolean }>
  yMin: number
  yMax: number
} {
  if (candles.length === 0) {
    return { paths: [], yMin: 0, yMax: 1 }
  }
  let yMin = Infinity
  let yMax = -Infinity
  for (const c of candles) {
    yMin = Math.min(yMin, c.l)
    yMax = Math.max(yMax, c.h)
  }
  const pad = (yMax - yMin) * 0.08 || 0.05
  yMin -= pad
  yMax += pad
  const span = yMax - yMin || 1
  const n = candles.length
  const slot = 100 / Math.max(n, 1)

  const paths = candles.map((c, i) => {
    const x = slot * i + slot * 0.5
    const toY = (v: number) => 40 - ((v - yMin) / span) * 34 - 2
    const bodyTop = toY(Math.max(c.o, c.c))
    const bodyBottom = toY(Math.min(c.o, c.c))
    const bodyH = Math.max(0.8, bodyBottom - bodyTop)
    return {
      x,
      bodyY: bodyTop,
      bodyH,
      wickTop: toY(c.h),
      wickBottom: toY(c.l),
      up: c.c >= c.o,
    }
  })
  return { paths, yMin, yMax }
}
