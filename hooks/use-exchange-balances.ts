"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchAllExchangeBalances, type ExchangeBalance } from "@/lib/exchange-balance-api"
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

  // Keep ref in sync
  useEffect(() => {
    exchangesRef.current = exchanges
  }, [exchanges])

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

  // Save exchanges locally and to account metadata (cross-device).
  const saveExchanges = useCallback(async (updated: ConnectedExchange[]) => {
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
    localStorage.setItem("nexus_exchanges", JSON.stringify(toStore))

    if (user && !isGuestSession) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (token) {
          const res = await fetch("/api/user/exchange-connections", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ connections: toStore }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            console.warn(
              "[exchange-connections] persistence failed:",
              typeof body?.error === "string" ? body.error : res.status
            )
          }
        }
      } catch (e) {
        console.warn("[exchange-connections]", e)
      }

      const currentMeta = (user.user_metadata as Record<string, unknown>) ?? {}
      await supabase.auth.updateUser({
        data: {
          ...currentMeta,
          nexus_exchanges: toStore,
        },
      })
      window.dispatchEvent(new Event("nexus-exchanges-synced"))
    }
  }, [user, isGuestSession])

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
