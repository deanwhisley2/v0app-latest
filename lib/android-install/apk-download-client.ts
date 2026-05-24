import type { AndroidReleaseManifest } from "@/lib/android-install/config"
import { ANDROID_APK_API_PATH } from "@/lib/android-install/config"

export type AndroidReleasePayload = AndroidReleaseManifest & {
  apkAvailable: boolean
  downloadUrl: string
}

export type ApkDownloadResult =
  | { ok: true; mode: "navigate" | "pwa_only" }
  | { ok: false; reason: "unavailable" | "rate_limited" | "preflight_failed"; statusCode?: number }

const SESSION_FAIL_KEY = "nexus_apk_download_fail_v1"
const RETRY_COOLDOWN_MS = 45_000
const MAX_RAPID_FAILURES = 3

type FailState = { count: number; lastAt: number }

function readFailState(): FailState {
  if (typeof window === "undefined") return { count: 0, lastAt: 0 }
  try {
    const raw = sessionStorage.getItem(SESSION_FAIL_KEY)
    if (!raw) return { count: 0, lastAt: 0 }
    return JSON.parse(raw) as FailState
  } catch {
    return { count: 0, lastAt: 0 }
  }
}

function writeFailState(state: FailState): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(SESSION_FAIL_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function clearApkDownloadFailures(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(SESSION_FAIL_KEY)
  } catch {
    /* ignore */
  }
}

export function isApkDownloadRateLimited(): boolean {
  const s = readFailState()
  if (s.count < MAX_RAPID_FAILURES) return false
  return Date.now() - s.lastAt < RETRY_COOLDOWN_MS
}

export function recordApkDownloadFailure(): void {
  const s = readFailState()
  writeFailState({ count: s.count + 1, lastAt: Date.now() })
}

export function resolveApkDownloadUrl(release: AndroidReleasePayload): string {
  const base = release.downloadUrl || release.apkUrl || ANDROID_APK_API_PATH
  if (base.startsWith("http")) return base
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}${base.startsWith("/") ? base : `/${base}`}`
}

export async function logInstallEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/app/android-install-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    /* non-blocking */
  }
}

/** Preflight APK availability — avoids broken download loops. */
export async function preflightApkDownload(url: string): Promise<{ ok: boolean; statusCode: number }> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" })
    return { ok: res.ok && res.headers.get("X-Nexus-Apk-Available") === "1", statusCode: res.status }
  } catch {
    return { ok: false, statusCode: 0 }
  }
}

/**
 * Trigger APK download via hidden iframe + DownloadManager-friendly URL.
 * Android Chrome/Samsung handle attachment responses without leaving the page.
 */
export function triggerApkBrowserDownload(url: string, version: string): void {
  const bust = `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}&t=${Date.now()}`
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none"
  iframe.src = bust
  document.body.appendChild(iframe)
  window.setTimeout(() => iframe.remove(), 120_000)
}

export async function startApkDownload(params: {
  release: AndroidReleasePayload
  surface: string
  browser: string | null
  skipPreflight?: boolean
}): Promise<ApkDownloadResult> {
  const { release, surface, browser, skipPreflight } = params

  if (!release.apkAvailable) {
    void logInstallEvent({ event: "apk_unavailable", surface, browser, version: release.version })
    return { ok: false, reason: "unavailable" }
  }

  if (isApkDownloadRateLimited()) {
    void logInstallEvent({ event: "apk_rate_limited", surface, browser, version: release.version })
    return { ok: false, reason: "rate_limited" }
  }

  const url = resolveApkDownloadUrl(release)

  if (!skipPreflight) {
    const pre = await preflightApkDownload(url)
    if (!pre.ok) {
      recordApkDownloadFailure()
      void logInstallEvent({
        event: "apk_preflight_failed",
        surface,
        browser,
        version: release.version,
        statusCode: pre.statusCode,
      })
      return { ok: false, reason: "preflight_failed", statusCode: pre.statusCode }
    }
  }

  clearApkDownloadFailures()
  triggerApkBrowserDownload(url, release.version)
  void logInstallEvent({ event: "apk_download_started", surface, browser, version: release.version })
  return { ok: true, mode: "navigate" }
}
