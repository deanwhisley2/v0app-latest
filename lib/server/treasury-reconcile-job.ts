import type { SupabaseClient } from "@supabase/supabase-js"
import {
  emitTreasuryStreamEvent,
  fundRequestReferenceId,
} from "@/lib/server/treasury-operation-stream"
import { treasuryMainLowWaterUsd } from "@/lib/server/treasury-automation-policy"
import { treasury } from "@/lib/financial/treasury-authority"

export type ReconciliationFinding = {
  code: string
  severity: "info" | "warning" | "critical"
  detail: string
  requestId?: string
  extra?: Record<string, unknown>
}

const MS_DAY = 86400000

function sinceIso(days: number): string {
  return new Date(Date.now() - days * MS_DAY).toISOString()
}

/**
 * Cross-check funding ↔ FX ↔ treasury debits ↔ duplicate references.
 * Store outcome in treasury_reconciliation_runs; append stream event (non-blocking).
 */
export async function runTreasuryReconciliation(admin: SupabaseClient): Promise<{
  runId: string
  findings: ReconciliationFinding[]
  issueCount: number
}> {
  const startedAt = new Date().toISOString()
  const findings: ReconciliationFinding[] = []

  const { data: runRow, error: runErr } = await admin
    .from("treasury_reconciliation_runs")
    .insert({ status: "running", findings: [], meta: { started_reason: "cron" } })
    .select("id")
    .single()
  if (runErr) throw new Error(runErr.message)
  const runId = String((runRow as { id: string }).id)

  try {
    const mainTreasury = await treasury.getTreasuryBalance("MAIN_TREASURY")
    const low = treasuryMainLowWaterUsd()
    if (low != null && mainTreasury < low) {
      findings.push({
        code: "main_treasury_below_low_water",
        severity: "warning",
        detail: `MAIN_TREASURY ${mainTreasury.toFixed(2)} < configured low water ${low.toFixed(2)}`,
        extra: { mainTreasuryUsd: mainTreasury },
      })
    }

    const { data: approved } = await admin
      .from("retailer_fund_requests")
      .select("id,user_id,status,amount_usd_locked,fund_channel,l5_settlement_mode,reviewed_at")
      .gte("reviewed_at", sinceIso(45))
      .eq("status", "approved")

    const rows = approved ?? []
    for (const r of rows) {
      const id = String((r as { id: string }).id)
      const ref = fundRequestReferenceId(id)
      const { data: led } = await admin
        .from("unified_ledger")
        .select("operation")
        .eq("reference_id", ref)
        .eq("operation", "DEBIT")

      const dc = led?.length ?? 0

      const ch = String((r as { fund_channel?: string }).fund_channel ?? "")
      const l5mode = String((r as { l5_settlement_mode?: string }).l5_settlement_mode ?? "").trim()
      const treasuryMode = l5mode === "treasury_pool"
      const needsTreasury = treasuryMode || ch === "admin_crypto" || ch === "admin_airtel_ug"

      if (needsTreasury && dc === 0 && Number((r as { amount_usd_locked?: number }).amount_usd_locked ?? 0) > 0) {
        findings.push({
          code: "approved_missing_treasury_debit",
          severity: "critical",
          detail: `Approved funding has no treasury DEBIT ledger row for ${ref}`,
          requestId: id,
        })
      }
      if (dc > 1) {
        findings.push({
          code: "duplicate_treasury_debit_reference",
          severity: "critical",
          detail: `Multiple DEBIT ledger rows reference ${ref}`,
          requestId: id,
          extra: { count: dc },
        })
      }

      const { data: fx } = await admin
        .from("funding_fx_normalization")
        .select(
          "rate_source,local_per_usd,amount_input_local,amount_usd_normalized,created_at,input_currency",
        )
        .eq("fund_request_id", id)
        .maybeSingle()

      if (
        ["local_mobile", "admin_airtel_ug", "legacy_admin"].includes(ch) ||
        needsTreasury
      ) {
        if (!fx) {
          findings.push({
            code: "missing_fx_normalization_row",
            severity: "warning",
            detail: `No funding_fx_normalization for approved request`,
            requestId: id,
          })
        }
      }

      if (fx) {
        const src = String((fx as { rate_source?: string }).rate_source ?? "").trim()
        if (!src) {
          findings.push({
            code: "fx_missing_rate_source",
            severity: "warning",
            detail: `FX row exists but rate_source empty`,
            requestId: id,
          })
        }
        const lp = Number((fx as { local_per_usd?: unknown }).local_per_usd ?? 0)
        const ain = Number((fx as { amount_input_local?: unknown }).amount_input_local ?? NaN)
        const nun = Number((fx as { amount_usd_normalized?: unknown }).amount_usd_normalized ?? NaN)

        if (lp > 0 && ain > 0 && nun > 0 && ain / lp > 50000) {
          findings.push({
            code: "fx_conversion_spike_suspected",
            severity: "warning",
            detail: `Local→USD normalization looks extreme — inspect locked rate`,
            requestId: id,
            extra: { localPerUsd: lp, amountInputLocal: ain, amountUsdNormalized: nun },
          })
        }
        if (lp > 0 && lp < 1) {
          findings.push({
            code: "fx_local_per_usd_below_one",
            severity: "warning",
            detail: `local_per_usd < 1 for fiat-backed funding — validate daily_fx_rates bucket`,
            requestId: id,
            extra: { localPerUsd: lp },
          })
        }

        const { data: qr } = await admin
          .from("retailer_fund_requests")
          .select("fx_quote_expires_at,status")
          .eq("id", id)
          .maybeSingle()
        const expMs = qr?.fx_quote_expires_at ? Date.parse(String(qr.fx_quote_expires_at)) : NaN
        const st = String(qr?.status ?? "")
        if (
          ["pending", "under_review", "appealed", "escalated"].includes(st) &&
          Number.isFinite(expMs) &&
          expMs < Date.now()
        ) {
          findings.push({
            code: "expired_quote_still_pending",
            severity: "info",
            detail: `Request pending ops but FX quote expiry has passed`,
            requestId: id,
          })
        }
      }
    }

    const since24 = sinceIso(1)
    const { count: rejCount } = await admin
      .from("retailer_fund_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected")
      .gte("reviewed_at", since24)

    findings.push({
      code: "funding_rejected_24h",
      severity: "info",
      detail: `${rejCount ?? 0} funding requests rejected in last 24h`,
    })

    const { data: comps } = await admin
      .from("crypto_deposit_requests")
      .select("compensation_usd")
      .gte("credited_at", since24)
    let compUsd = 0
    for (const c of comps ?? []) {
      const v = Number((c as { compensation_usd?: unknown }).compensation_usd ?? 0)
      if (v > 0) compUsd += v
    }
    findings.push({
      code: "crypto_compensation_24h",
      severity: "info",
      detail: `USDT compensation total (24h) ≈ ${compUsd.toFixed(2)} USD`,
      extra: { totalCompensationUsd: compUsd },
    })

    const issueCount = findings.filter((f) => f.severity === "critical" || f.severity === "warning").length

    await admin
      .from("treasury_reconciliation_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "completed",
        issue_count: issueCount,
        findings,
        meta: {
          approved_window_days: 45,
          evaluated_approvals: rows.length,
          main_treasury_usd: mainTreasury,
          started_at: startedAt,
        },
      })
      .eq("id", runId)

    await emitTreasuryStreamEvent(admin, {
      eventType: "reconciliation_completed",
      correlationId: runId,
      payload: {
        runId,
        issueCount,
        severityMax: findings.some((x) => x.severity === "critical")
          ? "critical"
          : findings.some((x) => x.severity === "warning")
            ? "warning"
            : "info",
      },
    })

    return { runId, findings, issueCount }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "reconcile failed"
    await admin
      .from("treasury_reconciliation_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        findings: [...findings, { code: "job_error", severity: "critical", detail: msg }],
        issue_count: findings.length + 1,
      })
      .eq("id", runId)
    throw e
  }
}
