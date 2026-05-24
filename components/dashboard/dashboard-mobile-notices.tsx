"use client"

import { AndroidApkUpdatePanel } from "@/components/install/android-apk-update-panel"
import { AndroidInstallStaticBanner } from "@/components/install/android-install-static-banner"
import { AndroidAppUpdateBanner } from "@/components/install/android-app-update-banner"
import { AndroidInstallDashboardReminder } from "@/components/install/android-install-dashboard-reminder"
import { useAndroidAppUpdate } from "@/hooks/use-android-app-update"
import {
  isInstallStaticBannerEnabled,
  isLightweightAndroidInstallEnabled,
  isPwaSafeMode,
} from "@/lib/mobile/pwa-safe-mode"

/**
 * Mobile notices below app bar — static install path uses user-tap update only (no polling).
 */
export function DashboardMobileNotices() {
  const legacyUpdate = useAndroidAppUpdate()

  if (isInstallStaticBannerEnabled()) {
    return (
      <div className="md:hidden space-y-2">
        <AndroidApkUpdatePanel surface="dashboard" />
        <div className="mx-auto max-w-[1600px] px-4">
          <AndroidInstallStaticBanner surface="dashboard" variant="banner" />
        </div>
      </div>
    )
  }

  if (isPwaSafeMode() && !isLightweightAndroidInstallEnabled()) return null

  if (legacyUpdate.visible) {
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
