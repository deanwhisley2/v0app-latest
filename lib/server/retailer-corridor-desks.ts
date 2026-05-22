import type { SupabaseClient } from "@supabase/supabase-js"
import { retailerDeskSupportsNetwork } from "@/lib/server/retailer-funding-helpers"

export type RetailerCorridorDeskRow = {
  id: string
  retailer_profile_id: string
  country_code: string
  payment_numbers: unknown
  registered_payee_names: string | null
  liquidity_status: string
  active: boolean
}

export async function loadActiveCorridorDesksForProfiles(
  admin: SupabaseClient,
  retailerProfileIds: string[],
): Promise<Map<string, RetailerCorridorDeskRow[]>> {
  const out = new Map<string, RetailerCorridorDeskRow[]>()
  const ids = [...new Set(retailerProfileIds)].filter(Boolean)
  if (!ids.length) return out

  const { data, error } = await admin
    .from("retailer_corridor_desks")
    .select(
      "id,retailer_profile_id,country_code,payment_numbers,registered_payee_names,liquidity_status,active",
    )
    .in("retailer_profile_id", ids)
    .eq("active", true)

  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const pid = String((row as { retailer_profile_id: string }).retailer_profile_id)
    const list = out.get(pid) ?? []
    list.push(row as RetailerCorridorDeskRow)
    out.set(pid, list)
  }
  return out
}

/** Merge corridor receive lines onto a retailer profile row for customer country matching. */
export function applyCorridorDeskToRetailerRow<T extends Record<string, unknown>>(
  row: T,
  corridor: RetailerCorridorDeskRow | null,
): T {
  if (!corridor) return row
  return {
    ...row,
    country_code: corridor.country_code.trim().toUpperCase().slice(0, 2),
    payment_numbers: corridor.payment_numbers,
    registered_payee_names: corridor.registered_payee_names ?? row.registered_payee_names,
    liquidity_status: corridor.liquidity_status ?? row.liquidity_status,
    corridor_desk_id: corridor.id,
  }
}

export function pickCorridorForCountry(
  corridors: RetailerCorridorDeskRow[] | undefined,
  customerCountryIso2: string,
  mobileNetwork: string,
): RetailerCorridorDeskRow | null {
  if (!corridors?.length) return null
  const cc = customerCountryIso2.trim().toUpperCase().slice(0, 2)
  for (const c of corridors) {
    const deskCc = String(c.country_code ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 2)
    if (deskCc !== cc) continue
    if (!retailerDeskSupportsNetwork(c.payment_numbers, mobileNetwork, cc)) continue
    return c
  }
  return null
}
