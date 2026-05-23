"use client"

import type { ComponentType, ReactNode } from "react"
import {
  ArrowDownLeft,
  ArrowRightLeft,
  Eye,
  EyeOff,
  Lock,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { DashboardProfileWelcome } from "@/components/dashboard/dashboard-profile-welcome"
import { HomeOverviewGuide } from "@/components/dashboard/home-overview-guide"
import { Button } from "@/components/ui/button"
import { PROCESSING_COPY } from "@/lib/nexus-financial-policy"
import { cn } from "@/lib/utils"
import { NX_GROWTH_BADGE, NX_PANEL } from "@/lib/nexus-ui-surfaces"

export type WithdrawalEligibilityHint = {
  minUsd: number
  maxUsd: number
  cooldownActive: boolean
  msRemaining: number
}

type RetailBalanceHomePanelsProps = {
  t: (key: string) => string
  formatUserMoney: (usd: number) => string
  showBalance: boolean
  onToggleShowBalance: () => void
  fullName?: string | null
  mainBalance: number
  /** Principal locked in open copy/fixed sessions (`current_stake`). */
  containerLockedUsd?: number
  activeContainerTradeCount?: number
  totalEarnings: number
  containerWithdrawableEarnings: number
  withdrawalPendingBalance: number
  isContainerFlowBusy: boolean
  withdrawalEligibility: WithdrawalEligibilityHint | null
  onAddFunds: () => void
  onWithdraw: () => void
  onTransferToMain: () => void
}

const panelClass = cn("nexus-home-panel block w-full", NX_PANEL)

function MetricCard({
  label,
  value,
  hint,
  children,
  className,
  icon: Icon,
  iconClassName,
}: {
  label: string
  value: string
  hint?: string
  children?: ReactNode
  className?: string
  icon: ComponentType<{ className?: string }>
  iconClassName?: string
}) {
  return (
    <div className={cn(panelClass, "p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 min-h-[1.75rem] font-mono text-lg font-semibold tabular-nums leading-none tracking-tight text-foreground sm:text-xl">
            {value}
          </p>
          {hint ? <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/80",
            iconClassName
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>
      {children}
    </div>
  )
}

export function RetailBalanceHomePanels({
  t,
  formatUserMoney,
  showBalance,
  onToggleShowBalance,
  fullName,
  mainBalance,
  containerLockedUsd = 0,
  activeContainerTradeCount = 0,
  totalEarnings,
  containerWithdrawableEarnings,
  withdrawalPendingBalance,
  isContainerFlowBusy,
  withdrawalEligibility,
  onAddFunds,
  onWithdraw,
  onTransferToMain,
}: RetailBalanceHomePanelsProps) {
  const masked = "••••••••"
  const mainDisplay = showBalance ? formatUserMoney(mainBalance) : masked
  const pocketDisplay = showBalance ? formatUserMoney(containerWithdrawableEarnings) : masked

  return (
    <div className="nexus-home-wallet-stack nexus-section-gap flex flex-col pb-3 md:pb-4">
      <DashboardProfileWelcome fullName={fullName} t={t} className="nexus-home-panel" />

      <HomeOverviewGuide t={t} />

      {/* Nexus Main */}
      <section className={panelClass} aria-label={t("funding.balance.mainTitle")}>
        <div className="border-b border-border/50 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/80">
              <Wallet className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {t("funding.balance.mainTitle")}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">{t("funding.balance.mainHint")}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid grid-cols-[1fr_auto] items-start gap-3">
            <div className="min-w-0 space-y-2.5">
              <p className="text-sm font-medium text-muted-foreground">{t("home.overview.availableLabel")}</p>
              <p className={cn(NX_GROWTH_BADGE, "max-w-full")}>
                <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {t("home.overview.earningsBadge")}: {showBalance ? formatUserMoney(totalEarnings) : "••••"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleShowBalance}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              title={showBalance ? "Hide balance" : "Show balance"}
              aria-label={showBalance ? "Hide balance" : "Show balance"}
            >
              {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-4 min-h-[2.5rem] font-mono text-[1.75rem] font-semibold tabular-nums leading-tight tracking-tight text-foreground sm:min-h-[2.75rem] sm:text-[2rem]">
            {mainDisplay}
          </p>
          {showBalance && containerLockedUsd > 0.009 ? (
            <p className="mt-2 text-sm leading-snug text-muted-foreground">
              {t("home.overview.lockedInTrades").replace(
                "{{amount}}",
                formatUserMoney(containerLockedUsd),
              )}
            </p>
          ) : null}
          {activeContainerTradeCount > 0 ? (
            <p className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
              {t("home.overview.activeTradesBanner").replace(
                "{{count}}",
                String(activeContainerTradeCount),
              )}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border/50 px-5 py-4 sm:px-6">
          <Button type="button" size="lg" className="min-h-12 w-full font-semibold" onClick={onAddFunds}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {t("funding.button.addFunds")}
          </Button>
          <Button type="button" size="lg" variant="outline" className="min-h-12 w-full font-semibold" onClick={onWithdraw}>
            <ArrowDownLeft className="h-4 w-4 shrink-0" aria-hidden />
            {t("funding.button.withdraw")}
          </Button>
        </div>
      </section>

      {/* Pocket balance */}
      <section className={cn(panelClass, "p-5 sm:p-6")} aria-label={t("funding.balance.liquidTitle")}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("funding.balance.liquidTitle")}
            </p>
            <p className="mt-2 min-h-[2rem] font-mono text-[1.75rem] font-semibold tabular-nums leading-none tracking-tight text-foreground sm:min-h-[2.25rem] sm:text-[2rem]">
              {pocketDisplay}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("funding.balance.pocketHint")}</p>
          </div>
          <Button
            type="button"
            size="lg"
            className="min-h-12 w-full shrink-0 font-semibold sm:min-w-[12rem]"
            onClick={onTransferToMain}
            disabled={isContainerFlowBusy || containerWithdrawableEarnings <= 0}
          >
            <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />
            {isContainerFlowBusy ? t("funding.balance.processing") : t("funding.balance.transferCta")}
          </Button>
        </div>
      </section>

      <MetricCard
        label={t("withdrawal.card.frozenTitle")}
        value={showBalance ? formatUserMoney(withdrawalPendingBalance) : "••••"}
        hint={t("withdrawal.card.frozenBody")}
        icon={Lock}
        iconClassName="text-muted-foreground"
      />

      {withdrawalEligibility ? (
        <div className={cn(panelClass, "px-4 py-3.5 text-sm leading-relaxed text-muted-foreground")}>
          <p className="font-medium text-foreground">{t("withdrawal.modal.ruleOnce")}</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            <li>{t("withdrawal.modal.minLine").replace("{{min}}", formatUserMoney(withdrawalEligibility.minUsd))}</li>
            <li>{t("withdrawal.modal.maxLine").replace("{{max}}", formatUserMoney(withdrawalEligibility.maxUsd))}</li>
            <li className={withdrawalEligibility.cooldownActive ? "text-foreground" : "text-emerald-700 dark:text-emerald-400"}>
              {withdrawalEligibility.cooldownActive
                ? t("withdrawal.modal.waitHours").replace(
                    "{{hours}}",
                    String(Math.max(1, Math.ceil(withdrawalEligibility.msRemaining / 3_600_000)))
                  )
                : t("withdrawal.modal.readyNow")}
            </li>
          </ul>
        </div>
      ) : null}

      <div className={cn(panelClass, "px-4 py-3.5 text-[12px] leading-relaxed text-muted-foreground")}>
        <p>
          <span className="font-medium text-foreground">{t("deposit.timingLabel")}</span> {PROCESSING_COPY.deposits}
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">{t("withdrawal.timingLabel")}</span>{" "}
          {PROCESSING_COPY.withdrawals}
        </p>
      </div>
    </div>
  )
}
