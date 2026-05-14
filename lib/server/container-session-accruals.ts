import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  canonicalCopyTargetGrossUsd,
  copyTradeAccruedGrossUsd,
  copyTradeLegacyLinearAccruedGrossUsd,
  parseCopyTradeLifecycle,
} from "@/lib/server/copy-trade-lifecycle"
import { computeFixedSessionPolicyGrossUsd, type FixedSessionEarnedRow } from "@/lib/server/fixed-trade-earnings-snapshot"

/**
 * Live accrual from active sessions (server truth) for dashboard aggregation.
 */
export async function sumActiveSessionAccrualUsd(
  admin: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<{ copyAccrualUsd: number; fixedPolicyGrossUsd: number; combinedUsd: number }> {
  const [{ data: copyRows, error: cErr }, { data: fixedRows, error: fErr }] = await Promise.all([
    admin
      .from("copy_trade_sessions")
      .select("id,stake_amount,created_at,metadata")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("settled_at", null),
    admin
      .from("fixed_trade_sessions")
      .select(
        "id,principal_amount,insurance_fee_amount,fix_period_months,seed_key,created_at,metadata,cumulative_earnings_released_usd,last_earnings_release_at"
      )
      .eq("user_id", userId)
      .eq("status", "active"),
  ])
  if (cErr) throw new Error(cErr.message)
  if (fErr) throw new Error(fErr.message)

  let copyAccrualUsd = 0
  for (const r of copyRows ?? []) {
    const stake = roundUsd2(Number(r.stake_amount ?? 0))
    const lc = parseCopyTradeLifecycle(r.metadata as Record<string, unknown> | null)
    const accrued = lc
      ? copyTradeAccruedGrossUsd(lc, String(r.created_at), now)
      : copyTradeLegacyLinearAccruedGrossUsd(stake, String(r.created_at), now)
    copyAccrualUsd += accrued
  }

  let fixedPolicyGrossUsd = 0
  for (const r of fixedRows ?? []) {
    fixedPolicyGrossUsd += computeFixedSessionPolicyGrossUsd(r as FixedSessionEarnedRow, now)
  }

  return {
    copyAccrualUsd: roundUsd2(copyAccrualUsd),
    fixedPolicyGrossUsd: roundUsd2(fixedPolicyGrossUsd),
    combinedUsd: roundUsd2(copyAccrualUsd + fixedPolicyGrossUsd),
  }
}
