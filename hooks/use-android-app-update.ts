"use client"

import { useCallback, useEffect, useState } from "react"
import {
  deferUpdatePrompt,
  fetchAppVersionCheck,
  isOnWifiConnection,
  openDownloadsQuickAction,
  readUpdateWifiOnlyPreference,
  shouldPromptForUpdate,
  UPDATE_CHECK_INTERVAL_MS,
  type AppVersionCheck,
} from "@/lib/android-install/app-update-client"
import { startApkDownload, type AndroidReleasePayload } from "@/lib/android-install/apk-download-client"
import { readInstallState, markInstalled } from "@/lib/android-install/storage"
import { detectInstallSurface, isStandalonePwa } from "@/lib/android-install/device-detection"
import { isPwaInstallEnabled } from "@/lib/mobile/pwa-safe-mode"

export type AppUpdateState = {
  visible: boolean
  forceUpdate: boolean
  check: AppVersionCheck | null
  downloading: boolean
  downloadReady: boolean
  applyUpdate: () => Promise<void>
  defer: () => void
}

export function useAndroidAppUpdate(): AppUpdateState {
  const installEnabled = isPwaInstallEnabled()
  const [check, setCheck] = useState<AppVersionCheck | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadReady, setDownloadReady] = useState(false)

  const runCheck = useCallback(async () => {
    const surface = detectInstallSurface()
    if (!surface.eligible && !isStandalonePwa()) return
    const installed = readInstallState().installedVersion ?? null
    if (!installed) return
    const result = await fetchAppVersionCheck(installed)
    if (!result) return
    setCheck(result)
  }, [])

  useEffect(() => {
    if (!installEnabled) return
    void runCheck()
    const id = window.setInterval(() => void runCheck(), UPDATE_CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [runCheck, installEnabled])

  const applyUpdate = useCallback(async () => {
    if (!check?.apkAvailable) return
    const wifiOnly = readUpdateWifiOnlyPreference(check.updateWifiOnlyDefault)
    if (wifiOnly && !isOnWifiConnection()) return

    setDownloading(true)
    const release: AndroidReleasePayload = {
      version: check.version,
      versionCode: check.versionCode,
      apkUrl: check.downloadUrl,
      sha256: check.sha256 ?? "",
      sizeBytes: check.sizeBytes,
      publishedAt: new Date().toISOString(),
      minSupportedVersion: check.minSupportedVersion,
      pwaAssetVersion: check.pwaAssetVersion,
      apkAvailable: true,
      downloadUrl: check.downloadUrl,
    }
    const surface = detectInstallSurface()
    const result = await startApkDownload({
      release,
      surface: "dashboard",
      browser: surface.eligible ? surface.browser : null,
    })
    setDownloading(false)
    if (result.ok) {
      setDownloadReady(true)
      markInstalled("apk", check.version)
      openDownloadsQuickAction()
    }
  }, [check])

  const defer = useCallback(() => {
    deferUpdatePrompt(24)
    setCheck(null)
  }, [])

  const visible = !installEnabled
    ? false
    : check
      ? shouldPromptForUpdate(check) || Boolean(check.forceUpdate && check.updateAvailable)
      : false

  return {
    visible,
    forceUpdate: Boolean(check?.forceUpdate && check.updateAvailable),
    check,
    downloading,
    downloadReady,
    applyUpdate,
    defer,
  }
}
