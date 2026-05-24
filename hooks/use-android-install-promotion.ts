"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AndroidReleaseManifest } from "@/lib/android-install/config"
import { compareReleaseVersions } from "@/lib/android-install/config"
import {
  detectInstallSurface,
  isStandalonePwa,
  type AndroidBrowserKind,
} from "@/lib/android-install/device-detection"
import {
  isAuthInstallDismissed,
  isDashboardInstallReminderSnoozed,
  markAuthInstallDismissed,
  markInstalled,
  readInstallState,
  snoozeDashboardInstallReminder,
  writeInstallState,
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

export type AndroidInstallPromotion = {
  visible: boolean
  uiMode: AndroidInstallUiMode
  browser: AndroidBrowserKind | null
  release: AndroidReleaseManifest | null
  loadingRelease: boolean
  canNativePwaPrompt: boolean
  install: () => Promise<void>
  downloadApk: () => void
  openApp: () => void
  dismiss: (permanent?: boolean) => void
  statusMessage: string | null
}

type UseAndroidInstallPromotionOptions = {
  surface: "auth" | "dashboard"
  /** Dashboard: only show on fresh login landing */
  freshLoginOnly?: boolean
  freshLogin?: boolean
}

async function fetchRelease(): Promise<AndroidReleaseManifest | null> {
  try {
    const res = await fetch("/api/app/android-release", { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as AndroidReleaseManifest
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
  const [release, setRelease] = useState<AndroidReleaseManifest | null>(null)
  const [loadingRelease, setLoadingRelease] = useState(false)
  const [canNativePwaPrompt, setCanNativePwaPrompt] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installedFlag, setInstalledFlag] = useState(false)

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

  const uiMode: AndroidInstallUiMode = useMemo(() => {
    if (dismissed) return "hidden"
    if (!surfaceState?.eligible) {
      if (stored.installedVersion && !isStandalonePwa() && opts.surface === "dashboard") {
        if (release && compareReleaseVersions(release.version, stored.installedVersion) > 0) return "update"
        return "open"
      }
      return "hidden"
    }

    if (stored.installedVersion || installedFlag) {
      if (opts.surface === "auth") return "hidden"
      if (release && stored.installedVersion && compareReleaseVersions(release.version, stored.installedVersion) > 0) {
        return "update"
      }
      return "open"
    }

    if (opts.surface === "auth" && isAuthInstallDismissed()) return "hidden"
    if (opts.surface === "dashboard") {
      if (opts.freshLoginOnly && !opts.freshLogin) return "hidden"
      if (isDashboardInstallReminderSnoozed()) return "hidden"
    }

    if (release && stored.installedVersion) {
      if (compareReleaseVersions(release.version, stored.installedVersion) > 0) return "update"
    }

    if (surfaceState.needsManualInstructions) return "manual"
    return "install"
  }, [
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

  const install = useCallback(async () => {
    setStatusMessage(null)
    const deferred = deferredRef.current
    if (deferred) {
      try {
        await deferred.prompt()
        const choice = await deferred.userChoice
        if (choice.outcome === "accepted") {
          markInstalled("pwa", release?.version ?? "pwa")
          setInstalledFlag(true)
        }
        deferredRef.current = null
        setCanNativePwaPrompt(false)
        return
      } catch {
        /* fall through to APK */
      }
    }
    if (release?.apkUrl) {
      const a = document.createElement("a")
      a.href = release.apkUrl
      a.rel = "noopener"
      a.download = `nexus-pro-${release.version}.apk`
      document.body.appendChild(a)
      a.click()
      a.remove()
      markInstalled("apk", release.version)
      setStatusMessage("download")
    }
  }, [release])

  const downloadApk = useCallback(() => {
    if (!release?.apkUrl) return
    const a = document.createElement("a")
    a.href = release.apkUrl
    a.rel = "noopener"
    a.download = `nexus-pro-${release.version}.apk`
    document.body.appendChild(a)
    a.click()
    a.remove()
    markInstalled("apk", release.version)
    setStatusMessage("download")
  }, [release])

  const openApp = useCallback(() => {
    window.location.href = "/dashboard?source=open_app"
  }, [])

  const dismiss = useCallback(
    (permanent = false) => {
      if (opts.surface === "auth" || permanent) {
        markAuthInstallDismissed()
      } else {
        snoozeDashboardInstallReminder()
      }
      setDismissed(true)
    },
    [opts.surface],
  )

  return {
    visible,
    uiMode,
    browser: surfaceState?.eligible ? surfaceState.browser : null,
    release,
    loadingRelease,
    canNativePwaPrompt,
    install,
    downloadApk,
    openApp,
    dismiss,
    statusMessage,
  }
}
