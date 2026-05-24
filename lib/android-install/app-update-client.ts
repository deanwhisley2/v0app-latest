import type { AndroidReleasePayload } from "@/lib/android-install/apk-download-client"
import { compareReleaseVersions } from "@/lib/android-install/config"
import { readInstallState } from "@/lib/android-install/storage"

export type AppVersionCheck = {
  version: string
  versionCode: number
  minSupportedVersion: string
  apkAvailable: boolean
  updateAvailable: boolean
  forceUpdate: boolean
  downloadUrl: string
  sha256: string | null
  sizeBytes: number
  stagedRolloutPercent: number
  updateWifiOnlyDefault: boolean
  pwaAssetVersion: string
}

export const UPDATE_WIFI_ONLY_KEY = "nexus_apk_update_wifi_only_v1"
export const UPDATE_DEFER_KEY = "nexus_apk_update_defer_v1"
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function readUpdateWifiOnlyPreference(defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue
  try {
    const raw = localStorage.getItem(UPDATE_WIFI_ONLY_KEY)
    if (raw === "0") return false
    if (raw === "1") return true
  } catch {
    /* ignore */
  }
  return defaultValue
}

export function isOnWifiConnection(): boolean {
  if (typeof navigator === "undefined") return true
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string } }).connection
  if (!conn) return true
  if (conn.type === "wifi" || conn.type === "ethernet") return true
  return conn.effectiveType === "wifi"
}

export function isInStagedRollout(stagedRolloutPercent: number): boolean {
  if (stagedRolloutPercent >= 100) return true
  if (typeof window === "undefined") return true
  try {
    let id = localStorage.getItem("nexus_device_rollout_id")
    if (!id) {
      id = String(Math.floor(Math.random() * 10000))
      localStorage.setItem("nexus_device_rollout_id", id)
    }
    return Number(id) % 100 < stagedRolloutPercent
  } catch {
    return true
  }
}

export async function fetchAppVersionCheck(installedVersion?: string | null): Promise<AppVersionCheck | null> {
  try {
    const q = installedVersion ? `?installed=${encodeURIComponent(installedVersion)}` : ""
    const res = await fetch(`/api/app/android-release/version${q}`, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as AppVersionCheck
  } catch {
    return null
  }
}

export function shouldPromptForUpdate(check: AppVersionCheck): boolean {
  if (!check.updateAvailable || !check.apkAvailable) return false
  if (!isInStagedRollout(check.stagedRolloutPercent)) return false
  const installed = readInstallState().installedVersion
  if (!installed) return false
  if (compareReleaseVersions(check.version, installed) <= 0) return false
  if (typeof window !== "undefined") {
    try {
      const defer = localStorage.getItem(UPDATE_DEFER_KEY)
      if (defer && Date.now() < Number(defer)) return false
    } catch {
      /* ignore */
    }
  }
  return true
}

export function deferUpdatePrompt(hours = 24): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(UPDATE_DEFER_KEY, String(Date.now() + hours * 3600_000))
  } catch {
    /* ignore */
  }
}

export function openDownloadsQuickAction(): void {
  if (typeof window === "undefined") return
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("samsungbrowser")) {
    window.open("samsungapps://com.sec.android.app.myfiles", "_blank")
    return
  }
  if (ua.includes("android")) {
    try {
      const iframe = document.createElement("iframe")
      iframe.style.display = "none"
      iframe.src = "intent://downloads/#Intent;scheme=content;action=android.intent.action.VIEW;end"
      document.body.appendChild(iframe)
      window.setTimeout(() => iframe.remove(), 3000)
    } catch {
      /* UI fallback */
    }
  }
}

export type ReleaseWithUpdate = AndroidReleasePayload & AppVersionCheck
