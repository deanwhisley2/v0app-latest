import {
  fetchReleaseInfoOnUserTap,
  resolveReleaseDownloadUrl,
  type AndroidReleaseInfo,
} from "@/lib/android-install/release-info"
import { logInstallEvent, triggerApkBrowserDownload } from "@/lib/android-install/apk-download-client"
import { writeInstallState } from "@/lib/android-install/storage"

export type ApkTapResult =
  | { status: "ok"; release: AndroidReleaseInfo }
  | { status: "unavailable" | "failed" }

/**
 * User-initiated APK flow — fetch static release-info.json on tap, then download.
 * No mount-time work, API polling, or auth coupling.
 */
export async function fetchReleaseAndDownloadApkOnUserTap(
  surface: string,
): Promise<ApkTapResult> {
  try {
    const release = await fetchReleaseInfoOnUserTap()
    if (!release?.published) {
      void logInstallEvent({
        event: "apk_unavailable",
        surface,
        browser: null,
        version: release?.version ?? null,
      })
      return { status: "unavailable" }
    }

    const url = resolveReleaseDownloadUrl(release)
    triggerApkBrowserDownload(url, release.version)
    writeInstallState({
      lastSeenReleaseVersion: release.version,
      installMode: "apk",
    })
    void logInstallEvent({
      event: "apk_download_started",
      surface,
      browser: null,
      version: release.version,
    })
    return { status: "ok", release }
  } catch {
    return { status: "failed" }
  }
}

/** Load release metadata only (no download) — user-initiated. */
export async function fetchReleaseInfoForDisplayOnUserTap(): Promise<AndroidReleaseInfo | null> {
  return fetchReleaseInfoOnUserTap()
}
