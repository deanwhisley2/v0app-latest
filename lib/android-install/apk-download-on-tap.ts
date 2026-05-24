import type { AndroidReleasePayload } from "@/lib/android-install/apk-download-client"
import {
  logInstallEvent,
  resolveApkDownloadUrl,
  triggerApkBrowserDownload,
} from "@/lib/android-install/apk-download-client"

export type ApkDownloadOnTapResult = "ok" | "unavailable" | "failed"

/**
 * User-initiated APK flow only — call from an explicit button click handler.
 * One JSON request to release metadata, then browser download. No mount-time work.
 */
export async function fetchAndDownloadApkOnUserTap(
  surface: string,
): Promise<ApkDownloadOnTapResult> {
  try {
    const res = await fetch("/api/app/android-release", { cache: "no-store" })
    if (!res.ok) return "failed"

    const release = (await res.json()) as AndroidReleasePayload
    if (!release.apkAvailable) {
      void logInstallEvent({
        event: "apk_unavailable",
        surface,
        browser: null,
        version: release.version ?? null,
      })
      return "unavailable"
    }

    const url = resolveApkDownloadUrl(release)
    triggerApkBrowserDownload(url, release.version)
    void logInstallEvent({
      event: "apk_download_started",
      surface,
      browser: null,
      version: release.version,
    })
    return "ok"
  } catch {
    return "failed"
  }
}
