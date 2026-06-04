"use client"

import { Flame, Sparkles, Star, TrendingUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { cn } from "@/lib/utils"

const TESTIMONIAL_KEYS = [
  "marketing.newMember.testimonial1",
  "marketing.newMember.testimonial2",
  "marketing.newMember.testimonial3",
] as const

type StartupBonusCampaignPanelProps = {
  amountLabel: string
  hasFixedTrade: boolean
  onHowToTrade: () => void
  onStartTrading: () => void
  onDismiss: () => void
  className?: string
}

export function StartupBonusCampaignPanel({
  amountLabel,
  hasFixedTrade,
  onHowToTrade,
  onStartTrading,
  onDismiss,
  className,
}: StartupBonusCampaignPanelProps) {
  const { t } = useUserPreferences()

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-primary/5 to-emerald-500/10 p-4 shadow-sm",
        "nexus-mobile-low-gpu:from-muted/40 nexus-mobile-low-gpu:via-card nexus-mobile-low-gpu:to-card nexus-mobile-low-gpu:shadow-none",
        className,
      )}
      aria-label={t("marketing.newMember.panelAria")}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl nexus-mobile-low-gpu:hidden" />

      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card/90 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss live campaign banner"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="relative flex flex-wrap items-start justify-between gap-3 pr-10">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              <Flame className="h-3 w-3" aria-hidden />
              {t("marketing.newMember.panelHotOffer")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" aria-hidden />
              {t("marketing.newMember.bannerBadge")}
            </span>
          </div>
          <h2 className="text-base font-semibold leading-snug text-foreground sm:text-lg">
            {t("marketing.newMember.panelTitle").replace("{{amount}}", amountLabel)}
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {hasFixedTrade
              ? t("marketing.newMember.panelActiveBody")
              : t("marketing.newMember.panelPendingBody")}
          </p>
        </div>
      </div>

      <ul className="relative mt-3 space-y-2">
        {TESTIMONIAL_KEYS.map((key) => (
          <li
            key={key}
            className="flex gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs leading-relaxed text-foreground sm:text-sm"
          >
            <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="w-full touch-manipulation sm:flex-1"
          onClick={onHowToTrade}
        >
          <TrendingUp className="mr-2 h-4 w-4" aria-hidden />
          {t("marketing.newMember.howToTradeButton")}
        </Button>
        {!hasFixedTrade ? (
          <Button
            type="button"
            className="w-full touch-manipulation bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-1"
            onClick={onStartTrading}
          >
            {t("marketing.newMember.releaseBullish")}
          </Button>
        ) : (
          <Button type="button" className="w-full touch-manipulation sm:flex-1" onClick={onStartTrading}>
            {t("marketing.newMember.panelViewTrades")}
          </Button>
        )}
      </div>
    </section>
  )
}
