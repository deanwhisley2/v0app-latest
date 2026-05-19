import type { SupabaseClient } from "@supabase/supabase-js"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import {
  buildFundingApprovedCustomerCopy,
  buildFundingRejectedCustomerCopy,
} from "@/lib/notifications/customer-notification-language"
import { getFundingFxSnapshotByRequestId } from "@/lib/server/funding-fx-middleware"
import { emitTreasuryStreamEvent, fundRequestReferenceId } from "@/lib/server/treasury-operation-stream"
import { customerNotifyT, resolveCustomerAppLanguage } from "@/lib/server/customer-ui-language"

function buildFundingApprovedFromFx(
  fx: Record<string, unknown> | null,
  t: ReturnType<typeof customerNotifyT>,
) {
  const inputLocal = fx?.amount_input_local != null ? Number(fx.amount_input_local) : NaN
  const ccy = String(fx?.input_currency ?? "").trim()
  const normUsd = Number(fx?.amount_usd_normalized ?? 0)
  const settledUsdRaw = fx?.settled_amount_usd != null ? Number(fx.settled_amount_usd) : NaN
  const settledUsd =
    Number.isFinite(settledUsdRaw) && settledUsdRaw > 0
      ? settledUsdRaw
      : Number.isFinite(normUsd) && normUsd > 0
        ? normUsd
        : null

  return buildFundingApprovedCustomerCopy(
    {
      amountInputLocal: Number.isFinite(inputLocal) && inputLocal > 0 ? inputLocal : null,
      inputCurrency: ccy || null,
      amountUsd: settledUsd,
    },
    t,
  )
}

function opsAuditMetadata(params: {
  requestId: string
  viaTreasury: boolean
  fx: Record<string, unknown> | null
}): Record<string, unknown> {
  const fx = params.fx
  const treasuryRef = fundRequestReferenceId(params.requestId)
  return {
    ops_audit: {
      fund_request_id: params.requestId,
      treasury_debit_reference_id: treasuryRef,
      rail: params.viaTreasury ? "treasury_pool" : "retailer_retail_balance",
      fx_normalization_id: fx?.id != null ? String(fx.id) : null,
      rate_source: fx?.rate_source ?? null,
      middleware_version: fx?.middleware_version ?? null,
      amount_input_local: fx?.amount_input_local ?? null,
      input_currency: fx?.input_currency ?? null,
      amount_usd_normalized: fx?.amount_usd_normalized ?? null,
      settled_amount_usd: fx?.settled_amount_usd ?? null,
    },
    settlement_trace: {
      fund_request_id: params.requestId,
      treasury_debit_reference_id: treasuryRef,
      stream_version: "treasury_trace_v1",
    },
  }
}

/** Customer: funding approved and credited to Nexus Main. */
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

  const lang = await resolveCustomerAppLanguage(admin, params.userId)
  const t = customerNotifyT(lang)
  const { title, body, customerHint } = buildFundingApprovedFromFx(fx, t)

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
        friendly_detail: customerHint,
        ...opsAuditMetadata({ requestId: params.requestId, viaTreasury: params.viaTreasury, fx }),
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
        settlement_trace: opsAuditMetadata({ requestId: params.requestId, viaTreasury: params.viaTreasury, fx })
          .settlement_trace,
      },
    })
  }
}

/** Customer: funding declined (admin or ops). */
export async function notifyCustomerFundingDeclined(
  admin: SupabaseClient,
  params: { userId: string; requestId: string; resolutionNote?: string | null },
): Promise<void> {
  const lang = await resolveCustomerAppLanguage(admin, params.userId)
  const t = customerNotifyT(lang)
  const { title, body } = buildFundingRejectedCustomerCopy(params.resolutionNote, t)
  const nav: NexusNotificationNav = { kind: "notifications" }
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.userId,
      source_kind: "funding_status",
      source_id: `${params.requestId}:rejected`,
      notification_type: "financial",
      title,
      body,
      nav,
      metadata: {
        requestId: params.requestId,
        friendly_detail: "If you believe this was a mistake, contact support with your payment reference.",
        ops_audit: { status: "rejected", fund_request_id: params.requestId },
      },
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) console.warn("[l5-funding-notify] decline notify failed:", error.message)
}

/** Retailer desk user: admin approved using their Retail Balance. */
export async function notifyRetailerOverrideDebit(
  admin: SupabaseClient,
  params: { retailerUserId: string; requestId: string; amountUsd: number },
): Promise<void> {
  const nav: NexusNotificationNav = { kind: "notifications" }
  const friendly =
    "A customer top-up you approved has been settled. Your desk balance was adjusted to match that approval."
  const { error } = await admin.from("user_account_notifications").upsert(
    {
      user_id: params.retailerUserId,
      source_kind: "l5_retailer_override_debit",
      source_id: params.requestId,
      notification_type: "system",
      title: "Desk payment settled",
      body: "Your desk balance was updated after a customer funding approval.",
      nav,
      metadata: {
        requestId: params.requestId,
        friendly_detail: friendly,
        ops_audit: { retailerDebitedUsdEquivalent: params.amountUsd },
      },
    },
    { onConflict: "user_id,source_kind,source_id" },
  )
  if (error) console.warn("[l5-funding-notify] retailer notify failed:", error.message)
}
