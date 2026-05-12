"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabaseClient"

type Role = "admin" | "retailer_desk" | "trading_user"

export type OperationalRealtimeConfig = {
  enabled: boolean
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

/**
 * Supabase Realtime `postgres_changes` — row visibility follows RLS for the current JWT.
 */
export function useOperationalRealtime(config: OperationalRealtimeConfig): void {
  const cfgRef = useRef(config)
  cfgRef.current = config

  useEffect(() => {
    const c = cfgRef.current
    if (!c.enabled || !c.userId) return

    const channelName = `operational_${c.role}_${c.userId.slice(0, 8)}`
    const ch = supabase.channel(channelName)

    const bind = (table: string, fire: () => void, filter?: string) => {
      const opts: {
        event: "*"
        schema: "public"
        table: string
        filter?: string
      } = { event: "*", schema: "public", table }
      if (filter) opts.filter = filter
      ch.on("postgres_changes", opts, () => fire())
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
        `user_id=eq.${c.userId}`,
      )
      bind("withdrawal_requests", () => cfgRef.current.onWithdrawals?.(), `user_id=eq.${c.userId}`)
      bind("user_account_notifications", () => cfgRef.current.onAccountNotifications?.())
      bind("operational_support_threads", () => cfgRef.current.onSupportThreads?.())
      bind("operational_support_messages", () => cfgRef.current.onSupportMessages?.())
      bind("container_balance_events", () => cfgRef.current.onContainerEvents?.())
    }

    void ch.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[realtime] operational channel error:", channelName)
      }
    })

    return () => {
      void supabase.removeChannel(ch)
    }
  }, [config.enabled, config.role, config.userId, config.retailerProfileId])
}
