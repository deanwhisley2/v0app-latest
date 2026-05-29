"use client"

import { useMemo } from "react"
import { Sparkles } from "lucide-react"
import { usePlatformLaunch } from "@/hooks/use-platform-launch"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { STARTUP_CAPITAL_USD_REWARD } from "@/lib/platform-launch-config"
import { cn } from "@/lib/utils"

const BULLET_KEYS = [
  "marketing.newMember.bulletIntelligence",
  "marketing.newMember.bulletCopy",
  "marketing.newMember.bulletFixed",
  "marketing.newMember.bulletWithdraw",
] as const

/** Register-page promo card — conversion-focused welcome bonus messaging. */
export function NewMemberCampaignRegisterStrip() {
  const { launch, active, loading } = usePlatformLaunch()
  const { t, formatUserMoney } = useUserPreferences()

  const show =
    !loading &&
    launch?.programs.new_member_welcome?.enabled !== false &&
    (active || launch?.programs.new_member_welcome?.enabled === true)

  const amount = useMemo(() => {
    const usd =
      typeof launch?.programs.new_member_welcome?.usd_reward === "number"
        ? launch.programs.new_member_welcome.usd_reward
        : STARTUP_CAPITAL_USD_REWARD
    return formatUserMoney(usd)
  }, [formatUserMoney, launch?.programs.new_member_welcome?.usd_reward])

  if (!show) return null

  return (
    <section
      className={cn(
        "relative mb-4 overflow-hidden rounded-xl border border-primary/25",
        "bg-gradient-to-br from-primary/10 via-card to-amber-500/5 p-4 shadow-sm",
      )}
      aria-label="New member welcome bonus"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
      <div className="relative space-y-3">
        <p className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          <Sparkles className="h-3 w-3" aria-hidden />
          {t("marketing.newMember.registerBadge")}
        </p>
        <h3 className="text-base font-semibold leading-snug text-foreground">
          {t("marketing.newMember.registerTitle").replace("{{amount}}", amount)}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("marketing.newMember.registerLead")}
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {BULLET_KEYS.map((key) => (
            <li key={key} className="flex gap-2 text-xs text-foreground sm:text-sm">
              <span className="text-primary" aria-hidden>
                ✔
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
