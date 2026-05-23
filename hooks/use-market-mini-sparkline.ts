"use client"

import { useEffect, useMemo, useState } from "react"
import { fetchSparklineCloses } from "@/lib/client/market-sparkline-cache"

export function useMarketMiniSparkline(symbol: string, refreshKey = 0) {
  const [closes, setCloses] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const sym = symbol.toUpperCase()

    const load = async () => {
      try {
        const next = await fetchSparklineCloses(sym, 1)
        if (!cancelled && next.length >= 2) setCloses(next)
      } catch {
        /* keep prior series */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const id = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [symbol, refreshKey])

  const changePct = useMemo(() => {
    if (closes.length < 2) return null
    const first = closes[0]
    const last = closes[closes.length - 1]
    if (!(first > 0)) return null
    return ((last - first) / first) * 100
  }, [closes])

  return { closes, changePct, loading }
}
