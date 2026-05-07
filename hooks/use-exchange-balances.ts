"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchAllExchangeBalances, type ExchangeBalance } from "@/lib/exchange-balance-api"
import {
  clearPendingExchangeConnections,
  persistExchangeConnections,
  stashPendingExchangeConnections,
  takePendingExchangeConnections,
} from "@/lib/exchange-connections-client"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"

export interface ConnectedExchange {
  id: string
  name: string
  apiKey: string
  apiSecret: string
  apiPassphrase?: string
  frozen: boolean
  isDefault?: boolean
  balance?: number
  lastSync?: Date
}

export interface ExchangeBalanceState {
  balances: Record<string, ExchangeBalance>
  totalUsd: number
  isPolling: boolean
  lastUpdated: number
  error: string | null
}

const POLL_INTERVAL_MS = 1000 // 1 second polling for real-time accuracy
/** Debounce burst writes (toggle default, etc.) into one POST with retries. */
const PERSIST_DEBOUNCE_MS = 320

export function useExchangeBalances() {
  const { user, isGuestSession } = useAuth()
  const op = useOperationalBootstrap()
  const [exchanges, setExchanges] = useState<ConnectedExchange[]>([])
  const [balanceState, setBalanceState] = useState<ExchangeBalanceState>({
    balances: {},
    totalUsd: 0,
    isPolling: false,
    lastUpdated: 0,
    error: null,
  })
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const exchangesRef = useRef(exchanges)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingServerPayloadRef = useRef<unknown[] | null>(null)
  const userRef = useRef(user)
  const isGuestRef = useRef(isGuestSession)
  /** After bootstrap: upload local-only keys once per user if server has no connections. */
  const attemptedLocalHydrateRef = useRef<string | null>(null)

  useEffect(() => {
    userRef.current = user
    isGuestRef.current = isGuestSession
  }, [user, isGuestSession])

  // Keep ref in sync
  useEffect(() => {
    exchangesRef.current = exchanges
  }, [exchanges])

  const flushServerPersist = useCallback(async () => {
    const connections = pendingServerPayloadRef.current
    pendingServerPayloadRef.current = null
    if (!connections || isGuestRef.current) return
    const u = userRef.current
    if (!u?.id) return

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      stashPendingExchangeConnections(connections)
      return
    }

    const result = await persistExchangeConnections(token, connections)
    if (result.ok) {
      clearPendingExchangeConnections()
      if (result.metaSyncFailed) {
        console.warn("[exchange-connections] profiles saved; JWT mirror:", result.metaSyncFailed)
      }
      window.dispatchEvent(new Event("nexus-exchanges-synced"))
      return
    }

    stashPendingExchangeConnections(connections)
    console.warn("[exchange-connections] server persist failed:", result.error)

    try {
      const currentMeta = (u.user_metadata as Record<string, unknown>) ?? {}
      await supabase.auth.updateUser({
        data: {
          ...currentMeta,
          nexus_exchanges: connections,
        },
      })
      window.dispatchEvent(new Event("nexus-exchanges-synced"))
    } catch (e) {
      console.warn("[exchange-connections] JWT fallback failed:", e)
    }
  }, [])

  // DB bootstrap (profiles.nexus_exchanges) → JWT metadata → localStorage — never stale-local before server truth for real accounts.
  useEffect(() => {
    if (typeof window === "undefined") return

    const mapRows = (rows: any[]): ConnectedExchange[] =>
      rows.map((ex: any) => ({
        id: ex.id,
        name: ex.name,
        apiKey: ex._apiKey || ex.apiKey || "",
        apiSecret: ex._apiSecret || "",
        apiPassphrase: ex._apiPassphrase || "",
        frozen: ex.frozen || false,
        isDefault: ex.isDefault || false,
        balance: typeof ex.balance === "number" ? ex.balance : 0,
        lastSync: ex.lastSync ? new Date(ex.lastSync) : undefined,
      }))

    if (!user || isGuestSession) {
      const stored = localStorage.getItem("nexus_exchanges")
      if (stored) {
        try {
          setExchanges(mapRows(JSON.parse(stored)))
        } catch (e) {
          console.error("Failed to parse exchanges:", e)
        }
      } else {
        setExchanges([])
      }
      return
    }

    const dbRows = op.snapshot?.exchangeConnections
    if (Array.isArray(dbRows) && dbRows.length > 0) {
      setExchanges(mapRows(dbRows as any[]))
      try {
        localStorage.setItem("nexus_exchanges", JSON.stringify(dbRows))
      } catch {
        /* ignore quota */
      }
      return
    }

    if (op.isLoading) return

    const profileRows = (user.user_metadata as { nexus_exchanges?: unknown } | undefined)?.nexus_exchanges
    if (Array.isArray(profileRows) && profileRows.length > 0) {
      setExchanges(mapRows(profileRows as any[]))
      return
    }

    const stored = localStorage.getItem("nexus_exchanges")
    if (stored) {
      try {
        setExchanges(mapRows(JSON.parse(stored)))
      } catch (e) {
        console.error("Failed to parse exchanges:", e)
      }
    }
  }, [user, isGuestSession, op.snapshot, op.isLoading])

  /** If Postgres/JWT have no exchanges but this browser still has keys in localStorage, push once (repair cross-device mount). */
  useEffect(() => {
    if (!user?.id) {
      attemptedLocalHydrateRef.current = null
      return
    }
    if (isGuestSession || op.isLoading) return

    const remote = op.snapshot?.exchangeConnections
    if (Array.isArray(remote) && remote.length > 0) return
    if (attemptedLocalHydrateRef.current === user.id) return

    const stored = localStorage.getItem("nexus_exchanges")
    if (!stored) return
    let parsed: unknown[]
    try {
      parsed = JSON.parse(stored) as unknown[]
    } catch {
      return
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return
    const hasSecrets = parsed.some(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        "_apiKey" in row &&
        typeof (row as { _apiKey?: unknown })._apiKey === "string" &&
        ((row as { _apiKey: string })._apiKey?.length ?? 0) > 0
    )
    if (!hasSecrets) return

    attemptedLocalHydrateRef.current = user.id
    pendingServerPayloadRef.current = parsed
    void flushServerPersist()
  }, [user?.id, isGuestSession, op.isLoading, op.snapshot?.exchangeConnections, flushServerPersist])

  // Retry queued payloads when the tab wakes or the browser goes online.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!user?.id || isGuestSession) return

    const retryPending = () => {
      void (async () => {
        const pending = takePendingExchangeConnections()
        if (!pending?.length) return
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const r = await persistExchangeConnections(token, pending)
        if (r.ok) {
          clearPendingExchangeConnections()
          window.dispatchEvent(new Event("nexus-exchanges-synced"))
        }
      })()
    }

    window.addEventListener("online", retryPending)
    const onVis = () => {
      if (document.visibilityState === "visible") retryPending()
    }
    document.addEventListener("visibilitychange", onVis)
    retryPending()
    return () => {
      window.removeEventListener("online", retryPending)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [user?.id, isGuestSession])

  useEffect(
    () => () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    },
    []
  )

  // Save locally immediately; sync to Postgres + Auth via debounced POST (retries + offline queue).
  const saveExchanges = useCallback(
    async (updated: ConnectedExchange[]) => {
      if (typeof window === "undefined") return

      const toStore = updated.map((ex) => ({
        id: ex.id,
        name: ex.name,
        apiKey: ex.apiKey ? ex.apiKey.slice(0, 8) + "..." + ex.apiKey.slice(-4) : undefined,
        _apiKey: ex.apiKey,
        _apiSecret: ex.apiSecret,
        _apiPassphrase: ex.apiPassphrase,
        frozen: ex.frozen,
        isDefault: ex.isDefault,
        balance: ex.balance,
        lastSync: ex.lastSync,
      }))
      try {
        localStorage.setItem("nexus_exchanges", JSON.stringify(toStore))
      } catch {
        /* quota */
      }

      if (!userRef.current?.id || isGuestRef.current) return

      pendingServerPayloadRef.current = toStore
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        void flushServerPersist()
      }, PERSIST_DEBOUNCE_MS)
    },
    [flushServerPersist]
  )

  // Toggle freeze/unfreeze for an exchange
  const toggleFreeze = useCallback((exchangeId: string) => {
    setExchanges((prev) => {
      const updated = prev.map((ex) =>
        ex.id === exchangeId ? { ...ex, frozen: !ex.frozen } : ex
      )
      void saveExchanges(updated)
      return updated
    })
  }, [saveExchanges])

  // Add or update an exchange connection
  const connectExchange = useCallback((
    id: string,
    name: string,
    apiKey: string,
    apiSecret: string,
    apiPassphrase?: string
  ) => {
    setExchanges((prev) => {
      const existing = prev.find((ex) => ex.id === id)
      let updated: ConnectedExchange[]
      
      if (existing) {
        updated = prev.map((ex) =>
          ex.id === id
            ? { ...ex, apiKey, apiSecret, apiPassphrase, frozen: false, lastSync: new Date() }
            : ex
        )
      } else {
        const isDefault = prev.length === 0
        updated = [
          ...prev,
          {
            id,
            name,
            apiKey,
            apiSecret,
            apiPassphrase,
            frozen: false,
            isDefault,
            balance: 0,
            lastSync: new Date(),
          },
        ]
      }
      
      void saveExchanges(updated)
      return updated
    })
  }, [saveExchanges])

  // Disconnect an exchange
  const disconnectExchange = useCallback((exchangeId: string) => {
    setExchanges((prev) => {
      const updated = prev.filter((ex) => ex.id !== exchangeId)
      void saveExchanges(updated)
      return updated
    })
  }, [saveExchanges])

  // Set default exchange
  const setDefaultExchange = useCallback((exchangeId: string) => {
    setExchanges((prev) => {
      const updated = prev.map((ex) => ({
        ...ex,
        isDefault: ex.id === exchangeId,
      }))
      void saveExchanges(updated)
      return updated
    })
  }, [saveExchanges])

  // Poll balances every second
  useEffect(() => {
    const needsPassphrase = new Set(["bitget", "okx", "kucoin"])
    const activeExchanges = exchanges.filter((ex) => {
      if (ex.frozen || !ex.apiKey || !ex.apiSecret) return false
      if (needsPassphrase.has(ex.id) && !(ex.apiPassphrase || "").trim()) return false
      return true
    })

    if (activeExchanges.length === 0) {
      setBalanceState((prev) => ({
        ...prev,
        isPolling: false,
        error: null,
      }))
      return
    }

    const poll = async () => {
      try {
        const balances = await fetchAllExchangeBalances(
          activeExchanges.map((ex) => ({
            id: ex.id,
            apiKey: ex.apiKey,
            apiSecret: ex.apiSecret,
            apiPassphrase: ex.apiPassphrase,
            frozen: ex.frozen,
          }))
        )

        const totalUsd = Object.values(balances).reduce(
          (sum, b) => sum + (b.error ? 0 : b.totalUsd),
          0
        )

        setBalanceState({
          balances,
          totalUsd,
          isPolling: true,
          lastUpdated: Date.now(),
          error: null,
        })

        // Update exchange balances in state
        setExchanges((prev) =>
          prev.map((ex) => {
            const balance = balances[ex.id]
            return {
              ...ex,
              balance: balance && !balance.error ? balance.totalUsd : ex.balance,
              lastSync: balance ? new Date(balance.timestamp) : ex.lastSync,
            }
          })
        )
      } catch (err: any) {
        setBalanceState((prev) => ({
          ...prev,
          error: err.message || "Polling error",
        }))
      }
    }

    // Initial poll
    poll()

    // Poll every second
    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [exchanges.length, exchanges.map((e) => `${e.id}:${e.frozen}:${e.apiKey?.slice(-4)}`).join(",")])

  return {
    exchanges,
    balanceState,
    toggleFreeze,
    connectExchange,
    disconnectExchange,
    setDefaultExchange,
    saveExchanges,
  }
}
