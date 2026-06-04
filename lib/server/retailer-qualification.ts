import type { SupabaseClient } from "@supabase/supabase-js"
import { MAX_RETAILERS_ON_PAYMENT_PAGE } from "@/lib/server/admin-payment-config"
import {
  countOpenInboundRequestsForRetailer,
  retailerDeskSupportsNetwork,
  retailerSpendableLiquidity,
} from "@/lib/server/retailer-funding-helpers"
import {
  applyCorridorDeskToRetailerRow,
  loadActiveCorridorDesksForProfiles,
  pickCorridorForCountry,
} from "@/lib/server/retailer-corridor-desks"
import {
  logPaymentRouteValidationFailure,
  resolvePaymentRouteForNetwork,
} from "@/lib/payment-route-resolution"
import { applyPaymentRotationToDeskRow } from "@/lib/server/retailer-payment-rotation"

export type CorridorQualificationParams = {
  /** ISO 3166-1 alpha-2 */
  customerCountry: string
  /** Raw network label from UI/API (MTN, Airtel, …) */
  mobileNetwork: string
  /** USD-normalized ledger amount */
  amountUsd: number
}

const MAX_OPEN_TICKETS = 80

/** Normalize network for corridor DB lookup (matches retailer routing conventions). */
export function normalizeCorridorNetworkToken(raw: string): string {
  const s = String(raw ?? "").trim()
  if (!s) return ""
  const lower = s.toLowerCase()
  if (lower === "other") return "OTHER"
  if (/m\s*-?\s*pesa|mpesa/i.test(s)) return "MPESA"
  const compact = s.toUpperCase().replace(/\s+/g, "")
  return compact
}

