import type { SupabaseClient } from "@supabase/supabase-js"

export type FundingApprovalRiskAssessment = {
  score: number
  flags: string[]
}

/** Lightweight internal risk heuristic for L5 funding approvals — extend with richer signals over time. */
export async function assessFundingApprovalRisk(
  admin: SupabaseClient,
  params: {
    requestId: string
    retailerId?: string | null
    txReference: string | null | undefined
    amountUsdLocked: number
    fundChannel?: string | null
    adminUserId: string | null | undefined
  },
): Promise<FundingApprovalRiskAssessment> {
  const flags: string[] = []
  let score = 0

  const tx = String(params.txReference ?? "").trim().toUpperCase()
  if (tx.length >= 8) {
    const { count, error } = await admin
      .from("retailer_fund_requests")
      .select("id", { count: "exact", head: true })
      .neq("id", params.requestId)
      .eq("status", "approved")
      .ilike("tx_reference", tx)
    if (!error && (count ?? 0) >= 1) {
      flags.push("reused_tx_reference_on_prior_approval")
      score += 65
    }
  }

  if (Math.abs(params.amountUsdLocked) > 1e7) {
    flags.push("extreme_usd_magnitude")
    score += 20
  }

  if (
    ["admin_airtel_ug", "admin_crypto"].includes(String(params.fundChannel ?? "").trim()) &&
    params.amountUsdLocked > 500000
  ) {
    flags.push("large_direct_admin_channel")
    score += 10
  }

  const adminId = params.adminUserId?.trim()
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  if (adminId) {
    const { count, error } = await admin
      .from("container_balance_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso)
      .eq("actor_id", adminId)
      .or("event_type.eq.funding_request_admin_approved,event_type.eq.funding_request_approved")
    if (!error && (count ?? 0) >= 25) {
      flags.push("admin_approval_burst_1h")
      score += 25
    }
  }

  const { data: fxRow } = await admin
    .from("funding_fx_normalization")
    .select("amount_usd_normalized,amount_input_local,local_per_usd,rate_source,input_currency")
    .eq("fund_request_id", params.requestId)
    .maybeSingle()
  const fx = fxRow as Record<string, unknown> | null
  if (fx?.amount_input_local != null && fx.local_per_usd != null && fx.amount_usd_normalized != null) {
    const loc = Number(fx.amount_input_local)
    const per = Number(fx.local_per_usd)
    const norm = Number(fx.amount_usd_normalized)
    if (Number.isFinite(loc) && Number.isFinite(per) && per > 0 && Number.isFinite(norm) && norm > 0) {
      const recomputedUsd = Math.round((loc / per) * 100) / 100
      const diff = Math.abs(recomputedUsd - norm)
      if (diff > 0.06) {
        flags.push("fx_usd_normalized_mismatch")
        score += 40
      }
    }
    const rs = String(fx.rate_source ?? "").trim()
    if (!rs) {
      flags.push("missing_rate_source_tag")
      score += 15
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, flags }
}
