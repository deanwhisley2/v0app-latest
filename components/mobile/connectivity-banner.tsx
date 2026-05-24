"use client"

import { Wifi, WifiOff, X } from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useMobileConnectivity } from "@/contexts/MobileConnectivityContext"

export function ConnectivityBanner() {
  const { t } = useUserPreferences()
  const { showOfflineBanner, showReconnectedBanner, dismissOfflineBanner } = useMobileConnectivity()

  if (!showOfflineBanner && !showReconnectedBanner) return null

  const bannerStyle = { paddingTop: "max(0.5rem, env(safe-area-inset-top))" } as const

  if (showReconnectedBanner) {
    return (
      <div
        role="status"
        className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary md:hidden"
        style={bannerStyle}
      >
        <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("mobile.connectivity.reconnected")}
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 md:hidden"
      style={bannerStyle}
    >
      <div className="flex min-w-0 items-center gap-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t("mobile.connectivity.offline")}</span>
      </div>
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
