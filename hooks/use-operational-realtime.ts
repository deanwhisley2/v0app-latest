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

function removeOperationalChannelsForUser(role: Role, userId: string): void {
  const prefix = `operational_${role}_${userId.slice(0, 8)}_`
  for (const existing of supabase.getChannels()) {
    const topic = (existing as { topic?: string }).topic ?? ""
    if (topic.startsWith(prefix)) {
      void supabase.removeChannel(existing)
    }
  }
}

/**
 * Supabase Realtime `postgres_changes` — row visibility follows RLS for the current JWT.
 * Debounces burst events; reconnects on tab focus and channel errors.
 *
 * All `.on('postgres_changes')` handlers must be registered before `.subscribe()` (supabase-js rule).
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

      const role = cfgRef.current.role
      removeOperationalChannelsForUser(role, uid)

      const gen = ++channelGen.current
      const channelName = `operational_${role}_${uid.slice(0, 8)}_${gen}`
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
        if (cancelled) return
        const opts: {
          event: "*"
          schema: "public"
          table: string
          filter?: string
        } = { event: "*", schema: "public", table }
        if (filter) opts.filter = filter
        ch.on("postgres_changes", opts, () => fireDebounced(table + (filter ?? ""), fire))
      }

      const cfg = cfgRef.current
      if (cfg.role === "admin") {
        bind("retailer_fund_requests", () => cfgRef.current.onRetailerFundRequests?.())
        bind("withdrawal_requests", () => cfgRef.current.onWithdrawals?.())
        bind("treasury_balances", () => cfgRef.current.onTreasury?.(), "wallet_type=eq.MAIN_TREASURY")
        bind("container_balance_events", () => cfgRef.current.onContainerEvents?.())
        bind("retailer_applications", () => cfgRef.current.onRetailerApplications?.())
        bind("operational_support_threads", () => cfgRef.current.onSupportThreads?.())
        bind("operational_support_messages", () => cfgRef.current.onSupportMessages?.())
        bind("user_account_notifications", () => cfgRef.current.onAccountNotifications?.())
      } else if (cfg.role === "retailer_desk") {
        const rid = cfg.retailerProfileId?.trim()
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

      if (cancelled) {
        void supabase.removeChannel(ch)
        return
      }

      const refreshAll = () => {
        cfgRef.current.onSupportThreads?.()
        cfgRef.current.onSupportMessages?.()
        cfgRef.current.onAccountNotifications?.()
      }

      void ch.subscribe((status) => {
        if (cancelled) return
        if (status === "CHANNEL_ERROR") {
          console.warn("[realtime] operational channel error:", channelName)
          void supabase.removeChannel(ch)
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
