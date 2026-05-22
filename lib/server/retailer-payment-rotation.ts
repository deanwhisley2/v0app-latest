import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeCorridorNetworkToken } from "@/lib/server/retailer-qualification"
import { retailerDeskSupportsNetwork } from "@/lib/server/retailer-funding-helpers"

export const PAYMENT_ROTATION_APPROVAL_THRESHOLD = 5
export const PAYMENT_ROTATION_UNIQUE_CLIENT_THRESHOLD = 5

export type RotationResolveResult = {
  poolId: string
  lineId: string
  paymentLine: Record<string, unknown>
  stickyPending: boolean
}

type PaymentLineRow = {
  label?: string
  value?: string
  payment_type?: string
  payee_name?: string
  merchant_id?: string
  merchant_name?: string
  ussd_prefix?: string
}

/** Lines in payment_numbers that match the customer's network (one pool per network). */
export function paymentLinesForNetwork(
  paymentNumbers: unknown,
  mobileNetwork: string,
  customerCountryIso2: string,
): PaymentLineRow[] {
  const rows = Array.isArray(paymentNumbers) ? (paymentNumbers as PaymentLineRow[]) : []
  const matched: PaymentLineRow[] = []
  for (const row of rows) {
    if (retailerDeskSupportsNetwork([row], mobileNetwork, customerCountryIso2)) {
      matched.push(row)
    }
  }
  return matched.length ? matched : rows.length === 1 ? rows : []
}

export function needsPaymentRotation(paymentNumbers: unknown, mobileNetwork: string, country: string): boolean {
  return paymentLinesForNetwork(paymentNumbers, mobileNetwork, country).length > 1
}

export async function resolveExposedPaymentLine(
  admin: SupabaseClient,
  opts: {
    retailerProfileId: string
    countryCode: string
    mobileNetwork: string
    paymentNumbers: unknown
    corridorDeskId?: string | null
    userId?: string | null
  },
): Promise<RotationResolveResult | null> {
  const cc = opts.countryCode.trim().toUpperCase().slice(0, 2)
  const net = normalizeCorridorNetworkToken(opts.mobileNetwork)
  if (!cc || !net) return null

  const lines = paymentLinesForNetwork(opts.paymentNumbers, opts.mobileNetwork, cc)
  if (!lines.length) return null

  const { data, error } = await admin.rpc("resolve_retailer_payment_rotation_line", {
    p_retailer_profile_id: opts.retailerProfileId,
    p_country_code: cc,
    p_network_token: net,
    p_payment_numbers: lines,
    p_user_id: opts.userId ?? null,
    p_corridor_desk_id: opts.corridorDeskId ?? null,
  })

  if (error) throw new Error(error.message)
  const out = data as {
    pool_id?: string
    line_id?: string
    payment_line?: Record<string, unknown>
    sticky_pending?: boolean
  } | null
  if (!out?.pool_id || !out?.line_id || !out?.payment_line) return null

  return {
    poolId: String(out.pool_id),
    lineId: String(out.line_id),
    paymentLine: out.payment_line,
    stickyPending: Boolean(out.sticky_pending),
  }
}

/** Customer-visible payment_numbers: single exposed line when rotation applies. */
export async function applyPaymentRotationToDeskRow<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  row: T,
  params: {
    customerCountry: string
    mobileNetwork: string
    userId?: string | null
  },
): Promise<T> {
  const cc = params.customerCountry.trim().toUpperCase().slice(0, 2)
  const paymentNumbers = row.payment_numbers
  const lines = paymentLinesForNetwork(paymentNumbers, params.mobileNetwork, cc)
  if (lines.length <= 1) {
    return row
  }

  const resolved = await resolveExposedPaymentLine(admin, {
    retailerProfileId: String(row.id),
    countryCode: cc,
    mobileNetwork: params.mobileNetwork,
    paymentNumbers,
    corridorDeskId:
      typeof row.corridor_desk_id === "string" ? row.corridor_desk_id : null,
    userId: params.userId ?? null,
  })

  if (!resolved) return row

  return {
    ...row,
    payment_numbers: [resolved.paymentLine],
    payment_rotation_line_id: resolved.lineId,
    payment_rotation_pool_id: resolved.poolId,
    payment_rotation_sticky_pending: resolved.stickyPending,
  }
}

export async function bindFundRequestRotationLine(
  admin: SupabaseClient,
  fundRequestId: string,
  lineId: string,
  poolId: string,
): Promise<void> {
  const { error } = await admin.rpc("bind_retailer_fund_request_rotation_line", {
    p_fund_request_id: fundRequestId,
    p_line_id: lineId,
    p_pool_id: poolId,
  })
  if (error) throw new Error(error.message)
}

export async function recordRotationApproval(admin: SupabaseClient, fundRequestId: string): Promise<void> {
  const { error } = await admin.rpc("record_retailer_payment_rotation_approval", {
    p_fund_request_id: fundRequestId,
  })
  if (error) throw new Error(error.message)
}

export async function releaseRotationPending(admin: SupabaseClient, fundRequestId: string): Promise<void> {
  const { error } = await admin.rpc("release_retailer_payment_rotation_pending", {
    p_fund_request_id: fundRequestId,
  })
  if (error) throw new Error(error.message)
}
