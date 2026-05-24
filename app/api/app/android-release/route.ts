import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  getDefaultAndroidRelease,
  type AndroidReleaseManifest,
} from "@/lib/android-install/config"

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

/** Signed Android release metadata for install prompts and APK integrity checks. */
export async function GET() {
  const fromFile = await readManifestFile()
  const release = fromFile ?? getDefaultAndroidRelease()

  const envSha = process.env.ANDROID_APK_SHA256
  if (envSha) release.sha256 = envSha

  const envUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL
  if (envUrl) release.apkUrl = envUrl

  return NextResponse.json(release, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Nexus-Release-Version": release.version,
    },
  })
}
