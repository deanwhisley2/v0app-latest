"use client"

import { Sparkles, TrendingUp, Shield, Rocket, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { cn } from "@/lib/utils"

type StartupBonusWelcomeStep = 1 | 2 | 3

type StartupBonusWelcomeFlowProps = {
  step: StartupBonusWelcomeStep | null
  amountLabel: string
  openingTrade: boolean
  onDismissStep: () => void
  onMaybeLater: () => void
  onReleaseBullish: () => void
  onOpenSecuritySetup: () => void
  onOpenHowToTrade: () => void
}

export function StartupBonusWelcomeFlow({
  step,
  amountLabel,
  openingTrade,
  onDismissStep,
  onMaybeLater,
  onReleaseBullish,
  onOpenSecuritySetup,
  onOpenHowToTrade,
}: StartupBonusWelcomeFlowProps) {
  const { t } = useUserPreferences()
  const open = step !== null

  const titles: Record<StartupBonusWelcomeStep, string> = {
    1: t("marketing.newMember.onboardStep1Title"),
    2: t("marketing.newMember.onboardStep2Title"),
    3: t("marketing.newMember.onboardStep3Title"),
  }

  const bodies: Record<StartupBonusWelcomeStep, string> = {
    1: t("marketing.newMember.onboardStep1Body").replace("{{amount}}", amountLabel),
    2: t("marketing.newMember.onboardStep2Body").replace("{{amount}}", amountLabel),
    3: t("marketing.newMember.onboardStep3Body"),
  }

  const icons: Record<StartupBonusWelcomeStep, typeof Sparkles> = {
    1: Sparkles,
    2: Rocket,
    3: Shield,
  }

  if (!step) return null
  const Icon = icons[step]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onMaybeLater()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "gap-0 overflow-hidden border-primary/30 p-0 sm:max-w-md",
          "bg-gradient-to-b from-card via-card to-background shadow-xl",
        )}
      >
        <div className="relative border-b border-border/80 bg-gradient-to-r from-primary/15 via-primary/5 to-emerald-500/10 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onMaybeLater}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close startup capital guide"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <DialogHeader className="gap-2 pr-8 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("marketing.newMember.onboardProgress")
                .replace("{{step}}", String(step))
                .replace("{{total}}", "3")}
            </p>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold leading-snug sm:text-lg">{titles[step]}</DialogTitle>
                <DialogDescription className="mt-1 text-left text-xs leading-relaxed sm:text-sm">
                  {bodies[step]}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {step === 2 ? (
          <div className="px-4 py-3 sm:px-6">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                {t("marketing.newMember.activateLabel")}
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">{amountLabel}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t("marketing.newMember.activateHint")}</p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 border-t border-border/80 px-4 py-4 sm:px-6">
          {step === 1 ? (
            <>
              <Button type="button" className="w-full touch-manipulation" onClick={onDismissStep}>
                {t("marketing.newMember.onboardStep1Cta")}
              </Button>
              <Button type="button" variant="outline" className="w-full touch-manipulation" onClick={onOpenHowToTrade}>
                <TrendingUp className="mr-2 h-4 w-4" aria-hidden />
                {t("marketing.newMember.howToTradeButton")}
              </Button>
              <Button type="button" variant="ghost" className="w-full touch-manipulation" onClick={onMaybeLater}>
                {t("marketing.newMember.onboardSkipForNow")}
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Button
                type="button"
                disabled={openingTrade}
                className="w-full touch-manipulation bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={onReleaseBullish}
              >
                {openingTrade ? t("marketing.newMember.activateOpening") : t("marketing.newMember.releaseBullish")}
              </Button>
              <Button type="button" variant="ghost" className="w-full touch-manipulation" onClick={onMaybeLater}>
                {t("marketing.newMember.onboardSkipForNow")}
              </Button>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Button type="button" className="w-full touch-manipulation" onClick={onOpenSecuritySetup}>
                {t("marketing.newMember.onboardStep3Cta")}
              </Button>
              <Button type="button" variant="ghost" className="w-full touch-manipulation" onClick={onMaybeLater}>
                {t("marketing.newMember.onboardSkipForNow")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
