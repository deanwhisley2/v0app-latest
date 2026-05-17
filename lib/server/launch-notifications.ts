import type { SupabaseClient } from "@supabase/supabase-js"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"

/** Institutional welcome — short, non-marketing. */
export async function notifyLaunchWelcome(
  admin: SupabaseClient,
  userId: string,
  regionCode: string,
): Promise<void> {
  const launch = await getPlatformLaunchStatus()
  if (!launch.active || !launch.programs.onboarding?.welcome_notification) return
  if (regionCode !== "UG" && launch.regionCode === "UG") return

  await appendUserAccountNotification(admin, {
    userId,
    sourceKind: "launch_welcome",
    sourceId: `${launch.slug ?? "launch"}:${userId}`,
    notificationType: "launch",
    title: "Welcome to Nexus Pro",
    body: "Your account is live. Fund your wallet to start trading. Refer friends during the launch window to unlock rewards.",
    nav: { tab: "wallet" },
    metadata: { launchSlug: launch.slug, regionCode },
  })
}

export async function notifyReferrerNewReferee(
  admin: SupabaseClient,
  referrerId: string,
  refereeId: string,
): Promise<void> {
  const launch = await getPlatformLaunchStatus()
  if (!launch.active || !launch.programs.referrals?.notify_on_registration) return

  await appendUserAccountNotification(admin, {
    userId: referrerId,
    sourceKind: "referral_registration",
    sourceId: refereeId,
    notificationType: "referral",
    title: "New referral joined",
    body: "Someone registered with your referral ID. Rewards apply after they fund and trade.",
    nav: { tab: "referrals" },
    metadata: { refereeUserId: refereeId, launchSlug: launch.slug },
  })
}
