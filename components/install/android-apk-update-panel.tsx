"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetchReleaseAndDownloadApkOnUserTap } from "@/lib/android-install/apk-download-on-tap"
import {
  fetchReleaseInfoOnUserTap,
  formatReleaseVersionLabel,
  isReleaseNewerThanInstalled,
  type AndroidReleaseInfo,
} from "@/lib/android-install/release-info"
import { readInstallState } from "@/lib/android-install/storage"

type AndroidApkUpdatePanelProps = {
  surface?: "dashboard" | "auth"
}

type PanelPhase = "idle" | "checking" | "up_to_date" | "update" | "failed"

/** User-initiated update panel — no mount fetch, blur, portal, or scroll lock. */
export function AndroidApkUpdatePanel({ surface = "dashboard" }: AndroidApkUpdatePanelProps) {
  const [phase, setPhase] = useState<PanelPhase>("idle")
  const [open, setOpen] = useState(false)
  const [latest, setLatest] = useState<AndroidReleaseInfo | null>(null)
  const [downloading, setDownloading] = useState(false)

  const installedVersion = readInstallState().installedVersion ?? null

  const handleCheck = async () => {
    setPhase("checking")
    setOpen(true)
    const release = await fetchReleaseInfoOnUserTap()
    if (!release?.published) {
      setPhase("failed")
      setLatest(null)
      return
    }
    setLatest(release)
    if (!isReleaseNewerThanInstalled(release, installedVersion)) {
      setPhase("up_to_date")
      return
    }
    setPhase("update")
  }

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    const result = await fetchReleaseAndDownloadApkOnUserTap(surface)
    setDownloading(false)
    if (result.status === "ok") {
      setLatest(result.release)
      setPhase("up_to_date")
    }
  }

  const close = () => {
    setOpen(false)
    setPhase("idle")
    setLatest(null)
  }

  if (!open && phase === "idle") {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-2 max-md:pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-9 w-full touch-manipulation sm:w-auto"
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
          <p className="text-sm font-semibold">Nexus Pro app update</p>

          {phase === "checking" ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking release info…
            </p>
          ) : null}

          {phase === "failed" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Could not load release info. Try again later.
            </p>
          ) : null}

          {phase === "up_to_date" && latest ? (
            <p className="mt-2 text-xs text-muted-foreground">
              You are on the latest release ({formatReleaseVersionLabel(latest)}).
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
                      Downloading…
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
        </div>
      </div>
    </div>
  )
}
