import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { computeAccountLiquidWithdrawBaseUsd } from "@/lib/server/account-liquid-withdraw-base"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { minWithdrawUsdFloor } from "@/lib/nexus-fx"
import { nexusMainMinimumRetainUsd } from "@/lib/customer-corridor-money"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

const WINDOW_MS = 86_400_000

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()

    const { data: profileRow } = await admin
      .from("profiles")
      .select("funding_country_code")
      .eq("id", user.id)
      .maybeSingle()
    const fundingCountryCode = (profileRow as { funding_country_code?: string | null } | null)
      ?.funding_country_code

    const liquid = await computeAccountLiquidWithdrawBaseUsd(admin, user.id)
    const available = liquid.availableUsd
    const total = liquid.totalLiquidUsd
    const minUsd = roundUsd2(minWithdrawUsdFloor())
    const withdrawableMainUsd = roundUsd2(
      Math.max(0, available - nexusMainMinimumRetainUsd(fundingCountryCode)),
    )
    const maxUsd = roundUsd2(Math.min(withdrawableMainUsd, Math.max(0, total * 0.5)))

    const since = new Date(Date.now() - WINDOW_MS).toISOString()
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
      lastAt !== null ? new Date(lastAt + WINDOW_MS).toISOString() : null
    const cooldownActive = lastAt !== null && Date.now() - lastAt < WINDOW_MS
    const msRemaining =
      lastAt !== null && cooldownActive ? Math.max(0, lastAt + WINDOW_MS - Date.now()) : 0

    return NextResponse.json({
      minUsd,
      maxUsd,
      availableUsd: available,
      totalBalanceUsd: total,
      containerLiquidUsd: liquid.containerLiquidUsd,
      activeTradeProfitUsd: roundUsd2(liquid.fixedUnreleasedUsd + liquid.copyAccrualUsd),
      cooldownActive,
      nextEligibleAt,
      msRemaining,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
