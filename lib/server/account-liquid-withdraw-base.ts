import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { sumActiveSessionAccrualUsd } from "@/lib/server/container-session-accruals"
import { computeFixedSessionPolicyGrossUsd, type FixedSessionEarnedRow } from "@/lib/server/fixed-trade-earnings-snapshot"
import { effectiveStartupCapitalLockUsd } from "@/lib/server/withdrawal-policy"

/**
 * Liquid account base for withdrawal eligibility (main + container liquid; trade principal excluded).
 * Main + pending + container pocket liquid + unreleased fixed headroom + active copy accrual.
 * Excludes locked trade principal (stakes / fixed allocations).
 */
export async function computeAccountLiquidWithdrawBaseUsd(
  admin: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<{
  availableUsd: number
  pendingUsd: number
  containerLiquidUsd: number
  fixedUnreleasedUsd: number
  copyAccrualUsd: number
  totalLiquidUsd: number
}> {
  const { data: row, error: selErr } = await admin
    .from("user_balances")
    .select("available_balance, withdrawal_pending_balance, container_withdrawable_earnings")
    .eq("user_id", userId)
    .maybeSingle()
  if (selErr) throw new Error(selErr.message)

  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .select("startup_bonus_received_at,startup_capital_locked_usd,startup_capital_granted_at")
    .eq("id", userId)
    .maybeSingle()
  if (profileErr) throw new Error(profileErr.message)

  const availableRawUsd = roundUsd2(Number(row?.available_balance ?? 0))
  const startupLockedUsd = effectiveStartupCapitalLockUsd(
    profileRow as { startup_bonus_received_at?: string | null; startup_capital_locked_usd?: unknown } | null,
  )
  const availableUsd = roundUsd2(Math.max(0, availableRawUsd - startupLockedUsd))
  const pendingUsd = roundUsd2(Number((row as Record<string, unknown> | null)?.withdrawal_pending_balance ?? 0))
  const containerLiquidUsd = roundUsd2(Number(row?.container_withdrawable_earnings ?? 0))

  const { data: fixedRows, error: fErr } = await admin
    .from("fixed_trade_sessions")
    .select(
      "id,principal_amount,insurance_fee_amount,fix_period_months,seed_key,created_at,metadata,cumulative_earnings_released_usd",
    )
    .eq("user_id", userId)
    .eq("status", "active")
  if (fErr) throw new Error(fErr.message)

  let fixedUnreleasedUsd = 0
  for (const r of fixedRows ?? []) {
    const gross = computeFixedSessionPolicyGrossUsd(r as FixedSessionEarnedRow, now)
    const cum = roundUsd2(Number(r.cumulative_earnings_released_usd ?? 0))
    fixedUnreleasedUsd += Math.max(0, roundUsd2(gross - cum))
  }
  fixedUnreleasedUsd = roundUsd2(fixedUnreleasedUsd)

  const { copyAccrualUsd } = await sumActiveSessionAccrualUsd(admin, userId, now)

  const totalLiquidUsd = roundUsd2(
    availableUsd + pendingUsd + containerLiquidUsd + fixedUnreleasedUsd + copyAccrualUsd,
  )

  return {
    availableUsd,
    pendingUsd,
    containerLiquidUsd,
    fixedUnreleasedUsd,
    copyAccrualUsd,
    totalLiquidUsd,
  }
}
