"use client"

/**
 * Active Fixed Trade — visual NexusBot activity (client-only).
 * No market feed, no ticker, no spot prices, no strategy hints.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Activity } from "lucide-react"
import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"

const POINTS = 28
const TICK_MS = 1500
const NEXUS_BOT_LABEL = "NexusBot"

const STATUS_PHRASES = [
  "Analyzing market…",
  "Detecting opportunity…",
  "Executing buy…",
  "Managing risk…",
  "Taking profit…",
  "Re-entering position…",
] as const

type MarkKind = "buy" | "sell" | null

type Sample = { v: number; mark: MarkKind }

type FeedEvent = { id: number; kind: "buy" | "sell"; profitPct?: number }

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildInitialSeries(rng: () => number): Sample[] {
  const out: Sample[] = []
  let v = 0.4 + rng() * 0.2
  let lastBuyIdx = -5
  for (let i = 0; i < POINTS; i++) {
    const drift = 0.012 + rng() * 0.01
    const noise = (rng() - 0.5) * 0.12
    v = Math.min(0.94, Math.max(0.06, v + drift + noise))
    let mark: MarkKind = null
    if (i - lastBuyIdx >= 4 && rng() > 0.62) {
      mark = "buy"
      lastBuyIdx = i
    } else if (i - lastBuyIdx === 2 && rng() > 0.45) {
      mark = "sell"
    }
    out.push({ v, mark })
  }
  return out
}

function pathFrom(series: Sample[]): string {
  const stepX = 100 / (POINTS - 1)
  return series
    .map((s, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)} ${(36 - s.v * 32 - 2).toFixed(2)}`)
    .join(" ")
}

export function FixedTradeSimulation({
  sessionId,
  /** Internal only — never shown; keeps motion unique per session. */
  deskSalt = "",
}: {
  sessionId: string
  deskSalt?: string
}) {
  const seed = useMemo(() => hashSeed(`${sessionId}:${deskSalt}`), [sessionId, deskSalt])

  const initial = useMemo(() => buildInitialSeries(mulberry32(seed)), [seed])
  const [series, setSeries] = useState<Sample[]>(initial)
  const [statusIdx, setStatusIdx] = useState(() => seed % STATUS_PHRASES.length)
  const [feed, setFeed] = useState<FeedEvent[]>([])

  const rngRef = useRef<() => number>(mulberry32(seed ^ 0x9e3779b9))
  const seriesRef = useRef<Sample[]>(initial)
  const feedIdRef = useRef(0)

  useEffect(() => {
    if (isMobileLowGpuMode()) return
    if (typeof window === "undefined") return

    const rng = rngRef.current

    const tick = () => {
      if (document.visibilityState === "hidden") return

      const prev = seriesRef.current
      const last = prev[prev.length - 1]?.v ?? 0.5
      const drift = 0.01 + rng() * 0.012
      const noise = (rng() - 0.5) * 0.14
      const v = Math.min(0.94, Math.max(0.06, last + drift + noise))

      const recentBuy = prev.slice(-3).some((s) => s.mark === "buy")
      let mark: MarkKind = null
      if (!recentBuy && rng() > 0.6) mark = "buy"
      else if (recentBuy && v > last && rng() > 0.4) mark = "sell"

      let nextFeed: FeedEvent | null = null
      if (mark === "buy") {
        nextFeed = { id: ++feedIdRef.current, kind: "buy" }
      } else if (mark === "sell") {
        nextFeed = {
          id: ++feedIdRef.current,
          kind: "sell",
          profitPct: Math.round((0.15 + rng() * 0.85) * 100) / 100,
        }
      }

      const next = prev.slice(1)
      next.push({ v, mark })
      seriesRef.current = next

      setSeries(next)
      setStatusIdx((i) => (i + 1) % STATUS_PHRASES.length)
      if (nextFeed) setFeed((f) => [nextFeed as FeedEvent, ...f].slice(0, 3))
    }

    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [seed])

  const d = useMemo(() => pathFrom(series), [series])
  const stepX = 100 / (POINTS - 1)
  const lastV = series[series.length - 1]?.v ?? 0.5

  return (
    <div className="nexus-fix-sim mb-3 overflow-hidden rounded-lg border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Desk active
        </span>
        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <Activity className="h-3 w-3" />
          {STATUS_PHRASES[statusIdx]}
        </span>
      </div>

      <div className="relative h-9 w-full">
        <svg
          viewBox="0 0 100 36"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`fixsim-fill-${seed}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L100 36 L0 36 Z`} fill={`url(#fixsim-fill-${seed})`} />
          <path
            d={d}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {series.map((s, i) =>
            s.mark ? (
              <circle
                key={i}
                cx={(i * stepX).toFixed(2)}
                cy={(36 - s.v * 32 - 2).toFixed(2)}
                r="1.7"
                fill={s.mark === "buy" ? "rgb(16 185 129)" : "rgb(244 63 94)"}
                stroke="white"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
          <circle
            cx="100"
            cy={(36 - lastV * 32 - 2).toFixed(2)}
            r="1.4"
            fill="rgb(16 185 129)"
            className="nexus-fix-sim-tip"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <div className="flex items-center gap-2 min-w-0">
          {feed[0] ? (
            <span
              className={
                feed[0].kind === "buy"
                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                  : "font-medium text-rose-500 dark:text-rose-400"
              }
            >
              {feed[0].kind === "buy" ? "Buy cycle recorded" : "Sell cycle recorded"}
              {feed[0].kind === "sell" && feed[0].profitPct != null ? (
                <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                  · bullish trades updated
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">Scanning desk flow…</span>
          )}
        </div>
        <span className="shrink-0 font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">
          {NEXUS_BOT_LABEL}
        </span>
      </div>
    </div>
  )
}
