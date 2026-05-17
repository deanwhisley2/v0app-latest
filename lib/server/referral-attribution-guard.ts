import type { SupabaseClient } from "@supabase/supabase-js"

const REFERRER_BURST_WINDOW_MS = 60 * 60 * 1000
const REFERRER_BURST_MAX = 30

/**
 * Anti-abuse: block attribution when a referrer exceeds burst registration rate.
 * Does not weaken ledger — only skips referred_by write.
 */
export async function isReferralAttributionBlocked(
  admin: SupabaseClient,
  referrerId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - REFERRER_BURST_WINDOW_MS).toISOString()
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", referrerId)
    .gte("created_at", since)
  if (error) {
    console.warn("[referral-attribution-guard]", error.message)
    return false
  }
  return (count ?? 0) >= REFERRER_BURST_MAX
}
