"use client"

import { useEffect, useRef } from "react"
import { isAndroidChromeBrowser } from "@/lib/mobile/chrome-android-safe-mode"
import { supabase } from "@/lib/supabaseClient"

type Role = "admin" | "retailer_desk" | "trading_user"

export type OperationalRealtimeConfig = {
  enabled: boolean
  /** Delay subscribe (ms) — avoids realtime + navigation race on Chrome Android chat mount. */
  subscribeDelayMs?: number
  role: Role
  userId: string | null
  retailerProfileId?: string | null
  onRetailerFundRequests?: () => void
  onWithdrawals?: () => void
  onTreasury?: () => void
  onContainerEvents?: () => void
  onAccountNotifications?: () => void
  onRetailerApplications?: () => void
  onSupportThreads?: () => void
  onSupportMessages?: () => void
}

const DEBOUNCE_MS = 280

/**
 * Supabase Realtime `postgres_changes` — row visibility follows RLS for the current JWT.
 * Debounces burst events; reconnects on tab focus and channel errors.
 */
export function useOperationalRealtime(config: OperationalRealtimeConfig): void {
  const cfgRef = useRef(config)
  cfgRef.current = config
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const channelGen = useRef(0)

  useEffect(() => {
    const c = cfgRef.current
    if (!c.enabled || !c.userId) return

    let cancelled = false
    let teardown: (() => void) | undefined
    const delay = Math.max(0, c.subscribeDelayMs ?? (isAndroidChromeBrowser() ? 300 : 0))
    const startTimer = window.setTimeout(() => {
      if (cancelled) return
      const uid = cfgRef.current.userId
      if (!uid) return

    const gen = ++channelGen.current
    const channelName = `operational_${cfgRef.current.role}_${uid.slice(0, 8)}_${gen}`
    const ch = supabase.channel(channelName)

    const fireDebounced = (key: string, fn?: () => void) => {
      if (!fn) return
      const existing = debounceTimers.current.get(key)
      if (existing) clearTimeout(existing)
      debounceTimers.current.set(
        key,
        setTimeout(() => {
          debounceTimers.current.delete(key)
          fn()
        }, DEBOUNCE_MS),
      )
    }

    const bind = (table: string, fire: () => void, filter?: string) => {
      const opts: {
        event: "*"
        schema: "public"
        table: string
        filter?: string
      } = { event: "*", schema: "public", table }
      if (filter) opts.filter = filter
      ch.on("postgres_changes", opts, () => fireDebounced(table + (filter ?? ""), fire))
    }

    if (c.role === "admin") {
      bind("retailer_fund_requests", () => cfgRef.current.onRetailerFundRequests?.())
      bind("withdrawal_requests", () => cfgRef.current.onWithdrawals?.())
      bind("treasury_balances", () => cfgRef.current.onTreasury?.(), "wallet_type=eq.MAIN_TREASURY")
      bind("container_balance_events", () => cfgRef.current.onContainerEvents?.())
      bind("retailer_applications", () => cfgRef.current.onRetailerApplications?.())
      bind("operational_support_threads", () => cfgRef.current.onSupportThreads?.())
      bind("operational_support_messages", () => cfgRef.current.onSupportMessages?.())
      bind("user_account_notifications", () => cfgRef.current.onAccountNotifications?.())
    } else if (c.role === "retailer_desk") {
      const rid = c.retailerProfileId?.trim()
      if (rid) {
        bind(
          "retailer_fund_requests",
          () => cfgRef.current.onRetailerFundRequests?.(),
          `retailer_id=eq.${rid}`,
        )
      }
      bind("withdrawal_requests", () => cfgRef.current.onWithdrawals?.())
      bind("operational_support_threads", () => cfgRef.current.onSupportThreads?.())
      bind("operational_support_messages", () => cfgRef.current.onSupportMessages?.())
      bind("user_account_notifications", () => cfgRef.current.onAccountNotifications?.())
    } else {
      bind(
        "retailer_fund_requests",
        () => cfgRef.current.onRetailerFundRequests?.(),
        `user_id=eq.${uid}`,
      )
      bind("withdrawal_requests", () => cfgRef.current.onWithdrawals?.(), `user_id=eq.${uid}`)
      bind("user_account_notifications", () => cfgRef.current.onAccountNotifications?.())
      bind("operational_support_threads", () => cfgRef.current.onSupportThreads?.())
      bind("operational_support_messages", () => cfgRef.current.onSupportMessages?.())
      bind("container_balance_events", () => cfgRef.current.onContainerEvents?.())
    }

    const refreshAll = () => {
      cfgRef.current.onSupportThreads?.()
      cfgRef.current.onSupportMessages?.()
      cfgRef.current.onAccountNotifications?.()
    }

    void ch.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[realtime] operational channel error, resubscribing:", channelName)
        void supabase.removeChannel(ch)
        channelGen.current += 1
        refreshAll()
      }
      if (status === "SUBSCRIBED") {
        refreshAll()
      }
    })

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshAll()
    }
    document.addEventListener("visibilitychange", onVisibility)

    teardown = () => {
      document.removeEventListener("visibilitychange", onVisibility)
      for (const t of debounceTimers.current.values()) clearTimeout(t)
      debounceTimers.current.clear()
      void supabase.removeChannel(ch)
    }
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      teardown?.()
    }
  }, [config.enabled, config.role, config.userId, config.retailerProfileId, config.subscribeDelayMs])
}
