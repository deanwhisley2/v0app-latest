"use client"

/**
 * Active trade session — visual NexusBot market simulation (client-only).
 * No live prices, reserves, or payout coupling.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Activity } from "lucide-react"
import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"
import {
  candleChartLayout,
  createVisualSimRuntime,
  stepVisualSimulation,
  visualTickDelayMs,
  type VisualSimSnapshot,
} from "@/lib/nexus-bot/visual-market-simulation"
import { sessionProgressPct } from "@/lib/nexus-bot/session-earnings-ux"

const NEXUS_BOT_LABEL = "NexusBot"

type Props = {
  sessionId: string
  deskSalt?: string
  sessionStartAt?: string | null
  sessionEndAt?: string | null
}

export function FixedTradeSimulation({
  sessionId,
  deskSalt = "",
  sessionStartAt,
  sessionEndAt,
}: Props) {
  const seed = `${sessionId}:${deskSalt}`
  const lowGpu = isMobileLowGpuMode()

  const runtimeRef = useRef(createVisualSimRuntime(seed))
  const [snap, setSnap] = useState<VisualSimSnapshot>(() => {
    const rt = createVisualSimRuntime(seed)
    runtimeRef.current = rt
    return stepVisualSimulation(rt, 0)
  })

  const layout = useMemo(() => candleChartLayout(snap.candles), [snap.candles])
  const candleWidth = snap.candles.length > 0 ? 100 / snap.candles.length : 4

  useEffect(() => {
    if (lowGpu) return
    if (typeof window === "undefined") return

    runtimeRef.current = createVisualSimRuntime(seed)
    setSnap(stepVisualSimulation(runtimeRef.current, 0))

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = () => {
      if (cancelled) return
      if (document.visibilityState === "hidden") {
        timer = setTimeout(tick, 2500)
        return
      }
      const progress = sessionProgressPct({
        startAt: sessionStartAt,
        endAt: sessionEndAt,
      })
      const next = stepVisualSimulation(runtimeRef.current, progress)
      setSnap(next)
      timer = setTimeout(tick, visualTickDelayMs(runtimeRef.current.rng, next.isHolding))
    }

    timer = setTimeout(tick, 1200)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [lowGpu, seed, sessionEndAt, sessionStartAt])

  const feedLine = snap.feed[0]

  return (
    <div className="nexus-fix-sim mb-3 overflow-hidden rounded-lg border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="relative flex h-2 w-2">
            {!lowGpu ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            ) : null}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {snap.asset} desk
        </span>
        <span
          className={`flex max-w-[65%] items-center gap-1 text-end text-[11px] font-medium ${
            snap.isHolding ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <Activity className="h-3 w-3 shrink-0" />
          <span className="truncate">{snap.statusLine}</span>
        </span>
      </div>

      <div className="relative h-11 w-full">
        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          {layout.paths.map((p, i) => {
            const half = candleWidth * 0.32
            const x = p.x
            const fill = p.up ? "rgb(16 185 129)" : "rgb(244 63 94)"
            const c = snap.candles[i]
            return (
              <g key={`c-${i}-${x}`}>
                <line
                  x1={x}
                  y1={p.wickTop}
                  x2={x}
                  y2={p.wickBottom}
                  stroke={fill}
                  strokeWidth="0.35"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.85}
                />
                <rect
                  x={x - half}
                  y={p.bodyY}
                  width={half * 2}
                  height={p.bodyH}
                  fill={fill}
                  opacity={0.92}
                  rx="0.15"
                />
                {c?.mark === "buy" ? (
                  <text
                    x={x}
                    y={Math.max(2, p.wickTop - 1)}
                    textAnchor="middle"
                    fontSize="2.2"
                    fill="rgb(16 185 129)"
                    fontWeight="bold"
                  >
                    B
                  </text>
                ) : null}
                {c?.mark === "sell" ? (
                  <text
                    x={x}
                    y={Math.max(2, p.wickTop - 1)}
                    textAnchor="middle"
                    fontSize="2.2"
                    fill="rgb(244 63 94)"
                    fontWeight="bold"
                  >
                    S
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <div className="min-w-0">
          {feedLine ? (
            <span
              className={
                feedLine.tone === "buy"
                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                  : feedLine.tone === "sell"
                    ? "font-medium text-rose-500 dark:text-rose-400"
                    : feedLine.tone === "hold"
                      ? "font-medium text-amber-600 dark:text-amber-400"
                      : feedLine.tone === "asset"
                        ? "font-medium text-sky-600 dark:text-sky-400"
                        : "text-muted-foreground"
              }
            >
              {feedLine.text}
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
