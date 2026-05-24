"use client"

import { AndroidInstallDashboardReminder } from "@/components/install/android-install-dashboard-reminder"
import { AndroidAppUpdateBanner } from "@/components/install/android-app-update-banner"
import { useAndroidAppUpdate } from "@/hooks/use-android-app-update"
import { isPwaInstallEnabled } from "@/lib/mobile/pwa-safe-mode"

/**
 * Mobile: one secondary notice below the app bar (update takes priority over install prompt).
 */
export function DashboardMobileNotices() {
  const update = useAndroidAppUpdate()

  if (!isPwaInstallEnabled()) return null

  if (update.visible) {
    return (
      <div className="md:hidden">
        <AndroidAppUpdateBanner />
      </div>
    )
  }

  return (
    <div className="md:hidden">
      <AndroidInstallDashboardReminder />
    </div>
  )
}
