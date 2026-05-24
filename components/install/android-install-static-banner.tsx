"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type AndroidInstallStaticBannerProps = {
  variant?: "banner" | "card"
  className?: string
}

/**
 * Phase 2 install rebuild — static markup + local dismiss state only.
 * No effects, fetch, detection, portals, timers, or navigation side effects.
 */
export function AndroidInstallStaticBanner({
  variant = "banner",
  className,
}: AndroidInstallStaticBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div
      role="region"
      aria-label="Install Nexus App"
      className={cn(
        "relative border border-border/70 bg-card text-foreground",
        variant === "banner"
          ? "mx-auto w-full max-w-lg rounded-xl px-4 py-3"
          : "rounded-2xl px-4 py-4",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted/60"
        aria-label="Dismiss install banner"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-6">
        <p className="text-sm font-semibold">Install Nexus App</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Official Android install options will appear here.
        </p>
      </div>
    </div>
  )
}
