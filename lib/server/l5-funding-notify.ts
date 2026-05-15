import type { SupabaseClient } from "@supabase/supabase-js"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import { getFundingFxSnapshotByRequestId } from "@/lib/server/funding-fx-middleware"
import { emitTreasuryStreamEvent, fundRequestReferenceId } from "@/lib/server/treasury-operation-stream"

function fmtLocalAmount(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)
}

function buildFundingOperationalCopy(params: {
  viaTreasury: boolean
  fx: Record<string, unknown> | null
}): { title: string; body: string; friendly: string; metadataExtras: Record<string, unknown> } {
  const fx = params.fx
  const rateSource = String(fx?.rate_source ?? "")
  const fxId = fx?.id ? String(fx.id) : null
  const inputLocal = fx?.amount_input_local != null ? Number(fx.amount_input_local) : NaN
  const ccy = String(fx?.input_currency ?? "").trim()
  const normUsd = Number(fx?.amount_usd_normalized ?? 0)
  const settledUsdRaw = fx?.settled_amount_usd != null ? Number(fx.settled_amount_usd) : NaN
  const settledUsd = Number.isFinite(settledUsdRaw) && settledUsdRaw > 0 ? settledUsdRaw : normUsd
  const settledLocal = fx?.settled_local_equivalent != null ? Number(fx.settled_local_equivalent) : null

  const metadataExtras = {
    fundingFxNormalizationId: fxId,
    rateSource: rateSource || null,
    middlewareVersion: fx?.middleware_version != null ? String(fx.middleware_version) : null,
    rateCapturedAt: fx?.rate_captured_at ?? null,
    originalLocalAmount: Number.isFinite(inputLocal) ? inputLocal : null,
    inputCurrency: ccy || null,
    normalizedUsdSubmission: Number.isFinite(normUsd) ? normUsd : null,
    settledUsd: Number.isFinite(settledUsd) ? settledUsd : null,
    settledLocalEquivalent: settledLocal != null && Number.isFinite(settledLocal) ? settledLocal : null,
    feeCompensationApplied: false,
  }

  if (rateSource !== "usd_native_v1" && Number.isFinite(inputLocal) && inputLocal > 0 && ccy.length > 0) {
    const usdTxt = Number.isFinite(settledUsd) ? settledUsd.toFixed(2) : "0.00"
    let body = `Your funding request of ${fmtLocalAmount(inputLocal)} ${ccy} was approved. Normalized settlement: $${usdTxt} USD.`
    if (settledLocal != null && Number.isFinite(settledLocal)) {
      body += ` At the locked FX rate, about ${fmtLocalAmount(settledLocal)} ${ccy} matches that settlement.`
    }
    body += " Your Nexus Main balance has been updated."
    const friendly = params.viaTreasury
      ? "Approved with company treasury liquidity using your locked FX snapshot (no retailer desk debit)."
      : "Approved with desk or ops liquidity using the same locked FX rate captured when you submitted."
    return {
      title: "Funding approved",
      body,
      friendly,
      metadataExtras: { ...metadataExtras, feeCompensationApplied: false },
    }
  }

  const usdPart =
    Number.isFinite(settledUsd) && settledUsd > 0
      ? `$${settledUsd.toFixed(2)} USD`
      : "your submitted USD amount"
  const body = params.viaTreasury
    ? `Your funding (${usdPart}) was approved via our company treasury. Your Nexus Main balance has been updated.`
    : `Your funding (${usdPart}) was approved. Your Nexus Main balance has been updated.`
  const friendly = params.viaTreasury
    ? "Treasury-backed approval for an admin-direct or USD-native rail."
    : "Balance credit completed on the Nexus Main ledger."
  return {
    title: "Funding approved",
    body,
    friendly,
    metadataExtras,
  }
}

/** User: funding settled by ops (treasury desk or retailer override) with FX-aware copy when available. */
export async function notifyCustomerFundingOperational(
  admin: SupabaseClient,
  params: { userId: string; requestId: string; viaTreasury: boolean },
): Promise<void> {
  let fx: Record<string, unknown> | null = null
  try {
    fx = await getFundingFxSnapshotByRequestId(admin, params.requestId)
  } catch (e) {
    console.warn("[l5-funding-notify] FX snapshot lookup failed:", e)
  }

  const { title, body, friendly, metadataExtras } = buildFundingOperationalCopy({
    viaTreasury: params.viaTreasury,
    fx,
  })

  const treasuryRef = fundRequestReferenceId(params.requestId)

  const settlementTrace = {
    fund_request_id: params.requestId,
    treasury_debit_reference_id: treasuryRef,
    fx_normalization_id: fx?.id != null ? String(fx.id) : null,
    stream_version: "treasury_trace_v1",
  }

  const nav: NexusNotificationNav = { kind: "notifications" }
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.userId,
      source_kind: "l5_funding_settled",
      source_id: `${params.requestId}:${params.viaTreasury ? "treasury" : "retailer"}`,
      notification_type: "financial",
      title,
      body,
      nav,
      metadata: {
        requestId: params.requestId,
        rail: params.viaTreasury ? "treasury_pool" : "retailer_retail_balance",
        friendly_detail: friendly,
        settlement_trace: settlementTrace,
        ...metadataExtras,
      },
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) console.warn("[l5-funding-notify] customer notify failed:", error.message)
  else {
    await emitTreasuryStreamEvent(admin, {
      eventType: "notification_sent",
      fundRequestId: params.requestId,
      userId: params.userId,
      payload: {
        kind: "l5_funding_settled",
        title,
        settlement_trace: settlementTrace,
      },
    })
  }
}

/** Retailer desk user: admin approved using their Retail Balance. */
export async function notifyRetailerOverrideDebit(
  admin: SupabaseClient,
  params: { retailerUserId: string; requestId: string; amountUsd: number },
): Promise<void> {
  const nav: NexusNotificationNav = { kind: "notifications" }
  const friendly =
    "This matches a customer top-up you already approved. Your desk balance was reduced so their account could be credited — nothing extra beyond what you agreed to."
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.retailerUserId,
      source_kind: "l5_retailer_override_debit",
      source_id: params.requestId,
      notification_type: "system",
      title: "Desk payment approved",
      body: "We used your desk balance to cover a customer top-up you approved.",
      nav,
      metadata: {
        requestId: params.requestId,
        retailerDebitedUsdEquivalent: params.amountUsd,
        friendly_detail: friendly,
      },
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) console.warn("[l5-funding-notify] retailer notify failed:", error.message)
}
