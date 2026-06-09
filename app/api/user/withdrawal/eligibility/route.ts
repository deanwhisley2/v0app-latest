import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { routeErrorMessage } from "@/lib/server/route-error-message"
import { computeAccountLiquidWithdrawBaseUsd } from "@/lib/server/account-liquid-withdraw-base"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { minWithdrawUsdFloor } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { effectiveStartupCapitalLockUsd } from "@/lib/server/withdrawal-policy"
import {
  assessWithdrawalSessionCooldown,
  readWithdrawalRejectionCooldown,
  resolveWithdrawalEconomy,
} from "@/lib/server/withdrawal-eligibility-engine"

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

    const [sessionCooldown, rejectionCooldown] = await Promise.all([
      assessWithdrawalSessionCooldown(admin, user.id),
      readWithdrawalRejectionCooldown(admin, user.id),
    ])
    const cooldownActive =
      sessionCooldown.cooldownActive || rejectionCooldown.cooldownActive
    const msRemaining = rejectionCooldown.cooldownActive
      ? rejectionCooldown.msRemaining
      : sessionCooldown.msRemaining
    const nextEligibleAt = rejectionCooldown.cooldownActive
      ? rejectionCooldown.cooldownUntil
      : sessionCooldown.nextEligibleAt

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
      sessionCooldownActive: sessionCooldown.cooldownActive,
      rejectionCooldownActive: rejectionCooldown.cooldownActive,
      rejectionCooldownUntil: rejectionCooldown.cooldownUntil,
      rejectionCooldownMsRemaining: rejectionCooldown.msRemaining,
      consecutiveRejectionsCount: rejectionCooldown.consecutiveRejectionsCount,
    })
  } catch (e) {
    console.error("[withdrawal/eligibility GET]", e)
    return NextResponse.json({ error: routeErrorMessage(e) }, { status: 500 })
  }
}
