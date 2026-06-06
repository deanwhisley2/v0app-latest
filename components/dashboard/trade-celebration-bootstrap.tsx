"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { TradeSessionProfitCelebration } from "@/components/dashboard/trade-session-profit-celebration"
import { useAuth } from "@/contexts/AuthContext"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { dispatchCustomerLedgerBump } from "@/lib/client/customer-ledger-sync"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import {
  claimTradeCelebrationSession,
  isTradeCelebrationClaimed,
} from "@/lib/nexus-bot/trade-celebration-coordination"
import { supabase } from "@/lib/supabaseClient"

type ProfitCelebration = {
  sessionId: string
  profitUsd: number
  summary: string
  hasEarnings?: boolean
  celebrationKind?: "earnings" | "stake_return"
  stakeReturnedUsd?: number
}

/**
 * Global offline-earnings fireworks — runs on every authenticated dashboard load,
 * independent of active tab (container vs desk vs settings).
 */
export function TradeCelebrationBootstrap() {
  const { user, isGuestSession, authReady } = useAuth()
  const { addNotification } = useNexusNotifications()
  const { formatUserMoney } = useUserPreferences()
  const [celebration, setCelebration] = useState<ProfitCelebration | null>(null)
  const handledRef = useRef<string | null>(null)
  const fetchedForUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!authReady || isGuestSession || !user?.id || isDevLocalOnly()) return
    if (fetchedForUserRef.current === user.id) return
    fetchedForUserRef.current = user.id
    setCelebration(null)
    handledRef.current = null

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch("/api/user/nexus-bot", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) return

      const j = (await res.json()) as { pendingProfitCelebration?: ProfitCelebration | null }
      const pending = j.pendingProfitCelebration
      if (!pending?.sessionId) return
      if (isTradeCelebrationClaimed(pending.sessionId)) return

      claimTradeCelebrationSession(pending.sessionId)
      setCelebration(pending)
    })()
  }, [authReady, isGuestSession, user?.id])

  useEffect(() => {
    if (!celebration?.sessionId) return
    if (handledRef.current === celebration.sessionId) return
    handledRef.current = celebration.sessionId
    dispatchCustomerLedgerBump("nexus_trade_session_complete")

    const hasEarnings =
      celebration.celebrationKind === "earnings" ||
      (celebration.hasEarnings ?? celebration.profitUsd > 0)
    addNotification({
      type: "trade",
      title: hasEarnings ? "Trade session complete" : "Session complete",
      message: hasEarnings
        ? `Released earnings ${formatUserMoney(celebration.profitUsd)} credited to Pocket.`
        : celebration.stakeReturnedUsd && celebration.stakeReturnedUsd > 0
          ? `Trading capital ${formatUserMoney(celebration.stakeReturnedUsd)} returned to Nexus Main.`
          : "Your trade session finished successfully.",
      detailText: celebration.summary,
      nav: { kind: "trade" },
    })
  }, [addNotification, celebration, formatUserMoney])

  const dismissCelebration = useCallback(async () => {
    if (!celebration) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) {
      await fetch("/api/user/nexus-bot", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "ack_profit_celebration",
          sessionId: celebration.sessionId,
        }),
      })
    }
    setCelebration(null)
  }, [celebration])

  if (!celebration) return null

  return (
    <TradeSessionProfitCelebration
      profitUsd={celebration.profitUsd}
      stakeReturnedUsd={celebration.stakeReturnedUsd}
      celebrationKind={celebration.celebrationKind}
      summary={celebration.summary}
      formatMoney={formatUserMoney}
      onDismiss={() => void dismissCelebration()}
    />
  )
}
