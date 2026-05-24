"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AndroidInstallGuidancePanel } from "@/components/install/android-install-guidance-panel"
import { fetchAndDownloadApkOnUserTap } from "@/lib/android-install/apk-download-on-tap"
import { cn } from "@/lib/utils"

type AndroidInstallStaticBannerProps = {
  variant?: "banner" | "card"
  className?: string
  surface?: "auth" | "dashboard"
}

type DownloadUiState = "idle" | "loading" | "ok" | "unavailable" | "failed"

/**
 * Phases 4–6 install rebuild — dismiss, user-tap APK fetch, inline guidance panel.
 * No mount effects, preload, detection hooks, portals, or install lifecycle managers.
 */
export function AndroidInstallStaticBanner({
  variant = "banner",
  className,
  surface = "auth",
}: AndroidInstallStaticBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [downloadState, setDownloadState] = useState<DownloadUiState>("idle")

  if (dismissed) return null

  const handleDownload = async () => {
    if (downloadState === "loading") return
    setDownloadState("loading")
    const result = await fetchAndDownloadApkOnUserTap(surface)
    setDownloadState(result === "ok" ? "ok" : result)
  }

  const statusMessage =
    downloadState === "ok"
      ? "Download started — check your notifications or Downloads folder."
      : downloadState === "unavailable"
        ? "APK is not published yet. Use Add to Home Screen below, or try again later."
        : downloadState === "failed"
          ? "Could not reach the release server. Check your connection and try again."
          : null

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
          Download the official Android package or add Nexus Pro to your home screen.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="min-h-9 touch-manipulation"
            disabled={downloadState === "loading"}
            onClick={() => void handleDownload()}
          >
            {downloadState === "loading" ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Preparing…
              </>
            ) : (
              "Download Nexus APK"
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9 touch-manipulation"
            onClick={() => setShowGuide((v) => !v)}
            aria-expanded={showGuide}
          >
            {showGuide ? "Hide install help" : "How to install"}
          </Button>
        </div>

        {statusMessage ? (
          <p
            className={cn(
              "mt-2 text-xs leading-relaxed",
              downloadState === "ok" ? "text-primary" : "text-muted-foreground",
            )}
          >
            {statusMessage}
          </p>
        ) : null}

        <AndroidInstallGuidancePanel open={showGuide} />
      </div>
    </div>
  )
}
