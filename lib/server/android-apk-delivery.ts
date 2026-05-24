import { createReadStream } from "node:fs"
import { access, stat } from "node:fs/promises"
import path from "node:path"
import { getDefaultAndroidRelease } from "@/lib/android-install/config"

export type AndroidApkFileInfo = {
  absolutePath: string
  sizeBytes: number
  version: string
  filename: string
}

const APK_MIME = "application/vnd.android.package-archive"

export function androidApkDownloadFilename(version: string): string {
  return `nexus-pro-${version}.apk`
}

/** Resolve signed APK on disk — ANDROID_APK_PATH override, then public/releases. */
export async function resolveAndroidApkFile(): Promise<AndroidApkFileInfo | null> {
  const release = getDefaultAndroidRelease()
  const candidates = [
    process.env.ANDROID_APK_PATH?.trim(),
    path.join(process.cwd(), "public", "releases", "nexus-pro.apk"),
    path.join(process.cwd(), "releases", "nexus-pro.apk"),
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    try {
      await access(candidate)
      const info = await stat(candidate)
      if (!info.isFile() || info.size < 1024) continue
      return {
        absolutePath: candidate,
        sizeBytes: info.size,
        version: release.version,
        filename: androidApkDownloadFilename(release.version),
      }
    } catch {
      /* try next */
    }
  }
  return null
}

export function apkStreamForRange(
  absolutePath: string,
  start: number,
  end: number,
): ReturnType<typeof createReadStream> {
  return createReadStream(absolutePath, { start, end })
}

export { APK_MIME }
