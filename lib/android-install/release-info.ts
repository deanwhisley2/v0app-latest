import { compareReleaseVersions } from "@/lib/android-install/config"
import {
  isBrowserOffline,
  parseReleaseInfoJson,
  readReleaseInfoSessionCache,
  validateApkAvailabilityOnUserTap,
  validateReleaseMetadataForDownload,
  writeReleaseInfoSessionCache,
} from "@/lib/android-install/release-validation"

/** Static release metadata served from /releases/android/release-info.json */
export type AndroidReleaseInfo = {
  version: string
  build: number
  published: boolean
  min_supported_android: number
  download_url: string
  static_download_url?: string
  size_mb: number
  sha256: string
  release_date: string
  notes: string[]
  app_name?: string
  package_id?: string
  release_channel?: string
  engine?: string
  render_mode?: string
}

export type AndroidChangelogFile = {
  entries: Array<{
    version: string
    build: number
    release_date: string
    highlights: string[]
  }>
}

export const ANDROID_RELEASE_INFO_PATH = "/releases/android/release-info.json"
export const ANDROID_CHANGELOG_PATH = "/releases/android/changelog.json"

export type ReleaseFetchResult =
  | { ok: true; release: AndroidReleaseInfo; fromCache: boolean }
  | { ok: false; reason: "offline" | "malformed" | "network" }

/** User-initiated only — short session cache, no mount/effect usage. */
export async function fetchReleaseInfoOnUserTap(): Promise<ReleaseFetchResult> {
  if (isBrowserOffline()) return { ok: false, reason: "offline" }

  const cached = readReleaseInfoSessionCache()
  if (cached) return { ok: true, release: cached, fromCache: true }

  try {
    const res = await fetch(ANDROID_RELEASE_INFO_PATH, { cache: "no-store" })
    if (!res.ok) return { ok: false, reason: "network" }
    const text = await res.text()
    const release = parseReleaseInfoJson(text)
    if (!release) return { ok: false, reason: "malformed" }
    writeReleaseInfoSessionCache(release)
    return { ok: true, release, fromCache: false }
  } catch {
    return { ok: false, reason: isBrowserOffline() ? "offline" : "network" }
  }
}

export function resolveReleaseDownloadUrl(release: AndroidReleaseInfo): string {
  const base = release.download_url || release.static_download_url || "/api/app/android-apk"
  if (base.startsWith("http")) return base
  if (typeof window === "undefined") return base
  return `${window.location.origin}${base.startsWith("/") ? base : `/${base}`}`
}

export function isReleaseNewerThanInstalled(
  release: AndroidReleaseInfo,
  installedVersion: string | null | undefined,
): boolean {
  if (!installedVersion) return true
  return compareReleaseVersions(release.version, installedVersion) > 0
}

export function formatReleaseVersionLabel(release: AndroidReleaseInfo): string {
  return `v${release.version} (build ${release.build})`
}

export function formatReleaseProductLine(release: AndroidReleaseInfo): string {
  const channel = release.release_channel ?? "stable"
  return `${channel.charAt(0).toUpperCase()}${channel.slice(1)} · ${formatReleaseVersionLabel(release)}`
}
