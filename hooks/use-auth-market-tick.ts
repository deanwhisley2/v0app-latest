"use client"

import { useEffect, useState } from "react"

/** Single lightweight BTC quote for auth trust strip — no polling storm. */
export function useAuthMarketTick() {
  const [btcUsd, setBtcUsd] = useState<number | null>(null)
  const [change24h, setChange24h] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/market/btc", { cache: "no-store" })
        const data = (await res.json()) as {
          ok?: boolean
          btc?: { priceUsd?: number; change24hPct?: number }
        }
        if (cancelled || !res.ok || !data.ok) return
        if (typeof data.btc?.priceUsd === "number") setBtcUsd(data.btc.priceUsd)
        if (typeof data.btc?.change24hPct === "number") setChange24h(data.btc.change24hPct)
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { btcUsd, change24h, loaded }
}
