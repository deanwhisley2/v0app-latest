"use client"

import { useCallback, useRef } from "react"
import {
  consumeFreshLoginLanding,
  consumeUserInitiatedPendingNav,
  normalizeDashboardTab,
  postLoginTab,
  type DashboardMainTab,
} from "@/lib/dashboard-navigation-policy"
import { shouldSkipDashboardTabRestore } from "@/lib/mobile/dashboard-clean-boot"

/**
 * Tracks user-initiated tab changes vs programmatic restores.
 * Server workspace must not override recent user navigation.
 */
export function useDashboardNavigationController(operationalWorkspace: boolean) {
  const lastUserNavAtRef = useRef(0)
  const hydratedRef = useRef(false)

  const markUserNav = useCallback(() => {
    lastUserNavAtRef.current = Date.now()
  }, [])

  const resolveInitialTab = useCallback(
    (sessionTab: string | null | undefined): DashboardMainTab => {
      if (consumeFreshLoginLanding()) {
        return postLoginTab(operationalWorkspace)
      }
      /** Chrome Android: never restore cached tab — always land on Container/Home. */
      if (shouldSkipDashboardTabRestore()) {
        return postLoginTab(operationalWorkspace)
      }
      if (sessionTab) {
        return normalizeDashboardTab(sessionTab, { operationalWorkspace })
      }
      return postLoginTab(operationalWorkspace)
    },
    [operationalWorkspace],
  )

  const shouldApplyServerWorkspace = useCallback((): boolean => {
    if (shouldSkipDashboardTabRestore()) return false
    if (!hydratedRef.current) return false
    const sinceUser = Date.now() - lastUserNavAtRef.current
    if (sinceUser < 12_000) return false
    return true
  }, [])

  const markHydrated = useCallback(() => {
    hydratedRef.current = true
  }, [])

  const consumePendingNav = useCallback(() => {
    if (shouldSkipDashboardTabRestore()) return null
    return consumeUserInitiatedPendingNav()
  }, [])

  return {
    markUserNav,
    resolveInitialTab,
    shouldApplyServerWorkspace,
    markHydrated,
    consumePendingNav,
    normalizeTab: (tab: string) => normalizeDashboardTab(tab, { operationalWorkspace }),
  }
}
