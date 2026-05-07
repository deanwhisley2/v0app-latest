"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/contexts/AuthContext"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import type { OperationalBootstrapV1 } from "@/lib/operational-bootstrap-types"
import { NEXUS_OPERATIONAL_BC } from "@/lib/nexus-operational-sync-broadcast"
import { supabase } from "@/lib/supabaseClient"

type OperationalBootstrapCtx = {
  snapshot: OperationalBootstrapV1 | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const OperationalBootstrapContext = createContext<OperationalBootstrapCtx | undefined>(undefined)

export function OperationalBootstrapProvider({ children }: { children: ReactNode }) {
  const { user, isGuestSession } = useAuth()
  const [snapshot, setSnapshot] = useState<OperationalBootstrapV1 | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBootstrap = useCallback(async () => {
    if (!user?.id || isGuestSession || isDevLocalOnly()) {
      setSnapshot(null)
      setError(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setSnapshot(null)
        setError("no_access_token")
        return
      }
      const res = await fetch("/api/user/operational-bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(typeof j.error === "string" ? j.error : `HTTP ${res.status}`)
        setSnapshot(null)
        return
      }
      const json = (await res.json()) as OperationalBootstrapV1
      setSnapshot(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch_failed")
      setSnapshot(null)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, isGuestSession])

  useEffect(() => {
    void fetchBootstrap()
  }, [fetchBootstrap])

  useEffect(() => {
    const onSync = () => {
      void fetchBootstrap()
    }
    window.addEventListener("nexus-exchanges-synced", onSync as EventListener)
    window.addEventListener("nexus-workspace-synced", onSync as EventListener)
    return () => {
      window.removeEventListener("nexus-exchanges-synced", onSync as EventListener)
      window.removeEventListener("nexus-workspace-synced", onSync as EventListener)
    }
  }, [fetchBootstrap])

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return
    let ch: BroadcastChannel | null = null
    let last = 0
    try {
      ch = new BroadcastChannel(NEXUS_OPERATIONAL_BC)
      ch.onmessage = (ev: MessageEvent) => {
        if (ev?.data?.type !== "nexus_prefs_bump") return
        const now = Date.now()
        if (now - last < 2500) return
        last = now
        void fetchBootstrap()
      }
    } catch {
      /* ignore */
    }
    return () => ch?.close()
  }, [fetchBootstrap])

  const value = useMemo(
    () => ({ snapshot, isLoading, error, refetch: fetchBootstrap }),
    [snapshot, isLoading, error, fetchBootstrap]
  )

  return (
    <OperationalBootstrapContext.Provider value={value}>{children}</OperationalBootstrapContext.Provider>
  )
}

export function useOperationalBootstrap() {
  const ctx = useContext(OperationalBootstrapContext)
  if (ctx === undefined) {
    throw new Error("useOperationalBootstrap must be used within OperationalBootstrapProvider")
  }
  return ctx
}
