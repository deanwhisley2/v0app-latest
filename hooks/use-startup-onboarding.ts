"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export type StartupOnboardingSnapshot = {
  hasStartupBonus: boolean
  startupBonusReceivedAt: string | null
  startupCapitalLockedUsd: number
  recommendedCommitUsd: number
  hasFixedTrade: boolean
  needsSecuritySetup: boolean
  starterFixUnlock: boolean
  starterFixPersonaId: string
  showCampaignPromo: boolean
  campaignContentRevision: string
}

const EMPTY: StartupOnboardingSnapshot = {
  hasStartupBonus: false,
  startupBonusReceivedAt: null,
  startupCapitalLockedUsd: 0,
  recommendedCommitUsd: 0,
  hasFixedTrade: false,
  needsSecuritySetup: false,
  starterFixUnlock: false,
  starterFixPersonaId: "fix_l1_t1",
  showCampaignPromo: false,
  campaignContentRevision: "",
}

export function useStartupOnboarding(enabled = true) {
  const [data, setData] = useState<StartupOnboardingSnapshot>(EMPTY)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return null
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setData(EMPTY)
        setLoading(false)
        return null
      }
      const res = await fetch("/api/user/startup-onboarding", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) {
        setError("Could not load onboarding status.")
        setLoading(false)
        return null
      }
      const json = (await res.json()) as StartupOnboardingSnapshot & { ok?: boolean }
      const next = {
        hasStartupBonus: Boolean(json.hasStartupBonus),
        startupBonusReceivedAt: json.startupBonusReceivedAt ?? null,
        startupCapitalLockedUsd: Number(json.startupCapitalLockedUsd ?? 0),
        recommendedCommitUsd: Number(json.recommendedCommitUsd ?? 0),
        hasFixedTrade: Boolean(json.hasFixedTrade),
        needsSecuritySetup: Boolean(json.needsSecuritySetup),
        starterFixUnlock: Boolean(json.starterFixUnlock),
        starterFixPersonaId: json.starterFixPersonaId ?? "fix_l1_t1",
        showCampaignPromo: Boolean(json.showCampaignPromo),
        campaignContentRevision: String(json.campaignContentRevision ?? ""),
      }
      setData(next)
      setError(null)
      setLoading(false)
      return next
    } catch {
      setError("Could not load onboarding status.")
      setLoading(false)
      return null
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
