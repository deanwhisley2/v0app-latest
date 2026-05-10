import type { SupabaseClient } from "@supabase/supabase-js"
import { tryCreditReferrerFirstDepositBonus } from "@/lib/server/referral-first-deposit"

const TABLE_REQUESTS = "retailer_fund_requests"
const TABLE_BALANCES = "user_balances"

export async function sumPendingIncomingForRetailer(
  sb: SupabaseClient,
  retailerProfileId: string,
): Promise<number> {
  const { data } = await sb
    .from(TABLE_REQUESTS)
    .select("amount")
    .eq("retailer_id", retailerProfileId)
    .in("status", ["pending", "under_review", "appealed", "escalated"])

  if (!data?.length) return 0
  return data.reduce((s: number, r: { amount: string | number | null }) => s + Number(r.amount ?? 0), 0)
}

export async function getUserAvailableBalance(sb: SupabaseClient, userId: string): Promise<number> {
  const { data } = await sb
    .from(TABLE_BALANCES)
    .select("available_balance")
    .eq("user_id", userId)
    .maybeSingle()
  return Number(data?.available_balance ?? 0)
}

export async function getUserRetailBalance(sb: SupabaseClient, userId: string): Promise<number> {
  const { data } = await sb
    .from(TABLE_BALANCES)
    .select("retail_balance")
    .eq("user_id", userId)
    .maybeSingle()
  const v = (data as { retail_balance?: string | number | null } | null)?.retail_balance
  return Number(v ?? 0)
}

function normMobileToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Infer MTN vs Airtel from Uganda MSISDN (077/076/078 vs 070/074/075 national prefixes).
 * Handles +256…, 0…, or 9-digit national starting with 7x.
 */
export function ugandaPhoneInfersNetwork(msisdn: string): "mtn" | "airtel" | null {
  let d = String(msisdn).replace(/\D/g, "")
  if (d.length < 9) return null
  if (d.startsWith("256")) d = d.slice(3)
  else if (d.startsWith("0")) d = d.slice(1)
  if (d.length < 9) return null
  const p2 = d.slice(0, 2)
  if (p2 === "77" || p2 === "78" || p2 === "76") return "mtn"
  if (p2 === "70" || p2 === "74" || p2 === "75") return "airtel"
  return null
}

function selectedNetworkKindFromNeedle(needle: string): "mtn" | "airtel" | null {
  if (needle === "mtn" || needle === "mtnmobile" || needle === "mtnmobilemoney") return "mtn"
  if (needle === "airtel" || needle === "airtelmoney") return "airtel"
  return null
}

/** True if desk payment_numbers indicate support for the customer's mobile network (Option B funding). */
export function retailerDeskSupportsNetwork(
  paymentNumbers: unknown,
  mobileNetwork: string,
  /** When set (e.g. UG), MTN/Airtel can match generic labels via MSISDN prefixes on payment lines. */
  customerCountryIso2?: string,
): boolean {
  const raw = mobileNetwork.trim()
  if (!raw || /^other$/i.test(raw)) return true

  const needle = normMobileToken(raw)
  if (!needle) return true

  const rows = Array.isArray(paymentNumbers) ? paymentNumbers : []
  for (const p of rows) {
    const row = p as { label?: string; value?: string }
    const lab = normMobileToken(String(row?.label ?? ""))
    const val = normMobileToken(String(row?.value ?? ""))
    if (!lab && !val) continue
    if (lab.includes(needle) || needle.includes(lab)) return true
    if (val.includes(needle) || needle.includes(val)) return true
    const bundle = lab + val
    if (bundle.includes(needle)) return true
  }

  const cc = String(customerCountryIso2 ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2)
  const want = selectedNetworkKindFromNeedle(needle)
  if (cc === "UG" && want) {
    for (const p of rows) {
      const row = p as { value?: string }
      const inf = ugandaPhoneInfersNetwork(String(row?.value ?? ""))
      if (inf === want) return true
    }
  }

  return false
}

/** Optional: hide desks that are clearly overloaded with open tickets (ops safety). */
export async function countOpenInboundRequestsForRetailer(
  sb: SupabaseClient,
  retailerProfileId: string,
): Promise<number> {
  const { count, error } = await sb
    .from(TABLE_REQUESTS)
    .select("id", { count: "exact", head: true })
    .eq("retailer_id", retailerProfileId)
    .in("status", ["pending", "under_review", "appealed", "escalated"])
  if (error) return 0
  return count ?? 0
}

/** Retail operational float minus reserved pending inbound mobile-money totals. */
export async function retailerSpendableLiquidity(
  sb: SupabaseClient,
  retailerUserId: string,
  retailerProfileId: string,
): Promise<{ balance: number; pendingInbound: number; spendable: number }> {
  const [balance, pendingInbound] = await Promise.all([
    getUserRetailBalance(sb, retailerUserId),
    sumPendingIncomingForRetailer(sb, retailerProfileId),
  ])
  return {
    balance,
    pendingInbound,
    spendable: Math.max(0, balance - pendingInbound),
  }
}

