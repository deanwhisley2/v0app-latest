"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AndroidInstallApkHelpPanel } from "@/components/install/android-install-apk-help-panel"
import { AndroidInstallGuidancePanel } from "@/components/install/android-install-guidance-panel"
import { AndroidInstallPostDownloadHelper } from "@/components/install/android-install-post-download-helper"
import {
  fetchReleaseAndDownloadApkOnUserTap,
  fetchReleaseInfoForDisplayOnUserTap,
} from "@/lib/android-install/apk-download-on-tap"
import {
  formatReleaseProductLine,
  formatReleaseVersionLabel,
  type AndroidReleaseInfo,
} from "@/lib/android-install/release-info"
import { cn } from "@/lib/utils"

type AndroidInstallStaticBannerProps = {
  variant?: "banner" | "card"
  className?: string
  surface?: "auth" | "dashboard"
}

type DownloadUiState = "idle" | "loading" | "ok" | "unavailable" | "failed" | "offline" | "malformed"

function mapReleaseFetchReason(
  reason: "offline" | "malformed" | "network",
): Exclude<DownloadUiState, "idle" | "loading" | "ok" | "unavailable"> {
  if (reason === "offline") return "offline"
  if (reason === "malformed") return "malformed"
  return "failed"
}

const APK_UNAVAILABLE_MSG = "APK temporarily unavailable."

/**
 * Safe install card — user-tap release fetch + validation only, inline panels.
 */
export function AndroidInstallStaticBanner({
  variant = "banner",
  className,
  surface = "auth",
}: AndroidInstallStaticBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showApkHelp, setShowApkHelp] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [releaseInfo, setReleaseInfo] = useState<AndroidReleaseInfo | null>(null)
  const [downloadState, setDownloadState] = useState<DownloadUiState>("idle")

  if (dismissed) return null

  const handleDownload = async () => {
    if (downloadState === "loading") return
    setDownloadState("loading")
    const result = await fetchReleaseAndDownloadApkOnUserTap(surface)
    if (result.status === "ok") {
      setReleaseInfo(result.release)
      setDownloadState("ok")
      return
    }
    setDownloadState(result.status)
  }

  const handleViewVersion = async () => {
    if (downloadState === "loading") return
    setDownloadState("loading")
    const result = await fetchReleaseInfoForDisplayOnUserTap()
    setDownloadState("idle")
    if (result.ok) {
      setReleaseInfo(result.release)
      setShowNotes(true)
      return
    }
    setDownloadState(mapReleaseFetchReason(result.reason))
  }

  const statusMessage =
    downloadState === "ok"
      ? null
      : downloadState === "unavailable"
        ? APK_UNAVAILABLE_MSG
        : downloadState === "offline"
          ? "You appear to be offline. Connect and try again."
          : downloadState === "malformed"
            ? "Release info could not be read. Try again later."
            : downloadState === "failed"
              ? "Could not reach the release server. Check your connection."
              : null

  const title = releaseInfo?.app_name ?? "Install Nexus App"

  return (
    <div
      role="region"
      aria-label={title}
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
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Download the official Android package or add Nexus Pro to your home screen.
        </p>

        {releaseInfo ? (
          <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            <p>{formatReleaseProductLine(releaseInfo)}</p>
            {releaseInfo.package_id ? <p className="text-[10px] opacity-80">{releaseInfo.package_id}</p> : null}
            {releaseInfo.size_mb > 0 ? (
              <p>{formatReleaseVersionLabel(releaseInfo)} · {releaseInfo.size_mb} MB</p>
            ) : null}
          </div>
        ) : null}

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
                Validating…
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
            disabled={downloadState === "loading"}
            onClick={() => void handleViewVersion()}
          >
            Version info
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9 touch-manipulation"
            onClick={() => setShowApkHelp((v) => !v)}
            aria-expanded={showApkHelp}
          >
            {showApkHelp ? "Hide APK help" : "How to install APK"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9 touch-manipulation"
            onClick={() => setShowGuide((v) => !v)}
            aria-expanded={showGuide}
          >
            {showGuide ? "Hide home screen" : "Add to home screen"}
          </Button>
        </div>

        {releaseInfo && releaseInfo.notes.length > 0 ? (
          <div className="mt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-medium text-primary"
              onClick={() => setShowNotes((v) => !v)}
              aria-expanded={showNotes}
            >
              Release notes
              {showNotes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showNotes ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                {releaseInfo.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {statusMessage ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{statusMessage}</p>
        ) : null}

        <AndroidInstallPostDownloadHelper open={downloadState === "ok"} />
        <AndroidInstallApkHelpPanel open={showApkHelp} />
        <AndroidInstallGuidancePanel open={showGuide} />
      </div>
    </div>
  )
}
