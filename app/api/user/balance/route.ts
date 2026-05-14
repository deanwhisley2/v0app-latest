import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { currencyEngine } from "@/lib/financial/currency-engine"
import { treasury } from "@/lib/financial/treasury-authority"
import { sumActiveSessionAccrualUsd } from "@/lib/server/container-session-accruals"

export async function GET(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("user_balances")
      .select(
        "total_earnings, current_stake, available_balance, retail_balance, withdrawal_pending_balance, active_container_earnings, container_withdrawable_earnings, lifetime_container_withdrawn, lifetime_container_fees, last_updated, created_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("user balance:", error)
      return NextResponse.json({ error: "Could not load balance" }, { status: 500 })
    }

    let liveAccrual = { copyAccrualUsd: 0, fixedPolicyGrossUsd: 0, combinedUsd: 0 }
    try {
      liveAccrual = await sumActiveSessionAccrualUsd(admin, user.id)
    } catch {
      /* optional enrichment */
    }

    const baseActive = Number(data?.active_container_earnings ?? 0)
    const activeResolved = Math.round((baseActive + liveAccrual.combinedUsd) * 100) / 100

    const payload = {
      total_earnings: Number(data?.total_earnings ?? 0),
      current_stake: Number(data?.current_stake ?? 0),
      available_balance: Number(data?.available_balance ?? 0),
      retail_balance: Number((data as Record<string, unknown> | null)?.retail_balance ?? 0),
      withdrawal_pending_balance: Number(
        (data as Record<string, unknown> | null)?.withdrawal_pending_balance ?? 0
      ),
      active_container_earnings: baseActive,
      /** DB bucket only (legacy / manual extracts). */
      active_container_earnings_db: baseActive,
      /** Active copy + fixed server accruals (sessions). */
      container_session_accrual_usd: liveAccrual.combinedUsd,
      /** Suggested display total = DB active bucket + live session accrual. */
      active_container_earnings_resolved: activeResolved,
      container_withdrawable_earnings: Number(data?.container_withdrawable_earnings ?? 0),
      lifetime_container_withdrawn: Number(data?.lifetime_container_withdrawn ?? 0),
      lifetime_container_fees: Number(data?.lifetime_container_fees ?? 0),
      last_updated: data?.last_updated ?? null,
      created_at: data?.created_at ?? null,
    }

    // Backward compatible payload + multi-currency block for new treasury subsystem.
    try {
      const userCurrency = await currencyEngine.getUserCurrency(user.id)
      const mainLocal = await treasury.getUserBalance(user.id, "NEXUS_MAIN", userCurrency)
      const retailLocal = await treasury.getUserBalance(user.id, "RETAIL", userCurrency)
      const earningsLocal = await treasury.getUserBalance(user.id, "EARNINGS", userCurrency)
      return NextResponse.json({
        ...payload,
        multi_currency: {
          currency: userCurrency,
          main: {
            amount: mainLocal,
            formatted: currencyEngine.formatForUser(mainLocal, userCurrency),
          },
          earnings: {
            amount: earningsLocal,
            formatted: currencyEngine.formatForUser(earningsLocal, userCurrency),
          },
          retail: {
            amount: retailLocal,
            formatted: currencyEngine.formatForUser(retailLocal, userCurrency),
          },
        },
      })
    } catch {
      return NextResponse.json(payload)
    }
  } catch (e) {
    console.error("/api/user/balance:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
