import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  compareReleaseVersions,
  getDefaultAndroidRelease,
  ANDROID_APK_API_PATH,
  type AndroidReleaseManifest,
} from "@/lib/android-install/config"
import { resolveAndroidApkFile } from "@/lib/server/android-apk-delivery"

export const dynamic = "force-dynamic"

async function readManifestFile(): Promise<AndroidReleaseManifest | null> {
  try {
    const filePath = path.join(process.cwd(), "public", "android-release.json")
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw) as AndroidReleaseManifest
  } catch {
    return null
  }
}

/** Lightweight version check for in-app / PWA update prompts. */
export async function GET(request: NextRequest) {
  const fromFile = await readManifestFile()
  const release = fromFile ?? getDefaultAndroidRelease()
  const apkFile = await resolveAndroidApkFile()
  const apkAvailable = apkFile != null

  if (apkFile) release.sizeBytes = apkFile.sizeBytes

  const installedVersion = request.nextUrl.searchParams.get("installed")?.slice(0, 32) ?? null
  let updateAvailable = false
  let forceUpdate = false
  if (installedVersion && apkAvailable) {
    updateAvailable = compareReleaseVersions(release.version, installedVersion) > 0
    forceUpdate =
      Boolean(release.forceUpdate) &&
      compareReleaseVersions(release.version, release.minSupportedVersion) >= 0 &&
      compareReleaseVersions(installedVersion, release.minSupportedVersion) < 0
  }

  return NextResponse.json(
    {
      version: release.version,
      versionCode: release.versionCode,
      minSupportedVersion: release.minSupportedVersion,
      apkAvailable,
      updateAvailable,
      forceUpdate,
      downloadUrl: ANDROID_APK_API_PATH,
      sha256: release.sha256 || null,
      sizeBytes: release.sizeBytes || 0,
      stagedRolloutPercent: release.stagedRolloutPercent ?? 100,
      updateWifiOnlyDefault: release.updateWifiOnlyDefault ?? true,
      pwaAssetVersion: release.pwaAssetVersion,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
