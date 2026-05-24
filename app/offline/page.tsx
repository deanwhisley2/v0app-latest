"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Smartphone, Wifi } from "lucide-react"
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
    return () => window.removeEventListener("online", retry)
  }, [])

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center safe-area-pb">
      <Smartphone className="h-10 w-10 text-primary" aria-hidden />
      <h1 className="text-lg font-semibold">{t("mobile.offline.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("mobile.offline.lead")}</p>
      <div className="flex flex-col gap-2 pt-2">
        <Link
          href="/dashboard"
          className="nexus-touch-press rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground touch-manipulation"
        >
          {t("mobile.offline.retry")}
        </Link>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Wifi className="h-3.5 w-3.5" aria-hidden />
          {t("mobile.offline.autoRetry")}
        </p>
      </div>
    </main>
  )
}
