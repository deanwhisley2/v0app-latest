import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
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

export async function GET() {
  const fromFile = await readManifestFile()
  const release = fromFile ?? getDefaultAndroidRelease()

  const envSha = process.env.ANDROID_APK_SHA256
  if (envSha) release.sha256 = envSha

  const apkFile = await resolveAndroidApkFile()
  const apkAvailable = apkFile != null

  if (apkFile) {
    release.sizeBytes = apkFile.sizeBytes
  }

  release.apkUrl = ANDROID_APK_API_PATH

  return NextResponse.json(
    {
      ...release,
      apkAvailable,
      downloadUrl: ANDROID_APK_API_PATH,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Nexus-Release-Version": release.version,
        "X-Nexus-Apk-Available": apkAvailable ? "1" : "0",
      },
    },
  )
}
