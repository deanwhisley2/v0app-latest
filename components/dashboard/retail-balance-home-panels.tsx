"use client"

import type { ComponentType, ReactNode } from "react"
import {
  ArrowDownLeft,
  ArrowRightLeft,
  Eye,
  EyeOff,
  Link2,
  Lock,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { DashboardProfileWelcome } from "@/components/dashboard/dashboard-profile-welcome"
import { HomeOverviewGuide } from "@/components/dashboard/home-overview-guide"
import { WalletInfrastructureCard } from "@/components/dashboard/wallet-infrastructure-card"
import { Button } from "@/components/ui/button"
import { PROCESSING_COPY } from "@/lib/nexus-financial-policy"
import { cn } from "@/lib/utils"

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
  totalEarnings: number
  containerWithdrawableEarnings: number
  withdrawalPendingBalance: number
  activeContainerEarnings: number
  containerFeesPaid: number
  connectedExchangeTotalUsd: number
  connectedExchangeCount?: number
  isContainerFlowBusy: boolean
  withdrawalEligibility: WithdrawalEligibilityHint | null
  onAddFunds: () => void
  onWithdraw: () => void
  onTransferToMain: () => void
  onExtract: () => void
  onManageExchanges?: () => void
}

const cardShell = "rounded-2xl border border-border/90 bg-card shadow-sm"

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
    <div className={cn(cardShell, "p-3.5 sm:p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-lg font-bold tabular-nums leading-none text-foreground sm:text-xl">
            {value}
          </p>
          {hint ? <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/60 ring-1 ring-border/60",
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

const ctaClass =
  "min-h-12 flex-1 basis-[calc(50%-0.25rem)] font-semibold sm:min-h-11 sm:basis-auto sm:flex-initial"

export function RetailBalanceHomePanels({
  t,
  formatUserMoney,
  showBalance,
  onToggleShowBalance,
  fullName,
  mainBalance,
  totalEarnings,
  containerWithdrawableEarnings,
  withdrawalPendingBalance,
  activeContainerEarnings,
  containerFeesPaid,
  connectedExchangeTotalUsd,
  connectedExchangeCount = 0,
  isContainerFlowBusy,
  withdrawalEligibility,
  onAddFunds,
  onWithdraw,
  onTransferToMain,
  onExtract,
  onManageExchanges,
}: RetailBalanceHomePanelsProps) {
  const masked = "••••••••"
  const mainDisplay = showBalance ? formatUserMoney(mainBalance) : masked

  return (
    <div className="space-y-4 pb-1">
      <DashboardProfileWelcome fullName={fullName} t={t} />

      <HomeOverviewGuide t={t} />

      {/* Nexus Main hero — balance first, then equal CTAs */}
      <section className={cn(cardShell, "overflow-hidden")}>
        <div className="border-b border-border/60 bg-muted/20 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
              <Wallet className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("funding.balance.mainTitle")}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">{t("funding.balance.mainHint")}</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-5 sm:px-5 sm:py-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-muted-foreground">{t("home.overview.availableLabel")}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary/80" aria-hidden />
              {t("home.overview.earningsBadge")}: {showBalance ? formatUserMoney(totalEarnings) : "••••"}
            </span>
            <button
              type="button"
              onClick={onToggleShowBalance}
              className="ms-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              title={showBalance ? "Hide balance" : "Show balance"}
              aria-label={showBalance ? "Hide balance" : "Show balance"}
            >
              {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-3 break-all font-mono text-[clamp(1.75rem,7vw,2.25rem)] font-bold leading-tight tabular-nums tracking-tight text-foreground">
            {mainDisplay}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/10 px-4 py-3.5 sm:px-5">
          <Button type="button" size="lg" className={ctaClass} onClick={onAddFunds}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {t("funding.button.addFunds")}
          </Button>
          <Button type="button" size="lg" variant="outline" className={ctaClass} onClick={onWithdraw}>
            <ArrowDownLeft className="h-4 w-4 shrink-0" aria-hidden />
            {t("funding.button.withdraw")}
          </Button>
        </div>
      </section>

      {/* Pocket balance */}
      <section className={cn(cardShell, "border-emerald-500/20 bg-card p-4 sm:p-5")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/90">
              {t("funding.balance.liquidTitle")}
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums leading-none text-foreground sm:text-3xl">
              {showBalance ? formatUserMoney(containerWithdrawableEarnings) : masked}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("funding.balance.pocketHint")}</p>
          </div>
          <Button
            type="button"
            size="lg"
            className="min-h-12 w-full shrink-0 bg-emerald-700 font-semibold hover:bg-emerald-700/90 dark:bg-emerald-600 dark:hover:bg-emerald-600/90 sm:min-w-[12rem]"
            onClick={onTransferToMain}
            disabled={isContainerFlowBusy || containerWithdrawableEarnings <= 0}
          >
            <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />
            {isContainerFlowBusy ? t("funding.balance.processing") : t("funding.balance.transferCta")}
          </Button>
        </div>
      </section>

      <WalletInfrastructureCard
        t={t}
        connectedCount={connectedExchangeCount}
        onManageConnections={onManageExchanges}
      />

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label={t("withdrawal.card.frozenTitle")}
          value={showBalance ? formatUserMoney(withdrawalPendingBalance) : "••••"}
          hint={t("withdrawal.card.frozenBody")}
          icon={Lock}
          iconClassName="text-amber-700/90 dark:text-amber-400"
          className="border-amber-500/20 bg-amber-500/[0.04] sm:col-span-1"
        />
        <MetricCard
          label={t("funding.balance.activeEarningsTitle")}
          value={showBalance ? formatUserMoney(activeContainerEarnings) : "••••"}
          icon={TrendingUp}
          iconClassName="text-primary"
          className="border-primary/20 bg-primary/[0.04]"
        >
          <Button
            type="button"
            size="sm"
            className="mt-3 min-h-11 w-full font-semibold"
            onClick={onExtract}
            disabled={isContainerFlowBusy || activeContainerEarnings <= 0}
          >
            {isContainerFlowBusy ? t("funding.balance.processing") : t("funding.balance.extractCta")}
          </Button>
        </MetricCard>
        <MetricCard
          label={t("funding.balance.exchangeTitle")}
          value={showBalance ? formatUserMoney(connectedExchangeTotalUsd) : "••••"}
          hint={t("funding.balance.exchangeHint").replace(
            "{{fees}}",
            showBalance ? formatUserMoney(containerFeesPaid) : "••••"
          )}
          icon={Link2}
          iconClassName="text-muted-foreground"
          className="bg-muted/15 sm:col-span-2 lg:col-span-1"
        />
      </div>

      {withdrawalEligibility ? (
        <div className={cn(cardShell, "border-primary/15 bg-primary/[0.04] px-4 py-3.5 text-sm leading-relaxed text-muted-foreground")}>
          <p className="font-medium text-foreground">{t("withdrawal.modal.ruleOnce")}</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            <li>{t("withdrawal.modal.minLine").replace("{{min}}", formatUserMoney(withdrawalEligibility.minUsd))}</li>
            <li>{t("withdrawal.modal.maxLine").replace("{{max}}", formatUserMoney(withdrawalEligibility.maxUsd))}</li>
            <li
              className={
                withdrawalEligibility.cooldownActive ? "text-foreground" : "text-emerald-700 dark:text-emerald-400"
              }
            >
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

      <div className={cn(cardShell, "bg-muted/20 px-4 py-3.5 text-[12px] leading-relaxed text-muted-foreground")}>
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
