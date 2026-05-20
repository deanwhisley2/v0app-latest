import type { SupabaseClient } from "@supabase/supabase-js"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"
import { customerNotifyForUser } from "@/lib/server/customer-ui-language"

/** Institutional welcome — short, non-marketing. */
export async function notifyLaunchWelcome(
  admin: SupabaseClient,
  userId: string,
  regionCode: string,
): Promise<void> {
  const launch = await getPlatformLaunchStatus()
  if (!launch.active || !launch.programs.onboarding?.welcome_notification) return

  const { t } = await customerNotifyForUser(admin, userId)

  await appendUserAccountNotification(admin, {
    userId,
    sourceKind: "launch_welcome",
    sourceId: `${launch.slug ?? "launch"}:${userId}`,
    notificationType: "launch",
    title: t("notifications.launch.welcomeTitle"),
    body: t("notifications.launch.welcomeBody"),
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

  const { t } = await customerNotifyForUser(admin, referrerId)

  await appendUserAccountNotification(admin, {
    userId: referrerId,
    sourceKind: "referral_registration",
    sourceId: refereeId,
    notificationType: "referral",
    title: t("notifications.launch.newReferralTitle"),
    body: t("notifications.launch.newReferralBody"),
    nav: { tab: "referrals" },
    metadata: { refereeUserId: refereeId, launchSlug: launch.slug },
  })
}
