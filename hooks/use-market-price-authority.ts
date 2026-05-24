"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MARKET_PRICE_DISPLAY_BLEND_MS } from "@/lib/market-price-constants"
import { shouldBlendMarketPriceDisplay } from "@/lib/mobile/workspace-render-policy"
import {
  getLiveSymbolPrice,
  subscribeMarketPriceAuthority,
} from "@/lib/client/market-price-authority-bus"
import { useMarketAuthoritySelector } from "@/hooks/use-market-authority-selector"
import type { Coin } from "@/lib/coins-data"

function blendPrice(from: number, to: number, t: number): number {
  if (t >= 1) return to
  return from + (to - from) * t
}

/**
 * Canonical market authority hook (useSyncExternalStore — isolated from navigation state).
 */
export function useMarketPriceAuthority() {
  const snap = useMarketAuthoritySelector((s) => s)
  const [displayBtcUsd, setDisplayBtcUsd] = useState<number | null>(snap.btc?.priceUsd ?? null)
  const blendRef = useRef<number | null>(null)

  useEffect(() => {
    const unsub = subscribeMarketPriceAuthority(() => {})
    return unsub
  }, [])

  const targetBtc = snap.btc?.priceUsd ?? null

  useEffect(() => {
    if (targetBtc == null) return
    if (!shouldBlendMarketPriceDisplay()) {
      setDisplayBtcUsd(targetBtc)
      return
    }
    const from = displayBtcUsd ?? targetBtc
    if (Math.abs(from - targetBtc) < 0.01) {
      setDisplayBtcUsd(targetBtc)
      return
    }
    const start = performance.now()
    if (blendRef.current) cancelAnimationFrame(blendRef.current)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MARKET_PRICE_DISPLAY_BLEND_MS)
      setDisplayBtcUsd(blendPrice(from, targetBtc, t))
      if (t < 1) blendRef.current = requestAnimationFrame(tick)
    }
    blendRef.current = requestAnimationFrame(tick)
    return () => {
      if (blendRef.current) cancelAnimationFrame(blendRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blend from prior display
  }, [targetBtc, snap.authorityRevision])

  const getSymbolPrice = useCallback(
    (symbol: string): number | null => {
      const sym = symbol.toUpperCase()
      const row = snap.pricesBySymbol[sym]
      if (row?.priceUsd > 0) return row.priceUsd
      if (sym === "BTC") return displayBtcUsd ?? snap.btc?.priceUsd ?? null
      const coin = snap.catalog.find((c) => c.symbol === sym)
      return coin?.price ?? null
    },
    [snap.pricesBySymbol, snap.catalog, snap.btc, displayBtcUsd]
  )

  const marketFeed = useMemo(
    () => ({
      status:
        snap.status === "idle" || snap.status === "loading"
          ? ("loading" as const)
          : ("live" as const),
      catalog: applyDisplayPrices(snap.catalog, displayBtcUsd),
      gainers: snap.gainers,
      volumeLeaders: snap.volumeLeaders,
      updatedAt: snap.refreshedAt || snap.btc?.updatedAt,
      source: snap.source,
    }),
    [snap, displayBtcUsd]
  )

  const btcLive = useMemo(() => {
    if (!snap.btc && displayBtcUsd == null) {
      return { status: "loading" as const }
    }
    const price = displayBtcUsd ?? snap.btc?.priceUsd ?? 0
    return {
      status: "live" as const,
      priceUsd: price,
      change24hPct: snap.btc?.change24hPct ?? 0,
      updatedAt: snap.btc?.updatedAt ?? snap.refreshedAt,
      authorityRevision: snap.authorityRevision,
      source: snap.btc?.provider ? `authority:${snap.btc.provider}` : "authority",
      stale: Boolean(snap.btc?.stale),
    }
  }, [snap, displayBtcUsd])

  return {
    snap,
    marketFeed,
    btc: btcLive,
    getSymbolPrice,
    authorityRevision: snap.authorityRevision,
    refreshedAt: snap.refreshedAt,
  }
}

function applyDisplayPrices(catalog: Coin[], blendedBtc: number | null): Coin[] {
  if (blendedBtc == null) return catalog
  return catalog.map((c) => (c.symbol === "BTC" ? { ...c, price: blendedBtc } : c))
}

export type MarketFeedFromAuthority = ReturnType<typeof useMarketPriceAuthority>["marketFeed"]
