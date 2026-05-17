"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Layers, Plus, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const GUIDE_DISMISS_KEY = "nexus_home_guide_collapsed_v1"

type Props = {
  t: (key: string) => string
  className?: string
}

const steps = [
  { icon: Plus, key: "stepFund", hintKey: "stepFundHint", accent: "text-emerald-600 dark:text-emerald-400" },
  { icon: Layers, key: "stepContainer", hintKey: "stepContainerHint", accent: "text-primary" },
  { icon: Wallet, key: "stepWithdraw", hintKey: "stepWithdrawHint", accent: "text-amber-600/90 dark:text-amber-400/90" },
] as const

/** Subtle workspace guide — collapsible, not a tutorial wall. */
export function HomeOverviewGuide({ t, className }: Props) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(GUIDE_DISMISS_KEY) === "0") setExpanded(true)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = () => {
    setExpanded((v) => {
      const next = !v
      try {
        localStorage.setItem(GUIDE_DISMISS_KEY, next ? "0" : "1")
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/80 bg-card shadow-sm",
        className
      )}
      aria-label={t("home.overview.title")}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex w-full min-h-[52px] items-center justify-between gap-3 px-4 py-3.5 text-start sm:px-5"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/80">
            {t("home.overview.eyebrow")}
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{t("home.overview.compactLine")}</p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
          <div className="border-t border-border/60 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
            <ol className="grid gap-2 sm:grid-cols-3">
              {steps.map((step) => {
                const Icon = step.icon
                return (
                  <li
                    key={step.key}
                    className="flex min-h-[48px] items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/80",
                        step.accent
                      )}
                    >
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
            <p className="mt-3 text-[11px] text-muted-foreground">{t("home.overview.trustLine")}</p>
          </div>
      ) : null}
    </section>
  )
}
