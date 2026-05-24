"use client"

import { useEffect, useState } from "react"
import { consumeFreshLoginLanding } from "@/lib/dashboard-navigation-policy"
import { AndroidInstallPrompt } from "@/components/install/android-install-prompt"
import { isLightweightAndroidInstallEnabled, isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

/** Post-login Android install reminder (one-shot per fresh login, snoozeable). */
export function AndroidInstallDashboardReminder() {
  if (isPwaSafeMode() && !isLightweightAndroidInstallEnabled()) return null
  return <AndroidInstallDashboardReminderActive />
}

function AndroidInstallDashboardReminderActive() {
  const [freshLogin, setFreshLogin] = useState(false)

  useEffect(() => {
    setFreshLogin(consumeFreshLoginLanding())
  }, [])

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-2 max-md:pt-1">
      <AndroidInstallPrompt
        surface="dashboard"
        variant="banner"
        freshLogin={freshLogin}
        freshLoginOnly
      />
    </div>
  )
}