/** Internal transfer retailer → customer Nexus main balances. */
export async function transferRetailCreditToCustomer(
  sb: SupabaseClient,
  opts: {
    retailerUserId: string
    customerUserId: string
    amount: number
    requestId?: string | null
  },
): Promise<void> {
  const amt = opts.amount
  if (!(amt > 0) || Number.isNaN(amt)) throw new Error("Invalid transfer amount.")

  const { data: fromRow } = await sb
    .from(TABLE_BALANCES)
    .select("available_balance, retail_balance")
    .eq("user_id", opts.retailerUserId)
    .maybeSingle()
  const { data: toRow } = await sb
    .from(TABLE_BALANCES)
    .select("available_balance")
    .eq("user_id", opts.customerUserId)
    .maybeSingle()

  const row = fromRow as { available_balance?: unknown; retail_balance?: unknown } | null
  const fromRetail = Number(row?.retail_balance ?? 0)
  const retailerMain = Number(row?.available_balance ?? 0)
  if (fromRetail < amt) throw new Error("Retail Balance insufficient for this approval.")

  const toAvail = Number(toRow?.available_balance ?? 0)
  const now = new Date().toISOString()

  await sb
    .from(TABLE_BALANCES)
    .upsert(
      {
        user_id: opts.retailerUserId,
        available_balance: retailerMain,
        retail_balance: fromRetail - amt,
        last_updated: now,
      },
      { onConflict: "user_id" },
    )
  await sb
    .from(TABLE_BALANCES)
    .upsert({ user_id: opts.customerUserId, available_balance: toAvail + amt, last_updated: now }, {
      onConflict: "user_id",
    })

  console.info("[transferRetailCreditToCustomer]", {
    ...opts,
    prevRetailBalance: fromRetail,
    prevCustomerAvailable: toAvail,
  })

  await tryCreditReferrerFirstDepositBonus(sb, opts.customerUserId, amt)
}

/** Credit Retail Balance after admin verifies crypto (+ commission). */
export async function creditRetailerLiquidityPlusCommission(
  sb: SupabaseClient,
  retailerUserId: string,
  baseRequested: number,
  commissionRate: number,
): Promise<{ credited: number }> {
  const base = baseRequested
  if (!(base > 0)) throw new Error("Invalid requested amount.")
  const rate = Math.max(0, Number(commissionRate) || 0)
  const credited = Math.round(base * (1 + rate) * 100) / 100

  const { data } = await sb
    .from(TABLE_BALANCES)
    .select("available_balance, retail_balance")
    .eq("user_id", retailerUserId)
    .maybeSingle()
  const row = data as { available_balance?: unknown; retail_balance?: unknown } | null
  const curMain = Number(row?.available_balance ?? 0)
  const curRetail = Number(row?.retail_balance ?? 0)
  const now = new Date().toISOString()
  await sb
    .from(TABLE_BALANCES)
    .upsert(
      {
        user_id: retailerUserId,
        available_balance: curMain,
        retail_balance: curRetail + credited,
        last_updated: now,
      },
      { onConflict: "user_id" },
    )
  return { credited }
}

/** Move USD between Nexus Main (available) and Retail Balance for a retailer user. */
export async function transferRetailPoolInternal(
  sb: SupabaseClient,
  userId: string,
  direction: "to_retail" | "to_nexus",
  amount: number,
): Promise<{ retail_balance: number; available_balance: number }> {
  const amt = amount
  if (!(amt > 0) || Number.isNaN(amt)) throw new Error("Invalid amount.")

  const { data } = await sb
    .from(TABLE_BALANCES)
    .select("available_balance, retail_balance")
    .eq("user_id", userId)
    .maybeSingle()
  const row = data as { available_balance?: unknown; retail_balance?: unknown } | null
  let main = Number(row?.available_balance ?? 0)
  let retail = Number(row?.retail_balance ?? 0)

  if (direction === "to_retail") {
    if (main < amt) throw new Error("Nexus Main available balance insufficient.")
    main -= amt
    retail += amt
  } else {
    if (retail < amt) throw new Error("Retail Balance insufficient.")
    retail -= amt
    main += amt
  }

  const now = new Date().toISOString()
  await sb
    .from(TABLE_BALANCES)
    .upsert({ user_id: userId, available_balance: main, retail_balance: retail, last_updated: now }, {
      onConflict: "user_id",
    })
  return { retail_balance: retail, available_balance: main }
}

/** Attach profiles.email for retailer_profiles rows (admin + L2 desk network directory). */
export async function attachProfileEmailsToRetailers<T extends { user_id: string }>(
  sb: SupabaseClient,
  rows: T[],
): Promise<Array<T & { profile_email: string | null }>> {
  if (!rows.length) return []
  const ids = [...new Set(rows.map((r) => r.user_id))]
  const { data } = await sb.from("profiles").select("id,email").in("id", ids)
  const rows_raw = (data ?? []) as { id: string; email: string | null }[]
  const map = new Map<string, string | null>(rows_raw.map((p) => [p.id, p.email ?? null]))
  return rows.map((r) => ({ ...r, profile_email: map.get(r.user_id) ?? null }))
}
