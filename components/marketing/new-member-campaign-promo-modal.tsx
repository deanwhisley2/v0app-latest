"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sparkles, X } from "lucide-react"
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
import { useStartupOnboarding } from "@/hooks/use-startup-onboarding"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { STARTUP_CAPITAL_USD_REWARD } from "@/lib/platform-launch-config"
import {
  dismissNewMemberCampaignPromo,
  isNewMemberCampaignPromoDismissed,
} from "@/lib/marketing/new-member-campaign-promo-dismiss"
import { cn } from "@/lib/utils"

const BULLET_KEYS = [
  "marketing.newMember.bulletIntelligence",
  "marketing.newMember.bulletCopy",
  "marketing.newMember.bulletFixed",
  "marketing.newMember.bulletWithdraw",
  "marketing.newMember.bulletBonus",
] as const

type NewMemberCampaignPromoModalProps = {
  enabled?: boolean
}

export function NewMemberCampaignPromoModal({ enabled = true }: NewMemberCampaignPromoModalProps) {
  const { launch, active, loading } = usePlatformLaunch()
  const { data: onboarding, loading: onboardingLoading } = useStartupOnboarding(enabled)
  const { t, formatUserMoney, language, country } = useUserPreferences()
  const [open, setOpen] = useState(false)

  const promoOn = Boolean(
    enabled &&
      !loading &&
      !onboardingLoading &&
      !onboarding.hasStartupBonus &&
      launch?.programs.new_member_welcome?.enabled !== false &&
      launch?.programs.new_member_welcome?.promo_modal !== false &&
      (active || launch?.programs.new_member_welcome?.enabled === true),
  )

  useEffect(() => {
    if (!promoOn) return
    if (isNewMemberCampaignPromoDismissed()) return
    const id = window.requestAnimationFrame(() => setOpen(true))
    return () => window.cancelAnimationFrame(id)
  }, [promoOn])

  const amount = useMemo(() => {
    const usd =
      typeof launch?.programs.new_member_welcome?.usd_reward === "number"
        ? launch.programs.new_member_welcome.usd_reward
        : STARTUP_CAPITAL_USD_REWARD
    return formatUserMoney(usd)
  }, [formatUserMoney, launch?.programs.new_member_welcome?.usd_reward])

  const rewardLine = useMemo(
    () => t("marketing.newMember.modalReward").replace("{{amount}}", amount),
    [amount, t],
  )

  const dismiss = useCallback(() => {
    dismissNewMemberCampaignPromo()
    setOpen(false)
  }, [])

  if (!promoOn) return null

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? dismiss() : setOpen(next))}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-h-[min(92vh,760px)] gap-0 overflow-hidden border-primary/30 p-0 sm:max-w-lg",
          "bg-gradient-to-b from-card via-card to-background shadow-2xl shadow-primary/10",
        )}
        lang={language}
        data-corridor={country ?? undefined}
      >
        <div className="relative border-b border-border/80 bg-gradient-to-r from-primary/15 via-primary/5 to-amber-500/10 px-4 py-3 sm:px-6">
          <DialogHeader className="gap-2 pr-8 text-left">
            <p className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" aria-hidden />
              {t("marketing.newMember.bannerBadge")}
            </p>
            <DialogTitle className="text-base leading-snug font-semibold text-foreground sm:text-lg">
              {t("marketing.newMember.modalTitle")}
            </DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {t("marketing.newMember.modalLead")}
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close new member campaign promotion"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-none sm:px-6 sm:py-5">
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-foreground">
            {rewardLine}
          </p>
          <ul className="space-y-2">
            {BULLET_KEYS.map((key) => (
              <li key={key} className="flex gap-2 text-sm text-foreground">
                <span className="text-primary" aria-hidden>
                  ✔
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("marketing.newMember.modalFooter")}
          </p>
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("marketing.newMember.panelHotOffer")}
            </p>
            {(["marketing.newMember.testimonial1", "marketing.newMember.testimonial2"] as const).map((key) => (
              <p key={key} className="text-xs leading-relaxed text-foreground">
                {t(key)}
              </p>
            ))}
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 border-t border-border/80 bg-muted/30 px-4 py-3 sm:px-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={dismiss}>
            {t("marketing.newMember.onboardSkipForNow")}
          </Button>
          <Button type="button" className="w-full sm:w-auto" onClick={dismiss}>
            {t("marketing.newMember.modalContinue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
