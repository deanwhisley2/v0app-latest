import { SITE_BRAND } from "@/lib/site-branding"

/** Canonical Android release metadata — keep in sync with public/android-release.json. */
export type AndroidReleaseManifest = {
  version: string
  versionCode: number
  apkUrl: string
  sha256: string
  sizeBytes: number
  publishedAt: string
  minSupportedVersion: string
  pwaAssetVersion: string
}

export const ANDROID_INSTALL_STORAGE_KEY = "nexus_android_install_v1"
export const ANDROID_INSTALL_AUTH_DISMISS_KEY = "nexus_android_install_auth_dismiss_v1"
export const ANDROID_INSTALL_REMIND_SNOOZE_KEY = "nexus_android_install_remind_snooze_v1"

/** Days before a snoozed dashboard reminder may reappear (auth dismiss is permanent). */
export const ANDROID_INSTALL_REMIND_SNOOZE_DAYS = 7

/** Canonical APK download route (correct MIME + Content-Disposition). */
export const ANDROID_APK_API_PATH = "/api/app/android-apk"

export function getDefaultAndroidRelease(): AndroidReleaseManifest {
  const version = process.env.NEXT_PUBLIC_ANDROID_APK_VERSION ?? "20260524"
  const versionCode = Number(process.env.NEXT_PUBLIC_ANDROID_APK_VERSION_CODE ?? "20260524")
  return {
    version,
    versionCode: Number.isFinite(versionCode) ? versionCode : 20260524,
    apkUrl: process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? "/api/app/android-apk",
    sha256: process.env.ANDROID_APK_SHA256 ?? "",
    sizeBytes: Number(process.env.ANDROID_APK_SIZE_BYTES ?? "0"),
    publishedAt: process.env.ANDROID_APK_PUBLISHED_AT ?? "2026-05-24T00:00:00.000Z",
    minSupportedVersion: process.env.NEXT_PUBLIC_ANDROID_APK_MIN_VERSION ?? version,
    pwaAssetVersion: SITE_BRAND.assetVersion,
  }
}

export function compareReleaseVersions(a: string, b: string): number {
  const pa = a.replace(/\D/g, "")
  const pb = b.replace(/\D/g, "")
  if (pa === pb) return 0
  const na = Number(pa)
  const nb = Number(pb)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na > nb ? 1 : -1
  return a.localeCompare(b)
}
