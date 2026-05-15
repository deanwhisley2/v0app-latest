import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"
import { displayCoinForFixedSession } from "@/lib/fixed-trade-display-coin"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { computeFixedSessionPolicyGrossUsd, type FixedSessionEarnedRow } from "@/lib/server/fixed-trade-earnings-snapshot"
import {
  canonicalCopyTargetGrossUsd,
  copyTradeAccruedGrossUsd,
  copyTradeLegacyLinearAccruedGrossUsd,
  parseCopyTradeLifecycle,
} from "@/lib/server/copy-trade-lifecycle"
import { COPY_TRADE_CYCLE_MS } from "@/lib/copy-trade-policy"
import { copyTradeDisplayAccruedGrossUsd } from "@/lib/server/copy-trade-display-accrual"

type CopyRow = {
  id: string
  trader_persona_id: string
  stake_amount: string | number
  created_at: string
  metadata: Record<string, unknown> | null
}

type FixedRow = {
  id: string
  trader_persona_id: string | null
  principal_amount: string | number
  insurance_fee_amount: string | number
  risk_class: string
  fix_period_months: number
  seed_key: string | null
  created_at: string
  metadata: Record<string, unknown> | null
  cumulative_earnings_released_usd?: string | number | null
  last_earnings_release_at?: string | null
}

/**
 * Authoritative active container trade sessions (copy + fixed) for recovery after refresh/login.
 * Read-only; does not mutate balances.
 */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const admin = createAdminClient()

    const [{ data: copyRows, error: cErr }, { data: fixedRows, error: fErr }] = await Promise.all([
      admin
        .from("copy_trade_sessions")
        .select("id,trader_persona_id,stake_amount,created_at,metadata")
        .eq("user_id", user.id)
        .eq("status", "active")
        .is("settled_at", null)
        .order("created_at", { ascending: true }),
      admin
        .from("fixed_trade_sessions")
        .select(
          "id,trader_persona_id,principal_amount,insurance_fee_amount,risk_class,fix_period_months,seed_key,created_at,metadata,cumulative_earnings_released_usd,last_earnings_release_at"
        )
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ])

    if (cErr) throw new Error(cErr.message)
    if (fErr) throw new Error(fErr.message)

    const now = new Date()
    const copySessions = (copyRows ?? []).map((r: CopyRow) => {
      const md = (r.metadata ?? {}) as { ui?: { autoAdjust?: boolean } }
      const stake = roundUsd2(Number(r.stake_amount ?? 0))
      const lc = parseCopyTradeLifecycle(r.metadata as Record<string, unknown> | null)
      const accruedGrossUsd = lc
        ? copyTradeAccruedGrossUsd(lc, r.created_at, now)
        : copyTradeLegacyLinearAccruedGrossUsd(stake, r.created_at, now)
      const targetGrossProfitUsd = lc?.targetGrossProfitUsd ?? canonicalCopyTargetGrossUsd(stake)
      const displayAccruedGrossUsd = copyTradeDisplayAccruedGrossUsd(r.id, accruedGrossUsd, targetGrossProfitUsd, now)
      const cycleEndsAt = new Date(new Date(r.created_at).getTime() + COPY_TRADE_CYCLE_MS).toISOString()
      return {
        kind: "copy" as const,
        sessionId: r.id,
        traderPersonaId: r.trader_persona_id,
        stakeUsd: stake,
        createdAt: r.created_at,
        autoAdjust: md.ui?.autoAdjust === true,
        accruedGrossUsd,
        displayAccruedGrossUsd,
        targetGrossProfitUsd,
        cycleEndsAt,
      }
    })

    const fixedSessions = (fixedRows ?? []).map((r: FixedRow) => {
      const principalUsd = roundUsd2(Number(r.principal_amount ?? 0))
      const months = Number(r.fix_period_months) as FixPeriodMonths
      const seedKey =
        (r.seed_key && String(r.seed_key).trim()) ||
        `${r.id}-${principalUsd}-${months}-${r.created_at}`
      const md = (r.metadata ?? {}) as { coin_symbol?: string; fixed_price_usd?: number }
      const fallback = displayCoinForFixedSession(seedKey)
      const coinSymbol = typeof md.coin_symbol === "string" && md.coin_symbol ? md.coin_symbol : fallback.coinSymbol
      const fixedPriceUsd =
        typeof md.fixed_price_usd === "number" && Number.isFinite(md.fixed_price_usd)
          ? md.fixed_price_usd
          : fallback.fixedPriceUsd
      const insuranceFee = roundUsd2(Number(r.insurance_fee_amount ?? 0))
      const earnedUsd = computeFixedSessionPolicyGrossUsd(r as FixedSessionEarnedRow, now)
      const leaseEnd = officialLeaseEndDate(r.created_at, months)
      const totalWithdrawnUsd = roundUsd2(Number(r.cumulative_earnings_released_usd ?? 0))
      const releasableHeadroomUsd = roundUsd2(Math.max(0, earnedUsd - totalWithdrawnUsd))
      const lastWithdrawalAt =
        typeof r.last_earnings_release_at === "string" && r.last_earnings_release_at.trim()
          ? r.last_earnings_release_at
          : null
      const msDay = 86_400_000
      const daysUntilMaturity = Math.ceil((leaseEnd.getTime() - now.getTime()) / msDay)
      const leaseEndedAwaitingSettlement = leaseEnd.getTime() <= now.getTime()

      return {
        kind: "fixed" as const,
        sessionId: r.id,
        traderPersonaId: r.trader_persona_id,
        principalUsd,
        insuranceFeeUsd: insuranceFee,
        riskClass: r.risk_class,
        fixPeriodMonths: months,
        seedKey,
        createdAt: r.created_at,
        leaseEndAt: leaseEnd.toISOString(),
        coinSymbol,
        fixedPriceUsd,
        earnedUsd,
        totalWithdrawnUsd,
        lastWithdrawalAt,
        releasableHeadroomUsd,
        daysUntilMaturity,
        leaseEndedAwaitingSettlement,
      }
    })

    return NextResponse.json({
      ok: true,
      copySessions,
      fixedSessions,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
