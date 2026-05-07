import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  coerceExchangeBalancesSnapshot,
  type NexusExchangeBalancesSnapshotV1,
} from "@/lib/exchange-balances-snapshot-types"

/** Server-side read of profiles.nexus_exchange_balances_snapshot (service role). */
export async function loadExchangeBalancesSnapshot(
  userId: string
): Promise<NexusExchangeBalancesSnapshotV1 | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("profiles")
    .select("nexus_exchange_balances_snapshot")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.warn("[load-exchange-balances-snapshot]", error.message)
    return null
  }

  const raw = (data as { nexus_exchange_balances_snapshot?: unknown } | null)?.nexus_exchange_balances_snapshot
  return coerceExchangeBalancesSnapshot(raw)
}
