import { cn } from "@/lib/utils"

type AndroidInstallStaticBannerProps = {
  variant?: "banner" | "card"
  className?: string
}

/**
 * Phase 1 install rebuild — static markup only.
 * No hooks, effects, fetch, detection, portals, or navigation side effects.
 */
export function AndroidInstallStaticBanner({
  variant = "banner",
  className,
}: AndroidInstallStaticBannerProps) {
  return (
    <div
      role="region"
      aria-label="Install Nexus App"
      className={cn(
        "border border-border/70 bg-card text-foreground",
        variant === "banner"
          ? "mx-auto w-full max-w-lg rounded-xl px-4 py-3"
          : "rounded-2xl px-4 py-4",
        className,
      )}
    >
      <p className="text-sm font-semibold">Install Nexus App</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Official Android install options will appear here.
      </p>
    </div>
  )
}
