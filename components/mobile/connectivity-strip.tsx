"use client"

import { Wifi, WifiOff, X } from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useMobileConnectivity } from "@/contexts/MobileConnectivityContext"

/** In-flow connectivity status — not fixed; scrolls with the page (avoids stacking with header). */
export function ConnectivityStrip() {
  const { t } = useUserPreferences()
  const { showOfflineBanner, showReconnectedBanner, dismissOfflineBanner } = useMobileConnectivity()

  if (!showOfflineBanner && !showReconnectedBanner) return null

  if (showReconnectedBanner) {
    return (
      <div
        role="status"
        className="border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary md:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("mobile.connectivity.reconnected")}
        </span>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-200 md:hidden"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t("mobile.connectivity.offline")}</span>
      </span>
      <button
        type="button"
        onClick={dismissOfflineBanner}
        className="nexus-touch-press shrink-0 rounded-md p-1 touch-manipulation"
        aria-label={t("common.dismiss")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
