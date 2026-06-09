import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { routeErrorMessage } from "@/lib/server/route-error-message"
import { computeAccountLiquidWithdrawBaseUsd } from "@/lib/server/account-liquid-withdraw-base"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { minWithdrawUsdFloor } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  WITHDRAWAL_COOLDOWN_MS,
  effectiveStartupCapitalLockUsd,
} from "@/lib/server/withdrawal-policy"
import { resolveWithdrawalEconomy } from "@/lib/server/withdrawal-eligibility-engine"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()

    const { data: profileRow } = await admin
      .from("profiles")
      .select("funding_country_code,startup_bonus_received_at,startup_capital_locked_usd,startup_capital_granted_at")
      .eq("id", user.id)
      .maybeSingle()

    const liquid = await computeAccountLiquidWithdrawBaseUsd(admin, user.id)
    const total = liquid.totalLiquidUsd
    const minUsd = roundUsd2(minWithdrawUsdFloor())
    const startupLockedUsd = effectiveStartupCapitalLockUsd(profileRow)

    const { data: mainRow, error: mainErr } = await admin
      .from("user_balances")
      .select("available_balance")
      .eq("user_id", user.id)
      .maybeSingle()
    if (mainErr) throw new Error(mainErr.message)
    const mainBalanceUsd = roundUsd2(Number(mainRow?.available_balance ?? 0))

    const economy = await resolveWithdrawalEconomy(admin, user.id, profileRow, mainBalanceUsd)
    const maxUsd = economy.withdrawableMainUsd

    const since = new Date(Date.now() - WITHDRAWAL_COOLDOWN_MS).toISOString()
    const { data: recent, error: wErr } = await admin
      .from("withdrawal_requests")
      .select("id,created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (wErr) throw new Error(wErr.message)

    const lastAt = recent?.created_at ? new Date(recent.created_at as string).getTime() : null
    const nextEligibleAt =
      lastAt !== null ? new Date(lastAt + WITHDRAWAL_COOLDOWN_MS).toISOString() : null
    const cooldownActive = lastAt !== null && Date.now() - lastAt < WITHDRAWAL_COOLDOWN_MS
    const msRemaining =
      lastAt !== null && cooldownActive ? Math.max(0, lastAt + WITHDRAWAL_COOLDOWN_MS - Date.now()) : 0

    return NextResponse.json({
      minUsd,
      maxUsd,
      availableUsd: mainBalanceUsd,
      mainBalanceUsd,
      totalBalanceUsd: total,
      containerLiquidUsd: liquid.containerLiquidUsd,
      activeTradeProfitUsd: roundUsd2(liquid.fixedUnreleasedUsd + liquid.copyAccrualUsd),
      startupCapitalLockedUsd: startupLockedUsd,
      mainMinimumRetainUsd: economy.retainUsd,
      eligibilityPath: economy.path,
      hasAlternativeCushion: economy.hasAlternativeCushion,
      activeTradeStakeUsd: economy.activeTradeStakeUsd,
      pocketBalanceUsd: economy.pocketBalanceUsd,
      engagementBlocked: economy.engagementBlocked,
      engagementMessage: economy.engagementMessage,
      uiHint: economy.uiHint,
      reserveDisplayLabel: economy.reserveDisplayLabel,
      registrationAgeDays: economy.registrationAgeDays,
      dualSessionDaysCompleted: economy.dualSessionDaysCompleted,
      cooldownActive,
      nextEligibleAt,
      msRemaining,
      cooldownHours: 12,
    })
  } catch (e) {
    console.error("[withdrawal/eligibility GET]", e)
    return NextResponse.json({ error: routeErrorMessage(e) }, { status: 500 })
  }
}
