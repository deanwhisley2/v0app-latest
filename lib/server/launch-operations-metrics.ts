import { createAdminClient } from "@/lib/supabaseAdmin"
import { getMarketPriceHealthSnapshot } from "@/lib/server/market-price-health"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"

export type LaunchOperationsSnapshot = {
  launch: Awaited<ReturnType<typeof getPlatformLaunchStatus>>
  last24h: {
    newProfiles: number
    referredRegistrations: number
    fundingEventsCompleted: number
    fundingEventsFailed: number
    duplicateFundingReferences: number
    referralBonusesPaid: number
    supportThreadsOpen: number
    supportEscalations: number
    accountNotificationsInserted: number
  }
  marketAuthority: {
    stale: boolean
    alertLevel: string
    activeProvider: string | null
    consecutiveRefreshFailures: number
  }
}

function hoursAgoIso(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

export async function buildLaunchOperationsSnapshot(): Promise<LaunchOperationsSnapshot> {
  const admin = createAdminClient()
  const since = hoursAgoIso(24)
  const launch = await getPlatformLaunchStatus(true)

  const [
    profilesRes,
    referredRes,
    fundOkRes,
    fundFailRes,
    refBonusRes,
    supportOpenRes,
    escalationRes,
    notifRes,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .not("referred_by", "is", null),
    admin
      .from("container_balance_events")
      .select("id", { count: "exact", head: true })
      .eq("category", "funding")
      .eq("status", "completed")
      .gte("created_at", since),
    admin
      .from("container_balance_events")
      .select("id", { count: "exact", head: true })
      .eq("category", "funding")
      .eq("status", "failed")
      .gte("created_at", since),
    admin
      .from("container_balance_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "referral_first_deposit_bonus")
      .gte("created_at", since),
    admin
      .from("operational_support_threads")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "pending_admin", "pending_user", "under_review"]),
    admin
      .from("operational_support_threads")
      .select("id", { count: "exact", head: true })
      .in("category", ["appeal", "assistant_escalation"])
      .gte("updated_at", since),
    admin
      .from("user_account_notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ])

  const dupRes = await admin
    .from("funding_reference_security_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
  const duplicateFundingReferences = dupRes.count ?? 0

  const health = getMarketPriceHealthSnapshot()
  const consecutiveRefreshFailures =
    "observability" in health &&
    health.observability &&
    typeof health.observability === "object" &&
    "consecutiveRefreshFailures" in health.observability
      ? Number((health.observability as { consecutiveRefreshFailures: number }).consecutiveRefreshFailures)
      : 0

  return {
    launch,
    last24h: {
      newProfiles: profilesRes.count ?? 0,
      referredRegistrations: referredRes.count ?? 0,
      fundingEventsCompleted: fundOkRes.count ?? 0,
      fundingEventsFailed: fundFailRes.count ?? 0,
      duplicateFundingReferences,
      referralBonusesPaid: refBonusRes.count ?? 0,
      supportThreadsOpen: supportOpenRes.count ?? 0,
      supportEscalations: escalationRes.count ?? 0,
      accountNotificationsInserted: notifRes.count ?? 0,
    },
    marketAuthority: {
      stale: health.stale,
      alertLevel: health.alertLevel,
      activeProvider: health.activeProvider,
      consecutiveRefreshFailures,
    },
  }
}
