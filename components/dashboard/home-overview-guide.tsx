"use client"

import { useEffect, useRef } from "react"
import { BookOpen } from "lucide-react"
import { NexusQuickGuide } from "@/components/dashboard/nexus-quick-guide"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { cn } from "@/lib/utils"

const GUIDE_STORAGE_KEY = "nexus_home_guide_collapsed_v1"

type Props = {
  t: (key: string) => string
  className?: string
}

/** Collapsible workspace quick start — matches live member journey. */
export function HomeOverviewGuide({ t, className }: Props) {
  const { currency } = useUserPreferences()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const trustLine = t("guide.quickStart.trustLine").replace("{{currency}}", currency)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(GUIDE_STORAGE_KEY)
      if (stored === "1" && detailsRef.current) detailsRef.current.open = true
    } catch {
      /* ignore */
    }
  }, [])

  const onToggle = () => {
    try {
      localStorage.setItem(GUIDE_STORAGE_KEY, detailsRef.current?.open ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  return (
    <details
      ref={detailsRef}
      className={cn("nexus-home-panel border-border/30 shadow-[var(--shadow-card)]", className)}
      onToggle={onToggle}
    >
      <summary className="nexus-home-guide-summary flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden />
            {t("guide.quickStart.badge")}
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{t("guide.quickStart.compactLine")}</p>
          <p className="mt-1 text-[11px] font-medium text-primary">{t("container.info.viewDetails")}</p>
        </div>
      </summary>

      <div className="border-t border-border px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{t("guide.quickStart.lead")}</p>
        <NexusQuickGuide t={t} layout="grid" showLearnMore />
        <p className="mt-3 text-[11px] text-muted-foreground">{trustLine}</p>
      </div>
    </details>
  )
}
