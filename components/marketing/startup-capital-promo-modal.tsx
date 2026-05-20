"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { usePlatformLaunch } from "@/hooks/use-platform-launch"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { STARTUP_CAPITAL_USD_REWARD } from "@/lib/platform-launch-config"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "nexus_startup_capital_promo_v1"

const BULLET_KEYS = [
  "marketing.startupCapital.bulletLocal",
  "marketing.startupCapital.bulletTracking",
  "marketing.startupCapital.bulletMulti",
  "marketing.startupCapital.bulletInfra",
  "marketing.startupCapital.bulletReferral",
] as const

type StartupCapitalPromoModalProps = {
  enabled?: boolean
}

export function StartupCapitalPromoModal({ enabled = true }: StartupCapitalPromoModalProps) {
  const { launch, active, loading } = usePlatformLaunch()
  const { t, formatUserMoney, language, country } = useUserPreferences()
  const [open, setOpen] = useState(false)

  const promoOn = Boolean(
    enabled &&
      !loading &&
      active &&
      launch?.programs.startup_capital?.enabled &&
      launch.programs.startup_capital?.promo_modal !== false,
  )

  useEffect(() => {
    if (!promoOn) return
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return
    } catch {
      /* private mode */
    }
    const id = window.requestAnimationFrame(() => setOpen(true))
    return () => window.cancelAnimationFrame(id)
  }, [promoOn])

  const rewardHint = useMemo(() => {
    const usd =
      typeof launch?.programs.startup_capital?.usd_reward === "number"
        ? launch.programs.startup_capital.usd_reward
        : STARTUP_CAPITAL_USD_REWARD
    const amount = formatUserMoney(usd)
    return t("marketing.startupCapital.rewardHint").replace("{{amount}}", amount)
  }, [formatUserMoney, launch?.programs.startup_capital?.usd_reward, t])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* ignore */
    }
    setOpen(false)
  }, [])

  if (!promoOn) return null

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? dismiss() : setOpen(next))}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-h-[min(92vh,760px)] gap-0 overflow-hidden border-amber-500/30 p-0 sm:max-w-lg",
          "bg-gradient-to-b from-card via-card to-background shadow-2xl shadow-amber-500/10",
        )}
        lang={language}
        data-corridor={country ?? undefined}
      >
        <div className="relative border-b border-border/80 bg-amber-500/10 px-4 py-3 sm:px-6">
          <DialogHeader className="gap-2 pr-8 text-left">
            <DialogTitle className="text-base leading-snug font-semibold text-foreground sm:text-lg">
              {t("marketing.startupCapital.title")}
            </DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {t("marketing.startupCapital.lead")}
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close startup capital promotion"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-none sm:px-6 sm:py-5">
          <p className="text-sm leading-relaxed text-foreground">{t("marketing.startupCapital.body")}</p>
          <p className="text-xs text-muted-foreground">{rewardHint}</p>
          <ul className="space-y-2">
            {BULLET_KEYS.map((key) => (
              <li key={key} className="flex gap-2 text-sm text-foreground">
                <span className="text-amber-600 dark:text-amber-400" aria-hidden>
                  ✔
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("marketing.startupCapital.footer")}
          </p>
        </div>
        <DialogFooter className="border-t border-border/80 bg-muted/30 px-4 py-3 sm:px-6">
          <Button type="button" className="w-full sm:w-auto" onClick={dismiss}>
            {t("marketing.startupCapital.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
