"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { compareReleaseVersions } from "@/lib/android-install/config"
import {
  detectInstallSurface,
  isStandalonePwa,
  type AndroidBrowserKind,
} from "@/lib/android-install/device-detection"
import {
  startApkDownload,
  type AndroidReleasePayload,
} from "@/lib/android-install/apk-download-client"
import {
  isDashboardInstallReminderSnoozed,
  markInstalled,
  readInstallState,
  snoozeDashboardInstallReminder,
  writeInstallState,
  clearLegacyAuthInstallDismiss,
} from "@/lib/android-install/storage"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type AndroidInstallUiMode =
  | "hidden"
  | "install"
  | "update"
  | "open"
  | "manual"

export type InstallDownloadState =
  | "idle"
  | "checking"
  | "downloading"
  | "failed"
  | "unavailable"
  | "rate_limited"

export type AndroidInstallPromotion = {
  visible: boolean
  uiMode: AndroidInstallUiMode
  browser: AndroidBrowserKind | null
  release: AndroidReleasePayload | null
  loadingRelease: boolean
  canNativePwaPrompt: boolean
  apkAvailable: boolean
  downloadState: InstallDownloadState
  install: () => Promise<void>
  downloadApk: () => Promise<void>
  retryDownload: () => Promise<void>
  openApp: () => void
  useWebVersion: () => void
  dismiss: () => void
  statusKey: string | null
}

type UseAndroidInstallPromotionOptions = {
  surface: "auth" | "dashboard"
  freshLoginOnly?: boolean
  freshLogin?: boolean
}

