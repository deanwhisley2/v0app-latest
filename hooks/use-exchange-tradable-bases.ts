"use client"

import { useCallback, useEffect, useState } from "react"
import type { TradableBasesFetchStatus } from "@/lib/exchange-coin-support"

export type TradableBasesStatus = TradableBasesFetchStatus

/**
 * Loads USDT spot base symbols for the user’s selected exchange (public route).
 * When disabled or no exchangeId, returns idle + null bases (desk analysis only).
 */
export function useExchangeTradableBases(exchangeId: string | undefined, enabled: boolean) {
  const [bases, setBases] = useState<Set<string> | null>(null)
  const [status, setStatus] = useState<TradableBasesStatus>("idle")
  const [source, setSource] = useState<string | undefined>(undefined)

  const load = useCallback(async () => {
    if (!enabled || !exchangeId?.trim()) {
      setBases(null)
      setStatus("idle")
      setSource(undefined)
      return
    }
    const id = exchangeId.trim().toLowerCase()
    setStatus("loading")
    setBases(null)
    try {
      const res = await fetch(`/api/exchange/tradable-symbols?exchangeId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      })
      if (res.status === 503) {
        setStatus("blocked")
        setSource(undefined)
        return
      }
      const data = (await res.json()) as {
        ok?: boolean
        bases?: string[]
        source?: string
        error?: string
      }
      if (!res.ok || !data.ok || !Array.isArray(data.bases)) {
        if (res.status === 502 && data.error?.includes("Unsupported")) {
          setStatus("unsupported")
        } else {
          setStatus("error")
        }
        setSource(undefined)
        return
      }
      setBases(new Set(data.bases.map((b) => String(b).toUpperCase())))
      setSource(data.source)
      setStatus("ok")
    } catch {
      setStatus("error")
      setBases(null)
      setSource(undefined)
    }
  }, [enabled, exchangeId])

  useEffect(() => {
    void load()
  }, [load])

  return { bases, status, source, reload: load }
}
