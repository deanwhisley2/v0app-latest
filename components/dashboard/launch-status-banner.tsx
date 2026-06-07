"use client"

import { useMemo } from "react"
import { Sparkles } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { usePlatformLaunch } from "@/hooks/use-platform-launch"
import { useStartupOnboarding } from "@/hooks/use-startup-onboarding"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import {
  STARTUP_CAPITAL_USD_REWARD,
  type LaunchProgramsConfig,
} from "@/lib/platform-launch-config"
import { isAccountOlderThanPromoWindow } from "@/lib/marketing/onboarding-lifecycle"
import { cn } from "@/lib/utils"

function campaignVisible(programs: LaunchProgramsConfig | undefined, active: boolean): boolean {
  if (programs?.new_member_welcome?.enabled === false) return false
  if (programs?.new_member_welcome?.promo_banner === false) return false
  return active || programs?.new_member_welcome?.enabled === true
}

/** Premium conversion strip — new member welcome bonus + platform strengths. */
export function LaunchStatusBanner() {
  const { user } = useAuth()
  const { launch, active, loading } = usePlatformLaunch()
  const { data: onboarding, loading: onboardingLoading } = useStartupOnboarding(Boolean(user))
  const { t, formatUserMoney } = useUserPreferences()

  const accountCreatedAt = user?.created_at ?? onboarding.accountCreatedAt
  const suppressForUser =
    onboarding.suppressOnboardingPromos || isAccountOlderThanPromoWindow(accountCreatedAt)

  const show = !loading && !onboardingLoading && !suppressForUser && campaignVisible(launch?.programs, active)
  const amount = useMemo(() => {
    const usd =
      typeof launch?.programs.new_member_welcome?.usd_reward === "number"
        ? launch.programs.new_member_welcome.usd_reward
        : STARTUP_CAPITAL_USD_REWARD
    return formatUserMoney(usd)
  }, [formatUserMoney, launch?.programs.new_member_welcome?.usd_reward])

  if (!show) return null

  const title = t("marketing.newMember.bannerTitle").replace("{{amount}}", amount)

  return (
    <div
      className={cn(
        "relative overflow-hidden border-b border-primary/25 bg-gradient-to-r from-primary/10 via-background to-amber-500/10",
        "px-3 py-2.5 text-center sm:px-4",
      )}
      role="status"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(245,158,11,0.12),transparent_55%)]" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-3">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          <Sparkles className="h-3 w-3" aria-hidden />
          {t("marketing.newMember.bannerBadge")}
        </span>
        <span className="text-xs font-semibold text-foreground sm:text-sm">{title}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
        <span className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
          {t("marketing.newMember.bannerSubtitle")}
        </span>
      </div>
      <p className="relative mt-1 text-[11px] text-muted-foreground sm:text-xs">
        {t("marketing.newMember.bannerCta")}{" "}
        <span className="font-semibold text-primary md:hidden">{t("marketing.newMember.mobileBannerCta")}</span>
      </p>
    </div>
  )
}
