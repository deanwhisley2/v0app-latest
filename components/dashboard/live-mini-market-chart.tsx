"use client"

import { useMemo } from "react"
import { useMarketMiniSparkline } from "@/hooks/use-market-mini-sparkline"

function seriesToPath(closes: number[], w: number, h: number): string {
  if (closes.length < 2) return ""
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || max * 0.002 || 1
  const pts: string[] = []
  for (let i = 0; i < closes.length; i++) {
    const x = (i / (closes.length - 1)) * w
    const y = h - ((closes[i] - min) / span) * h * 0.88 - h * 0.06
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return pts.join(" ")
}

export function LiveMiniMarketChart({
  symbol,
  refreshKey = 0,
  className,
}: {
  symbol: string
  refreshKey?: number
  className?: string
}) {
  const { closes, changePct, loading } = useMarketMiniSparkline(symbol, refreshKey)
  const w = 100
  const h = 36
  const path = useMemo(() => seriesToPath(closes, w, h), [closes])
  const up = (changePct ?? 0) >= 0
  const stroke = up ? "var(--primary-green)" : "var(--danger-red)"
  const gradId = `live-spark-${symbol}-${refreshKey}`

  if (!path && loading) {
    return (
      <div
        className={`h-9 w-full animate-pulse rounded-lg bg-muted/40 max-md:animate-none ${className ?? ""}`}
        aria-hidden
      />
    )
  }

  if (!path) return <div className={`h-9 w-full rounded-lg bg-muted/25 ${className ?? ""}`} aria-hidden />

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`h-9 w-full ${className ?? ""}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
