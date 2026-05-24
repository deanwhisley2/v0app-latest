"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AndroidInstallPostDownloadHelper } from "@/components/install/android-install-post-download-helper"
import { fetchReleaseAndDownloadApkOnUserTap } from "@/lib/android-install/apk-download-on-tap"
import {
  fetchReleaseInfoOnUserTap,
  formatReleaseProductLine,
  formatReleaseVersionLabel,
  isReleaseNewerThanInstalled,
  type AndroidReleaseInfo,
} from "@/lib/android-install/release-info"
import { validateReleaseMetadataForDownload } from "@/lib/android-install/release-validation"
import { readInstallState } from "@/lib/android-install/storage"

type AndroidApkUpdatePanelProps = {
  surface?: "dashboard" | "auth"
}

type PanelPhase =
  | "idle"
  | "checking"
  | "up_to_date"
  | "update"
  | "failed"
  | "unavailable"
  | "offline"
  | "downloaded"

const APK_UNAVAILABLE_MSG = "APK temporarily unavailable."

/** User-initiated update panel — session cache, no mount fetch or polling. */
export function AndroidApkUpdatePanel({ surface = "dashboard" }: AndroidApkUpdatePanelProps) {
  const [phase, setPhase] = useState<PanelPhase>("idle")
  const [open, setOpen] = useState(false)
  const [latest, setLatest] = useState<AndroidReleaseInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showPostDownload, setShowPostDownload] = useState(false)

  const installedVersion = readInstallState().installedVersion ?? null

  const handleCheck = async () => {
    if (checking) return
    setChecking(true)
    setShowPostDownload(false)
    setPhase("checking")
    setOpen(true)

    const fetched = await fetchReleaseInfoOnUserTap()
    setChecking(false)

    if (!fetched.ok) {
      setLatest(null)
      setPhase(fetched.reason === "offline" ? "offline" : "failed")
      return
    }

    const release = fetched.release
    setLatest(release)

    if (!validateReleaseMetadataForDownload(release)) {
      setPhase("unavailable")
      return
    }

    if (!isReleaseNewerThanInstalled(release, installedVersion)) {
      setPhase("up_to_date")
      return
    }

    setPhase("update")
  }

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    setShowPostDownload(false)
    const result = await fetchReleaseAndDownloadApkOnUserTap(surface)
    setDownloading(false)
    if (result.status === "ok") {
      setLatest(result.release)
      setPhase("downloaded")
      setShowPostDownload(true)
      return
    }
    if (result.status === "unavailable") setPhase("unavailable")
    else if (result.status === "offline") setPhase("offline")
    else setPhase("failed")
  }

  const close = () => {
    setOpen(false)
    setPhase("idle")
    setLatest(null)
    setChecking(false)
    setDownloading(false)
    setShowPostDownload(false)
  }

  if (!open && phase === "idle") {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-2 max-md:pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-9 w-full touch-manipulation sm:w-auto"
          disabled={checking}
          onClick={() => void handleCheck()}
        >
          Check for app update
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-2 max-md:pt-1">
      <div
        role="dialog"
        aria-label="App update"
        className="relative rounded-xl border border-border/70 bg-card px-4 py-3 text-foreground"
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted/60"
          aria-label="Close update panel"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pr-6">
          <p className="text-sm font-semibold">{latest?.app_name ?? "Nexus Pro"} app update</p>

          {phase === "checking" ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking release info…
            </p>
          ) : null}

          {phase === "offline" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              You appear to be offline. Connect and try again.
            </p>
          ) : null}

          {phase === "failed" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Release info could not be loaded. Try again later.
            </p>
          ) : null}

          {phase === "unavailable" ? (
            <p className="mt-2 text-xs text-muted-foreground">{APK_UNAVAILABLE_MSG}</p>
          ) : null}

          {phase === "up_to_date" && latest ? (
            <p className="mt-2 text-xs text-muted-foreground">
              You are on the latest release ({formatReleaseProductLine(latest)}).
            </p>
          ) : null}

          {phase === "downloaded" && latest ? (
            <p className="mt-2 text-xs text-primary">
              Update download started ({formatReleaseVersionLabel(latest)}).
            </p>
          ) : null}

          {phase === "update" && latest ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Current: {installedVersion ? `v${installedVersion}` : "Not recorded"}
              </p>
              <p className="text-xs text-muted-foreground">
                Latest: {formatReleaseVersionLabel(latest)}
              </p>
              <p className="text-[10px] text-muted-foreground/80">{formatReleaseProductLine(latest)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9 touch-manipulation"
                  disabled={downloading}
                  onClick={() => void handleDownload()}
                >
                  {downloading ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Validating…
                    </>
                  ) : (
                    "Download update"
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-9 touch-manipulation text-muted-foreground"
                  onClick={close}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : null}

          <AndroidInstallPostDownloadHelper open={showPostDownload} />
        </div>
      </div>
    </div>
  )
}
