import type { AndroidReleaseInfo } from "@/lib/android-install/release-info"

const SESSION_CACHE_KEY = "nexus_release_info_session_v1"
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000

type CachedRelease = { at: number; release: AndroidReleaseInfo }

function readSessionCache(): AndroidReleaseInfo | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const row = JSON.parse(raw) as CachedRelease
    if (!row?.release || Date.now() - row.at > SESSION_CACHE_TTL_MS) {
      sessionStorage.removeItem(SESSION_CACHE_KEY)
      return null
    }
    return row.release
  } catch {
    return null
  }
}

export function writeReleaseInfoSessionCache(release: AndroidReleaseInfo): void {
  if (typeof window === "undefined") return
  try {
    const payload: CachedRelease = { at: Date.now(), release }
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function clearReleaseInfoSessionCache(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

/** Strict validation before APK download — user-tap path only. */
export function validateReleaseMetadataForDownload(release: AndroidReleaseInfo): boolean {
  if (!release.published) return false
  if (!release.version?.trim()) return false
  if (!Number.isFinite(release.build) || release.build <= 0) return false
  if (!release.sha256?.trim() || release.sha256.trim().length < 32) return false
  if (!Number.isFinite(release.size_mb) || release.size_mb <= 0) return false
  if (!release.download_url?.trim()) return false
  return true
}

export function parseReleaseInfoJson(text: string): AndroidReleaseInfo | null {
  try {
    const data = JSON.parse(text) as unknown
    if (!data || typeof data !== "object") return null
    const row = data as Partial<AndroidReleaseInfo>
    if (typeof row.version !== "string" || typeof row.build !== "number") return null
    if (typeof row.published !== "boolean") return null
    if (!Array.isArray(row.notes)) return null
    return row as AndroidReleaseInfo
  } catch {
    return null
  }
}

export type ApkAvailabilityProbe = {
  ok: boolean
  sizeBytes?: number
  sha256?: string
  reason?: string
}

/** Server file + checksum probe — user tap only. */
export async function validateApkAvailabilityOnUserTap(): Promise<ApkAvailabilityProbe> {
  try {
    const res = await fetch("/api/app/android-apk/validate", { cache: "no-store" })
    if (!res.ok) {
      let reason = "missing_file"
      try {
        const body = (await res.json()) as { reason?: string }
        if (body.reason) reason = body.reason
      } catch {
        /* ignore */
      }
      return { ok: false, reason }
    }
    const body = (await res.json()) as {
      ok?: boolean
      sizeBytes?: number
      sha256?: string
    }
    if (!body.ok || !body.sizeBytes || body.sizeBytes <= 0 || !body.sha256?.trim()) {
      return { ok: false, reason: "missing_file" }
    }
    return { ok: true, sizeBytes: body.sizeBytes, sha256: body.sha256.trim() }
  } catch {
    return { ok: false, reason: "network" }
  }
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

export { readSessionCache as readReleaseInfoSessionCache }
