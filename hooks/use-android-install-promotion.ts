"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import { triggerNativePwaInstall } from "@/lib/android-install/pwa-install-controller"
import { usePwaInstallCapability } from "@/hooks/use-pwa-install-capability"
import {
  isDashboardInstallReminderSnoozed,
  markInstalled,
  readInstallState,
  snoozeDashboardInstallReminder,
  writeInstallState,
  clearLegacyAuthInstallDismiss,
} from "@/lib/android-install/storage"
import { isPwaInstallEnabled } from "@/lib/mobile/pwa-safe-mode"

const HIDDEN_PROMOTION: AndroidInstallPromotion = {
  visible: false,
  uiMode: "hidden",
  browser: null,
  release: null,
  loadingRelease: false,
  canNativePwaPrompt: false,
  primaryInstallKind: "manual",
  installButtonEnabled: false,
  probingInstall: false,
  apkAvailable: false,
  downloadState: "idle",
  install: async () => undefined,
  downloadApk: async () => undefined,
  retryDownload: async () => undefined,
  openApp: () => undefined,
  useWebVersion: () => undefined,
  dismiss: () => undefined,
  statusKey: null,
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

export type PrimaryInstallKind = "pwa" | "apk" | "manual"

export type AndroidInstallPromotion = {
  visible: boolean
  uiMode: AndroidInstallUiMode
  browser: AndroidBrowserKind | null
  release: AndroidReleasePayload | null
  loadingRelease: boolean
  canNativePwaPrompt: boolean
  primaryInstallKind: PrimaryInstallKind
  installButtonEnabled: boolean
  probingInstall: boolean
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
  const { canNativeInstall, probeSettled } = usePwaInstallCapability()
  const [surfaceState, setSurfaceState] = useState(() =>
    typeof window === "undefined" ? null : detectInstallSurface(),
  )
  const [release, setRelease] = useState<AndroidReleasePayload | null>(null)
  const [loadingRelease, setLoadingRelease] = useState(false)
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

    const onInstalled = () => {
      const ver = release?.version ?? readInstallState().installedVersion ?? "pwa"
      markInstalled("pwa", ver)
      setInstalledFlag(true)
      setDownloadState("idle")
      setStatusKey("install.installApp.installStarted")
    }

    window.addEventListener("appinstalled", onInstalled)
    return () => window.removeEventListener("appinstalled", onInstalled)
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
  const canNativePwaPrompt = canNativeInstall

  const primaryInstallKind: PrimaryInstallKind = useMemo(() => {
    if (canNativePwaPrompt) return "pwa"
    if (apkAvailable) return "apk"
    return "manual"
  }, [canNativePwaPrompt, apkAvailable])

  const probingInstall =
    !probeSettled && primaryInstallKind === "manual" && surfaceState?.eligible === true

  const installButtonEnabled =
    !probingInstall &&
    (primaryInstallKind === "pwa" || primaryInstallKind === "apk")

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
      if (primaryInstallKind === "manual" && probeSettled) return "manual"
      if (primaryInstallKind === "manual" && !probeSettled) return "install"
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

    if (primaryInstallKind === "manual" && probeSettled) return "manual"
    return "install"
  }, [
    dismissed,
    installedFlag,
    opts.freshLogin,
    opts.freshLoginOnly,
    opts.surface,
    primaryInstallKind,
    probeSettled,
    release,
    stored.installedVersion,
    surfaceState,
  ])

  const visible = uiMode !== "hidden"

  const runPwaPrompt = useCallback(async (): Promise<boolean> => {
    if (!canNativePwaPrompt) return false
    const outcome = await triggerNativePwaInstall({
      surface: opts.surface,
      browser: surfaceState?.eligible ? surfaceState.browser : null,
      version: release?.version ?? null,
    })
    if (outcome === "accepted") {
      markInstalled("pwa", release?.version ?? "pwa")
      setInstalledFlag(true)
      setStatusKey("install.installApp.installStarted")
      return true
    }
    if (outcome === "dismissed") {
      setStatusKey("install.installApp.installDismissed")
      return false
    }
    return false
  }, [canNativePwaPrompt, opts.surface, release?.version, surfaceState])

  const runApkDownload = useCallback(
    async (skipPreflight = false) => {
      if (!release?.apkAvailable) return
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
    setDownloadState("idle")

    if (primaryInstallKind === "pwa") {
      await runPwaPrompt()
      return
    }

    if (primaryInstallKind === "apk") {
      await runApkDownload(false)
      return
    }

    /* manual-only — no-op; UI shows steps, never error */
  }, [primaryInstallKind, runApkDownload, runPwaPrompt])

  const downloadApk = useCallback(async () => {
    if (!apkAvailable) return
    await runApkDownload(false)
  }, [apkAvailable, runApkDownload])

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

  if (!isPwaInstallEnabled()) return HIDDEN_PROMOTION

  return {
    visible,
    uiMode,
    browser: surfaceState?.eligible ? surfaceState.browser : null,
    release,
    loadingRelease,
    canNativePwaPrompt,
    primaryInstallKind,
    installButtonEnabled,
    probingInstall,
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
