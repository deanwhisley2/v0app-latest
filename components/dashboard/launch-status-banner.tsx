"use client"

import { usePlatformLaunch } from "@/hooks/use-platform-launch"

/** Compact institutional referral strip — no “newly launched” marketing. */
export function LaunchStatusBanner() {
  const { launch, active, loading } = usePlatformLaunch()

  if (loading || !active || !launch?.programs.onboarding?.launch_banner) return null

  const days = launch.daysRemaining
  const timing =
    days > 1
      ? `${days} days left in this cycle`
      : days === 1
        ? "Final day of this cycle"
        : "Current promotional cycle"

  const label = `Global referral rewards event · ${timing} · 20% first deposit + $0.53 referral`

  return (
    <div
      className="border-b border-border bg-muted px-3 py-2 text-center text-xs text-foreground max-md:bg-muted sm:border-primary/20 sm:bg-primary/5 sm:px-4"
      role="status"
    >
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground"> · Referral rewards currently active.</span>
    </div>
  )
}
