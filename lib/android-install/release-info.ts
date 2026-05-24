import { compareReleaseVersions } from "@/lib/android-install/config"

/** Static release metadata served from /releases/android/release-info.json */
export type AndroidReleaseInfo = {
  version: string
  build: number
  published: boolean
  min_supported_android: number
  download_url: string
  static_download_url?: string
  size_mb: number
  release_date: string
  notes: string[]
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

/** User-initiated only — never call on mount or in effects. */
export async function fetchReleaseInfoOnUserTap(): Promise<AndroidReleaseInfo | null> {
  try {
    const res = await fetch(ANDROID_RELEASE_INFO_PATH, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as AndroidReleaseInfo
  } catch {
    return null
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
