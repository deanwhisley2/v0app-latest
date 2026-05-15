import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { treasury } from "@/lib/financial/treasury-authority"
import {
  cryptoCronPausedGlobally,
  fundingRiskScoreBlockThreshold,
  treasuryCryptoCronSafeModeEnabled,
  treasuryMainLowWaterUsd,
} from "@/lib/server/treasury-automation-policy"

function isoSince(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

/** Level 5: aggregated treasury + funding exposure + reconciliation snapshot. */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)
    const admin = createAdminClient()

    const mainTreasuryUsd = await treasury.getTreasuryBalance("MAIN_TREASURY")

    const { data: pendingRows } = await admin
      .from("retailer_fund_requests")
      .select("amount_usd_locked")
      .in("status", ["pending", "under_review", "appealed", "escalated"])
    let pendingFundingExposureUsd = 0
    for (const r of pendingRows ?? []) {
      pendingFundingExposureUsd += Number((r as { amount_usd_locked?: unknown }).amount_usd_locked ?? 0)
    }

    const since24 = isoSince(24)
    const { count: rejects24 } = await admin
      .from("retailer_fund_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected")
      .gte("reviewed_at", since24)

    const { data: evRows } = await admin
      .from("container_balance_events")
      .select("gross_amount")
      .gte("created_at", since24)
      .or("event_type.eq.funding_request_admin_approved,event_type.eq.funding_request_approved")
    let approvalsApproxUsd24h = 0
    for (const e of evRows ?? []) {
      approvalsApproxUsd24h += Number((e as { gross_amount?: unknown }).gross_amount ?? 0)
    }

    const { data: compRows } = await admin
      .from("crypto_deposit_requests")
      .select("compensation_usd")
      .gte("credited_at", since24)
      .not("compensation_usd", "is", null)
    let cryptoCompensationUsd24h = 0
    for (const c of compRows ?? []) {
      cryptoCompensationUsd24h += Number((c as { compensation_usd?: unknown }).compensation_usd ?? 0)
    }

    const { count: stream24 } = await admin
      .from("treasury_operation_stream")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", since24)

    const { data: lastRec } = await admin
      .from("treasury_reconciliation_runs")
      .select("id,started_at,finished_at,status,issue_count,meta")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const reserveUsd = treasuryMainLowWaterUsd()
    const utilizationVsReserve =
      reserveUsd != null && reserveUsd > 0 ? Math.min(999, Math.round((mainTreasuryUsd / reserveUsd) * 100)) : null

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      main_treasury_usd: mainTreasuryUsd,
      reserve_floor_usd: reserveUsd,
      utilization_vs_reserve_pct: utilizationVsReserve,
      pending_funding_exposure_usd: Math.round(pendingFundingExposureUsd * 100) / 100,
      approvals_usd_approx_24h: Math.round(approvalsApproxUsd24h * 100) / 100,
      funding_rejected_count_24h: rejects24 ?? 0,
      crypto_compensation_usd_24h: Math.round(cryptoCompensationUsd24h * 100) / 100,
      treasury_stream_events_24h: stream24 ?? 0,
      latest_reconciliation_run: lastRec ?? null,
      automation: {
        crypto_cron_paused: cryptoCronPausedGlobally(),
        treasury_crypto_safe_mode: treasuryCryptoCronSafeModeEnabled(),
      },
      risk_gate: {
        funding_score_block_minimum: fundingRiskScoreBlockThreshold(),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
