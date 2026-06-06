import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { computeTradeSessionSettlementMonitoring } from "@/lib/server/trade-session-settlement-monitoring"

export const dynamic = "force-dynamic"

/**
 * Trade-session settlement workflow health.
 * Returns ok:false when stranded capital is detected (reserved stake without ledger resolution).
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    const settlement = await computeTradeSessionSettlementMonitoring(admin)
    return NextResponse.json({
      ok: !settlement.hasStrandedCapital,
      /** Duplicate reconcile top-ups in ledger (historical + monitoring). Does not fail health once idempotency is live. */
      duplicateTopupAlert: settlement.hasDuplicateReconcileTopups,
      profitPercentageAlert: settlement.hasSettledWithoutProfitPercentage,
      service: "nexus-settlement",
      time: new Date().toISOString(),
      settlement,
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        service: "nexus-settlement",
        error: e instanceof Error ? e.message : "Internal error",
        time: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}