async function fetchRelease(): Promise<AndroidReleasePayload | null> {
  try {
    const res = await fetch("/api/app/android-release", { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as AndroidReleasePayload
  } catch {
    return null
  }
}

export function useAndroidInstallPromotion(
  opts: UseAndroidInstallPromotionOptions,
): AndroidInstallPromotion {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [surfaceState, setSurfaceState] = useState(() =>
    typeof window === "undefined" ? null : detectInstallSurface(),
  )
  const [release, setRelease] = useState<AndroidReleasePayload | null>(null)
  const [loadingRelease, setLoadingRelease] = useState(false)
  const [canNativePwaPrompt, setCanNativePwaPrompt] = useState(false)
  const [downloadState, setDownloadState] = useState<InstallDownloadState>("idle")
  const [statusKey, setStatusKey] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installedFlag, setInstalledFlag] = useState(false)

  useEffect(() => {
    if (opts.surface === "auth") clearLegacyAuthInstallDismiss()
  }, [opts.surface])

  useEffect(() => {
    setSurfaceState(detectInstallSurface())
    if (isStandalonePwa()) setInstalledFlag(true)

    const onBip = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setCanNativePwaPrompt(true)
    }
    const onInstalled = () => {
      const ver = release?.version ?? readInstallState().installedVersion ?? "pwa"
      markInstalled("pwa", ver)
      setInstalledFlag(true)
      deferredRef.current = null
      setCanNativePwaPrompt(false)
      setDownloadState("idle")
      setStatusKey("install.installApp.installStarted")
    }

    window.addEventListener("beforeinstallprompt", onBip)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [release?.version])

  useEffect(() => {
    if (!surfaceState?.eligible) return
    let cancelled = false
    setLoadingRelease(true)
    void fetchRelease().then((r) => {
      if (cancelled) return
      setRelease(r)
      if (r) writeInstallState({ lastSeenReleaseVersion: r.version })
      setLoadingRelease(false)
    })
    return () => {
      cancelled = true
    }
  }, [surfaceState?.eligible])

  const stored = readInstallState()
  const apkAvailable = Boolean(release?.apkAvailable)

  const uiMode: AndroidInstallUiMode = useMemo(() => {
    if (dismissed) return "hidden"
    if (isStandalonePwa()) return "hidden"

    if (!surfaceState?.eligible) {
      if (stored.installedVersion && opts.surface === "dashboard") {
        if (release && compareReleaseVersions(release.version, stored.installedVersion) > 0) return "update"
        return "open"
      }
      return "hidden"
    }

    if (opts.surface === "auth") {
      if (release && stored.installedVersion && compareReleaseVersions(release.version, stored.installedVersion) > 0) {
        return "update"
      }
      if (surfaceState.needsManualInstructions && !apkAvailable && !canNativePwaPrompt) return "manual"
      return "install"
    }

    if (stored.installedVersion || installedFlag) {
      if (release && stored.installedVersion && compareReleaseVersions(release.version, stored.installedVersion) > 0) {
        return "update"
      }
      return "open"
    }

    if (opts.surface === "dashboard") {
      if (opts.freshLoginOnly && !opts.freshLogin) return "hidden"
      if (isDashboardInstallReminderSnoozed()) return "hidden"
    }

    if (surfaceState.needsManualInstructions && !apkAvailable && !canNativePwaPrompt) return "manual"
    return "install"
  }, [
    apkAvailable,
    canNativePwaPrompt,
    dismissed,
    installedFlag,
    opts.freshLogin,
    opts.freshLoginOnly,
    opts.surface,
    release,
    stored.installedVersion,
    surfaceState,
  ])

  const visible = uiMode !== "hidden"

  const runPwaPrompt = useCallback(async (): Promise<boolean> => {
    const deferred = deferredRef.current
    if (!deferred) return false
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === "accepted") {
        markInstalled("pwa", release?.version ?? "pwa")
        setInstalledFlag(true)
        setStatusKey("install.installApp.installStarted")
      }
      deferredRef.current = null
      setCanNativePwaPrompt(false)
      return choice.outcome === "accepted"
    } catch {
      return false
    }
  }, [release?.version])

  const runApkDownload = useCallback(
    async (skipPreflight = false) => {
      if (!release) return
      setDownloadState("checking")
      setStatusKey("install.installApp.verifying")
      const result = await startApkDownload({
        release,
        surface: opts.surface,
        browser: surfaceState?.eligible ? surfaceState.browser : null,
        skipPreflight,
      })
      if (result.ok) {
        setDownloadState("downloading")
        setStatusKey("install.installApp.downloadStarted")
        window.setTimeout(() => setStatusKey("install.installApp.downloadTapHint"), 2500)
        return
      }
      if (result.reason === "rate_limited") {
        setDownloadState("rate_limited")
        setStatusKey("install.installApp.downloadRateLimited")
        return
      }
      setDownloadState(result.reason === "unavailable" ? "unavailable" : "failed")
      setStatusKey(
        result.reason === "unavailable"
          ? "install.installApp.apkUnavailable"
          : "install.installApp.downloadFailed",
      )
    },
    [opts.surface, release, surfaceState],
  )

  const install = useCallback(async () => {
    setStatusKey(null)
    if (canNativePwaPrompt) {
      const ok = await runPwaPrompt()
      if (ok) return
    }
    if (release?.apkAvailable) {
      await runApkDownload(false)
      return
    }
    if (canNativePwaPrompt) {
      await runPwaPrompt()
      return
    }
    setDownloadState("unavailable")
    setStatusKey("install.installApp.apkUnavailable")
  }, [canNativePwaPrompt, release?.apkAvailable, runApkDownload, runPwaPrompt])

  const downloadApk = useCallback(async () => {
    await runApkDownload(false)
  }, [runApkDownload])

  const retryDownload = useCallback(async () => {
    setDownloadState("idle")
    setStatusKey(null)
    await runApkDownload(true)
  }, [runApkDownload])

  const openApp = useCallback(() => {
    window.location.href = "/dashboard?source=open_app"
  }, [])

  const useWebVersion = useCallback(() => {
    window.location.href = "/dashboard?source=web_fallback"
  }, [])

  const dismiss = useCallback(() => {
    if (opts.surface === "dashboard") snoozeDashboardInstallReminder()
    setDismissed(true)
  }, [opts.surface])

  return {
    visible,
    uiMode,
    browser: surfaceState?.eligible ? surfaceState.browser : null,
    release,
    loadingRelease,
    canNativePwaPrompt,
    apkAvailable,
    downloadState,
    install,
    downloadApk,
    retryDownload,
    openApp,
    useWebVersion,
    dismiss,
    statusKey,
  }
}
