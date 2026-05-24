import {
  fetchReleaseInfoOnUserTap,
  resolveReleaseDownloadUrl,
  type AndroidReleaseInfo,
} from "@/lib/android-install/release-info"
import {
  validateApkAvailabilityOnUserTap,
  validateReleaseMetadataForDownload,
} from "@/lib/android-install/release-validation"
import { logInstallEvent, triggerApkBrowserDownload } from "@/lib/android-install/apk-download-client"
import { writeInstallState } from "@/lib/android-install/storage"

export type ApkTapResult =
  | { status: "ok"; release: AndroidReleaseInfo }
  | { status: "unavailable" | "failed" | "offline" | "malformed" }

/**
 * User-initiated APK flow — release-info fetch, validation, then download only.
 * No mount-time work, retries, polling, or auth coupling.
 */
export async function fetchReleaseAndDownloadApkOnUserTap(
  surface: string,
): Promise<ApkTapResult> {
  const fetched = await fetchReleaseInfoOnUserTap()
  if (!fetched.ok) {
    return { status: fetched.reason === "offline" ? "offline" : fetched.reason === "malformed" ? "malformed" : "failed" }
  }

  const release = fetched.release
  if (!validateReleaseMetadataForDownload(release)) {
    void logInstallEvent({
      event: "apk_unavailable",
      surface,
      browser: null,
      version: release.version,
      detail: "metadata_invalid",
    })
    return { status: "unavailable" }
  }

  const availability = await validateApkAvailabilityOnUserTap()
  if (!availability.ok) {
    void logInstallEvent({
      event: "apk_unavailable",
      surface,
      browser: null,
      version: release.version,
      detail: availability.reason ?? "file_missing",
    })
    return { status: "unavailable" }
  }

  if (
    availability.sha256 &&
    release.sha256.trim().toLowerCase() !== availability.sha256.trim().toLowerCase()
  ) {
    void logInstallEvent({
      event: "apk_unavailable",
      surface,
      browser: null,
      version: release.version,
      detail: "checksum_mismatch",
    })
    return { status: "unavailable" }
  }

  try {
    const url = resolveReleaseDownloadUrl(release)
    triggerApkBrowserDownload(url, release.version)
    writeInstallState({
      lastSeenReleaseVersion: release.version,
      installedVersion: release.version,
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

/** Load release metadata for display — user-initiated only. */
export async function fetchReleaseInfoForDisplayOnUserTap(): Promise<
  | { ok: true; release: AndroidReleaseInfo }
  | { ok: false; reason: "offline" | "malformed" | "network" }
> {
  return fetchReleaseInfoOnUserTap()
}
