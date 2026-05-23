/**
 * Copy-trade policy — deliberately separate from fixed/container insurance math.
 * Amounts are USD-normalized; UI converts via user FX preferences.
 */

import {
  CONTAINER_PERIOD_RETURN_MONTHLY_PCT,
  copyTradeCycleProfitRateFromMonthlyPct,
} from "@/lib/container-earnings-schedule"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

/** Active copy rotation length (spec). */
export const COPY_TRADE_CYCLE_MS = 24 * 60 * 60 * 1000

/** Canonical gross profit target per completed 24h cycle (on stake, no insurance). */
export const COPY_TRADE_TARGET_PROFIT_RATE = copyTradeCycleProfitRateFromMonthlyPct(
  CONTAINER_PERIOD_RETURN_MONTHLY_PCT,
  COPY_TRADE_CYCLE_MS,
)

/** Execution / withdrawal fee applied to **scheduled** copy earnings only (not on returned stake). */
export const COPY_TRADE_SCHEDULED_EARNINGS_FEE_RATE = 0.015

/** Withdrawal fee on proceeds (same nominal rate as other Main withdrawals). */
export const COPY_TRADE_WITHDRAW_FEE_RATE = 0.016

/** Force exit / cancellation fee on stake (copy-trade specific). */
export const COPY_TRADE_FORCE_CANCEL_FEE_RATE = 0.02

/** Auto-adjust exit target: desk closes when modeled profit reaches +5% on stake before withdrawal fee. */
export const COPY_TRADE_AUTO_EXIT_PROFIT_RATE = 0.05

export function estimateCopyForcePulloutUsd(params: {
  stakeUsd: number
  /** Modeled live P/L while active (can be negative). */
  floatingPnLUsd: number
  /** Extra fractional haircut before fees (0–1), simulates adverse movement / slippage. */
  coinImpactFraction?: number
}): {
  grossBeforeFeesUsd: number
  cancelFeeUsd: number
  withdrawFeeUsd: number
  netToMainUsd: number
} {
  const coinImpactFraction = Math.max(0, Math.min(0.85, params.coinImpactFraction ?? 0))
  const grossBeforeFeesUsd = roundUsd2(
    params.stakeUsd + params.floatingPnLUsd - params.stakeUsd * coinImpactFraction
  )
  const cancelFeeUsd = roundUsd2(params.stakeUsd * COPY_TRADE_FORCE_CANCEL_FEE_RATE)
  const afterCancel = grossBeforeFeesUsd - cancelFeeUsd
  const withdrawFeeUsd = roundUsd2(Math.max(0, afterCancel) * COPY_TRADE_WITHDRAW_FEE_RATE)
  const netToMainUsd = roundUsd2(Math.max(0, afterCancel - withdrawFeeUsd))
  return { grossBeforeFeesUsd, cancelFeeUsd, withdrawFeeUsd, netToMainUsd }
}

export function estimateCopyAutoAdjustExitUsd(stakeUsd: number): {
  grossUsd: number
  withdrawFeeUsd: number
  netToMainUsd: number
} {
  const grossUsd = roundUsd2(stakeUsd * (1 + COPY_TRADE_AUTO_EXIT_PROFIT_RATE))
  const withdrawFeeUsd = roundUsd2(grossUsd * COPY_TRADE_WITHDRAW_FEE_RATE)
  const netToMainUsd = roundUsd2(grossUsd - withdrawFeeUsd)
  return { grossUsd, withdrawFeeUsd, netToMainUsd }
}

/** Scheduled 24h completion: full stake → Main; gross earnings − fee → Container Liquid. */
export function scheduledCopyCycleSettlementUsd(stakeUsd: number, targetGrossProfitUsd: number): {
  stakeReturnMainUsd: number
  grossProfitUsd: number
  earningsFeeUsd: number
  netEarningsLiquidUsd: number
  mainCreditUsd: number
  liquidCreditUsd: number
} {
  const stake = roundUsd2(stakeUsd)
  const gross = roundUsd2(Math.max(0, targetGrossProfitUsd))
  const earningsFeeUsd = roundUsd2(gross * COPY_TRADE_SCHEDULED_EARNINGS_FEE_RATE)
  const netEarn = roundUsd2(Math.max(0, gross - earningsFeeUsd))
  return {
    stakeReturnMainUsd: stake,
    grossProfitUsd: gross,
    earningsFeeUsd,
    netEarningsLiquidUsd: netEarn,
    mainCreditUsd: stake,
    liquidCreditUsd: netEarn,
  }
}
