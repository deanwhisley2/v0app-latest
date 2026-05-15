"use client"

import { PROCESSING_COPY } from "@/lib/nexus-financial-policy"

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
  mainBalance: number
  totalEarnings: number
  containerWithdrawableEarnings: number
  withdrawalPendingBalance: number
  activeContainerEarnings: number
  containerFeesPaid: number
  connectedExchangeTotalUsd: number
  isContainerFlowBusy: boolean
  withdrawalEligibility: WithdrawalEligibilityHint | null
  onAddFunds: () => void
  onWithdraw: () => void
  onTransferToMain: () => void
  onExtract: () => void
}

export function RetailBalanceHomePanels({
  t,
  formatUserMoney,
  showBalance,
  onToggleShowBalance,
  mainBalance,
  totalEarnings,
  containerWithdrawableEarnings,
  withdrawalPendingBalance,
  activeContainerEarnings,
  containerFeesPaid,
  connectedExchangeTotalUsd,
  isContainerFlowBusy,
  withdrawalEligibility,
  onAddFunds,
  onWithdraw,
  onTransferToMain,
  onExtract,
}: RetailBalanceHomePanelsProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onAddFunds}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-success/90 sm:w-auto"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t("funding.button.addFunds")}
            </button>
            <button
              type="button"
              onClick={onWithdraw}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 sm:w-auto"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4l-8 8 8 8" />
              </svg>
              {t("funding.button.withdraw")}
            </button>
          </div>
          <div className="flex min-w-0 items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10"
              aria-hidden
            >
              <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">Available balance</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Bot earnings (total): {showBalance ? formatUserMoney(totalEarnings) : "••••"}
                </span>
                <button
                  type="button"
                  onClick={onToggleShowBalance}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  title={showBalance ? "Hide balance" : "Show balance"}
                >
                  {showBalance ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1 break-words font-mono text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                {showBalance ? formatUserMoney(mainBalance) : "••••••••"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-success/35 bg-success/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("funding.balance.liquidTitle")}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-foreground">
              {showBalance ? formatUserMoney(containerWithdrawableEarnings) : "••••"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("funding.balance.pocketHint")}</p>
          </div>
          <button
            type="button"
            onClick={onTransferToMain}
            disabled={isContainerFlowBusy || containerWithdrawableEarnings <= 0}
            className="w-full shrink-0 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            {isContainerFlowBusy ? t("funding.balance.processing") : t("funding.balance.transferCta")}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("withdrawal.card.frozenTitle")}</p>
          <p className="mt-1 font-mono text-lg font-bold text-amber-700 dark:text-amber-400">
            {showBalance ? formatUserMoney(withdrawalPendingBalance) : "••••"}
          </p>
          <p className="text-[11px] text-muted-foreground">{t("withdrawal.card.frozenBody")}</p>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("funding.balance.activeEarningsTitle")}
          </p>
          <p className="mt-1 font-mono text-lg font-bold">
            {showBalance ? formatUserMoney(activeContainerEarnings) : "••••"}
          </p>
          <button
            type="button"
            onClick={onExtract}
            disabled={isContainerFlowBusy || activeContainerEarnings <= 0}
            className="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {isContainerFlowBusy ? t("funding.balance.processing") : t("funding.balance.extractCta")}
          </button>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("funding.balance.exchangeTitle")}</p>
          <p className="mt-1 font-mono text-lg font-bold">
            {showBalance ? formatUserMoney(connectedExchangeTotalUsd) : "••••"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("funding.balance.exchangeHint").replace(
              "{{fees}}",
              showBalance ? formatUserMoney(containerFeesPaid) : "••••",
            )}
          </p>
        </div>
      </div>

      {withdrawalEligibility ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[11px] leading-snug text-muted-foreground">
          <p className="font-medium text-foreground">{t("withdrawal.modal.ruleOnce")}</p>
          <p className="mt-1">
            {t("withdrawal.modal.minLine").replace("{{min}}", formatUserMoney(withdrawalEligibility.minUsd))}
          </p>
          <p className="mt-0.5">
            {t("withdrawal.modal.maxLine").replace("{{max}}", formatUserMoney(withdrawalEligibility.maxUsd))}
          </p>
          {withdrawalEligibility.cooldownActive ? (
            <p className="mt-1 text-foreground">
              {t("withdrawal.modal.waitHours").replace(
                "{{hours}}",
                String(Math.max(1, Math.ceil(withdrawalEligibility.msRemaining / 3_600_000))),
              )}
            </p>
          ) : (
            <p className="mt-1 text-success">{t("withdrawal.modal.readyNow")}</p>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{t("deposit.timingLabel")}</span> {PROCESSING_COPY.deposits}
        </p>
        <p className="mt-1">
          <span className="font-medium text-foreground">{t("withdrawal.timingLabel")}</span>{" "}
          {PROCESSING_COPY.withdrawals}
        </p>
      </div>
    </div>
  )
}
