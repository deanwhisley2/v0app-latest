"use client"

import { useEffect, useRef } from "react"
import { Layers, Plus, Wallet } from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { cn } from "@/lib/utils"

const GUIDE_STORAGE_KEY = "nexus_home_guide_collapsed_v1"

type Props = {
  t: (key: string) => string
  className?: string
}

const steps = [
  { icon: Plus, key: "stepFund", hintKey: "stepFundHint" },
  { icon: Layers, key: "stepContainer", hintKey: "stepContainerHint" },
  { icon: Wallet, key: "stepWithdraw", hintKey: "stepWithdrawHint" },
] as const

/** Workspace guide — native details/summary (no transform animations). */
export function HomeOverviewGuide({ t, className }: Props) {
  const { currency } = useUserPreferences()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const trustLine = t("home.overview.trustLine").replace("{{currency}}", currency)

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
      className={cn("nexus-home-panel rounded-2xl border border-border/50 bg-card/95 shadow-[var(--shadow-card)]", className)}
      onToggle={onToggle}
    >
      <summary className="nexus-home-guide-summary flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{t("home.overview.eyebrow")}</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{t("home.overview.compactLine")}</p>
          <p className="mt-1 text-[11px] font-medium text-primary">{t("container.info.viewDetails")}</p>
        </div>
      </summary>

      <div className="border-t border-border px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <li
                key={step.key}
                className="flex min-h-[48px] items-start gap-2.5 rounded-xl border border-border bg-muted/35 px-3 py-2.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">{t(`home.overview.${step.key}`)}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {t(`home.overview.${step.hintKey}`)}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 text-[11px] text-muted-foreground">{trustLine}</p>
      </div>
    </details>
  )
}
