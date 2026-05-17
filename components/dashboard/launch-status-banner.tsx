"use client"

import { usePlatformLaunch } from "@/hooks/use-platform-launch"

/** Compact institutional launch strip — one line, no marketing blocks. */
export function LaunchStatusBanner() {
  const { launch, active, loading } = usePlatformLaunch()

  if (loading || !active || !launch?.programs.onboarding?.launch_banner) return null

  const days = launch.daysRemaining
  const label =
    days > 1
      ? `Uganda launch · ${days} days left`
      : days === 1
        ? "Uganda launch · final day"
        : "Uganda launch · active"

  return (
    <div
      className="border-b border-primary/20 bg-primary/5 px-3 py-2 text-center text-xs text-foreground sm:px-4"
      role="status"
    >
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground"> · Referrals and onboarding rewards are live.</span>
    </div>
  )
}
