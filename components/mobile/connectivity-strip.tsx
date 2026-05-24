"use client"

import { Loader2, Wifi, X } from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useMobileConnectivity } from "@/contexts/MobileConnectivityContext"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

/** Lightweight in-flow connection status — non-blocking, debounced for weak mobile networks. */
export function ConnectivityStrip() {
  if (isPwaSafeMode()) return null
  const { t } = useUserPreferences()
  const { showDegradedBanner, showOfflineBanner, showReconnectedBanner, dismissOfflineBanner } =
    useMobileConnectivity()

  if (!showDegradedBanner && !showOfflineBanner && !showReconnectedBanner) return null

  if (showReconnectedBanner) {
    return (
      <StatusBar className="border-border/40 bg-muted/30 text-muted-foreground">
        <Wifi className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        {t("mobile.connectivity.reconnected")}
      </StatusBar>
    )
  }

  if (showDegradedBanner) {
    return (
      <StatusBar className="border-border/30 bg-background/80 text-muted-foreground">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" aria-hidden />
        {t("mobile.connectivity.reconnecting")}
      </StatusBar>
    )
  }

  return (
    <div
      role="status"
      className="relative border-b border-border/40 bg-muted/20 px-4 py-1.5 text-center text-[11px] font-normal text-muted-foreground md:hidden"
    >
      <span className="inline-flex items-center justify-center gap-2 pr-6">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" aria-hidden />
        <span className="truncate">{t("mobile.connectivity.offline")}</span>
      </span>
      <button
        type="button"
        onClick={dismissOfflineBanner}
        className="nexus-touch-press absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 touch-manipulation opacity-70"
        aria-label={t("common.dismiss")}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function StatusBar({
  children,
  className,
}: {
  children: React.ReactNode
  className: string
}) {
  return (
    <div
      role="status"
      className={`border-b px-4 py-1.5 text-center text-[11px] font-normal md:hidden ${className}`}
    >
      <span className="inline-flex items-center justify-center gap-2">{children}</span>
    </div>
  )
}