async function loadVerifiedRetailerUserIds(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Set<string>> {
  const uniq = [...new Set(userIds)].filter(Boolean)
  if (!uniq.length) return new Set()
  const { data, error } = await admin.from("profiles").select("id,is_verified").in("id", uniq)
  if (error) return new Set()
  const ok = new Set<string>()
  for (const row of data ?? []) {
    const id = String((row as { id?: string }).id ?? "")
    const v = (row as { is_verified?: boolean }).is_verified
    if (id && v === true) ok.add(id)
  }
  return ok
}

/**
 * Strict solvency-first retailer discovery for local mobile-money funding.
 * Eligibility: same country (desk must declare ISO2), network match, verified desk owner,
 * active liquidity status, spendable retail >= amount, open-inbound cap.
 */
export type CollectQualifiedRetailDesksOpts = CorridorQualificationParams & {
  /** Sticky rotation line for open funding requests. */
  customerUserId?: string | null
}

export async function collectQualifiedRetailDesks(
  admin: SupabaseClient,
  params: CollectQualifiedRetailDesksOpts,
): Promise<Array<Record<string, unknown>>> {
  const customerCountry = params.customerCountry.trim().toUpperCase().slice(0, 2)
  const mobileNetwork = params.mobileNetwork.trim()
  const amount = params.amountUsd

  const { data: rows, error } = await admin
    .from("retailer_profiles")
    .select(
      "id,user_id,payment_numbers,credit_basin,under_review,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,estimated_response_minutes,last_activity_at,updated_at",
    )
    .eq("is_country_retailer", true)
    .eq("under_review", false)
    .in("liquidity_status", ["active", "busy", "low_liquidity"])
    .order("updated_at", { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  const profileIds = (rows ?? []).map((r) => String((r as { id: string }).id))
  const corridorByProfile = await loadActiveCorridorDesksForProfiles(admin, profileIds)

  const candidates: Array<Record<string, unknown>> = []
  for (const row of rows ?? []) {
    const rid = String((row as { id: string }).id)
    const corridors = corridorByProfile.get(rid)
    const corridor = pickCorridorForCountry(corridors, customerCountry, mobileNetwork)
    if (corridor) {
      candidates.push(applyCorridorDeskToRetailerRow(row as Record<string, unknown>, corridor))
      continue
    }
    const deskCc = String(row.country_code ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 2)
    if (deskCc.length === 2 && deskCc === customerCountry) {
      candidates.push(row as Record<string, unknown>)
    }
  }

  const uids = candidates.map((r) => String((r as { user_id: string }).user_id))
  const verifiedIds = await loadVerifiedRetailerUserIds(admin, uids)

  const { data: profRows } = await admin
    .from("profiles")
    .select("id,operational_freeze_at,account_disabled_at")
    .in("id", uids.length ? uids : ["00000000-0000-0000-0000-000000000000"])
  const profById = new Map((profRows ?? []).map((p) => [String(p.id), p]))

  const qualified: Array<Record<string, unknown>> = []
  for (const row of candidates) {
    const uid = String((row as { user_id: string }).user_id)
    if (!verifiedIds.has(uid)) continue
    const prof = profById.get(uid)
    if (prof?.account_disabled_at || prof?.operational_freeze_at) continue
    const liq = String((row as { liquidity_status?: string }).liquidity_status ?? "")
    if (!["active", "busy", "low_liquidity"].includes(liq)) continue

    if (!retailerDeskSupportsNetwork(row.payment_numbers, mobileNetwork, customerCountry)) continue

    const rid = String((row as { id: string }).id)
    const routeCheck = resolvePaymentRouteForNetwork(
      row.payment_numbers,
      mobileNetwork,
      (row as { registered_payee_names?: string | null }).registered_payee_names,
    )
    if (!routeCheck?.valid) {
      if (routeCheck) {
        logPaymentRouteValidationFailure("retailer_qualification_blocked", routeCheck, {
          retailerProfileId: rid,
          userId: uid,
        })
      }
      continue
    }
    const { spendable } = await retailerSpendableLiquidity(admin, uid, rid)
    if (spendable < amount) continue

    const openCount = await countOpenInboundRequestsForRetailer(admin, rid)
    if (openCount >= MAX_OPEN_TICKETS) continue

    qualified.push({
      ...row,
      spendable_liquidity: spendable,
      open_inbound_count: openCount,
      qualification_verified_desk: true,
    })
  }

  const withRotation: Array<Record<string, unknown>> = []
  for (const row of qualified) {
    withRotation.push(
      await applyPaymentRotationToDeskRow(admin, row, {
        customerCountry,
        mobileNetwork,
        userId: params.customerUserId ?? null,
      }),
    )
  }

  const statusOrder: Record<string, number> = { active: 0, busy: 1, low_liquidity: 2 }
  withRotation.sort((a, b) => {
    const sa = statusOrder[String(a.liquidity_status ?? "")] ?? 9
    const sb = statusOrder[String(b.liquidity_status ?? "")] ?? 9
    if (sa !== sb) return sa - sb
    const pa = Number(a.spendable_liquidity ?? 0)
    const pb = Number(b.spendable_liquidity ?? 0)
    return pb - pa
  })

  return withRotation.slice(0, MAX_RETAILERS_ON_PAYMENT_PAGE)
}

export async function assertRetailDeskQualifiesForCorridor(
  admin: SupabaseClient,
  retailerProfileId: string,
  params: CorridorQualificationParams,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const list = await collectQualifiedRetailDesks(admin, params)
  const ok = list.some((r) => String((r as { id: string }).id) === retailerProfileId)
  if (ok) return { ok: true }
  return {
    ok: false,
    message:
      "This retailer is not qualified for your corridor right now (country, network, verification, liquidity, or capacity). Refresh and pick from the current list.",
  }
}

export type OfficialCorridorRouteRow = {
  id: string
  country_code: string
  network_token: string
  payee_display_name: string
  payment_numbers: unknown
  whatsapp_number: string | null
  contact_phone: string | null
}

/** Active official receive line for corridor when no retailer qualifies (admin-configured). */
export async function fetchOfficialCorridorRoute(
  admin: SupabaseClient,
  params: CorridorQualificationParams,
): Promise<OfficialCorridorRouteRow | null> {
  const cc = params.customerCountry.trim().toUpperCase().slice(0, 2)
  const net = normalizeCorridorNetworkToken(params.mobileNetwork)
  if (!cc || !net) return null

  const { data: rows, error } = await admin
    .from("official_corridor_payment_routes")
    .select(
      "id,country_code,network_token,payee_display_name,payment_numbers,whatsapp_number,contact_phone,sort_order",
    )
    .eq("active", true)
    .eq("country_code", cc)
    .order("sort_order", { ascending: true })

  if (error) return null
  for (const r of rows ?? []) {
    const rowNet = normalizeCorridorNetworkToken(String((r as { network_token?: string }).network_token ?? ""))
    if (rowNet === net) return r as OfficialCorridorRouteRow
  }
  return null
}
