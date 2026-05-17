"use client"

import { useSyncExternalStore } from "react"
import {
  getMarketPriceAuthorityClientState,
  subscribeMarketPriceAuthority,
  type MarketAuthorityClientState,
} from "@/lib/client/market-price-authority-bus"

/**
 * Subscribe to authority store without React useState (isolated from navigation state).
 */
export function useMarketAuthoritySelector<T>(selector: (state: MarketAuthorityClientState) => T): T {
  return useSyncExternalStore(
    subscribeMarketPriceAuthority,
    () => selector(getMarketPriceAuthorityClientState()),
    () => selector(getMarketPriceAuthorityClientState())
  )
}

/** Shallow-stable selector for catalog + revision (ticker surfaces). */
export function useMarketAuthorityCatalog() {
  const revision = useMarketAuthoritySelector((s) => s.authorityRevision)
  const catalog = useMarketAuthoritySelector((s) => s.catalog)
  const status = useMarketAuthoritySelector((s) => s.status)
  const refreshedAt = useMarketAuthoritySelector((s) => s.refreshedAt)
  const source = useMarketAuthoritySelector((s) => s.source)
  return { revision, catalog, status, refreshedAt, source }
}
