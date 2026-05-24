"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Loader2, Smartphone } from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"

export default function OfflinePage() {
  const { t } = useUserPreferences()

  useEffect(() => {
    const retry = () => {
      if (navigator.onLine) {
        window.location.href = "/dashboard"
      }
    }
    window.addEventListener("online", retry)
    const interval = window.setInterval(retry, 4000)
    return () => {
      window.removeEventListener("online", retry)
      window.clearInterval(interval)
    }
  }, [])

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center safe-area-pb">
      <Smartphone className="h-10 w-10 text-primary" aria-hidden />
      <h1 className="text-lg font-semibold">{t("mobile.offline.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("mobile.offline.lead")}</p>
      <div className="flex flex-col items-center gap-3 pt-2">
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" aria-hidden />
          {t("mobile.connectivity.reconnecting")}
        </p>
        <Link
          href="/dashboard"
          className="nexus-touch-press rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium touch-manipulation"
        >
          {t("mobile.offline.retry")}
        </Link>
        <p className="text-xs text-muted-foreground">{t("mobile.offline.autoRetry")}</p>
      </div>
    </main>
  )
}
