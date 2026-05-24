"use client"

import { useEffect, useState } from "react"
import { consumeFreshLoginLanding } from "@/lib/dashboard-navigation-policy"
import { AndroidInstallPrompt } from "@/components/install/android-install-prompt"

/** Post-login Android install reminder (one-shot per fresh login, snoozeable). */
export function AndroidInstallDashboardReminder() {
  const [freshLogin, setFreshLogin] = useState(false)

  useEffect(() => {
    setFreshLogin(consumeFreshLoginLanding())
  }, [])

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-2">
      <AndroidInstallPrompt
        surface="dashboard"
        variant="banner"
        freshLogin={freshLogin}
        freshLoginOnly
      />
    </div>
  )
}
