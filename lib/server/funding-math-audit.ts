import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { localToUsdWithDailyRate } from "@/lib/server/daily-fx-rate"

const USD_TOLERANCE = 0.02

export type FundingMathAuditResult = {
  ok: boolean
  severity: "info" | "warning" | "critical"
  code: string
  message: string
  expectedUsd: number | null
  actualUsd: number | null
}

export function auditFundingConversion(params: {
  amountInputLocal: number | null
  inputCurrency: string | null
  fxRateSnapshot: number | null
  amountUsdLocked: number
}): FundingMathAuditResult {
  const actualUsd = roundUsd2(params.amountUsdLocked)
  if (
    params.amountInputLocal == null ||
    !Number.isFinite(params.amountInputLocal) ||
    params.amountInputLocal <= 0 ||
    !params.inputCurrency?.trim() ||
    !params.fxRateSnapshot ||
    params.fxRateSnapshot <= 0
  ) {
    return {
      ok: true,
      severity: "info",
      code: "NO_LOCAL_INPUT",
      message: "No local amount snapshot to verify.",
      expectedUsd: null,
      actualUsd,
    }
  }

  const expectedUsd = localToUsdWithDailyRate(params.amountInputLocal, params.fxRateSnapshot)
  const delta = Math.abs(expectedUsd - actualUsd)
  if (delta <= USD_TOLERANCE) {
    return {
      ok: true,
      severity: "info",
      code: "FX_MATCH",
      message: "Local amount matches locked USD at daily FX rate.",
      expectedUsd,
      actualUsd,
    }
  }

  return {
    ok: false,
    severity: delta > 1 ? "critical" : "warning",
    code: "FX_MISMATCH",
    message: `Funding USD (${actualUsd}) does not match local ${params.amountInputLocal} ${params.inputCurrency} at rate ${params.fxRateSnapshot} (expected ~${expectedUsd}).`,
    expectedUsd,
    actualUsd,
  }
}

export async function persistFundingAudit(
  admin: SupabaseClient,
  row: {
    fundRequestId?: string | null
    userId?: string | null
    retailerId?: string | null
    result: FundingMathAuditResult
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await admin.from("funding_integrity_audits").insert({
    fund_request_id: row.fundRequestId ?? null,
    user_id: row.userId ?? null,
    retailer_id: row.retailerId ?? null,
    severity: row.result.severity,
    audit_code: row.result.code,
    message: row.result.message,
    expected_usd: row.result.expectedUsd,
    actual_usd: row.result.actualUsd,
    metadata: row.metadata ?? {},
  })
  if (error) throw new Error(error.message)
}
