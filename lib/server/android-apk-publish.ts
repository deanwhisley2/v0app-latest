import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const APK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const MIN_APK_BYTES = 100 * 1024

export type PublishAndroidApkResult = {
  version: string
  versionCode: number
  sha256: string
  sizeBytes: number
  publishedAt: string
  destPath: string
  archivedPrevious: string | null
}

export async function validateApkFile(apkPath: string): Promise<{ sizeBytes: number }> {
  const info = await stat(apkPath)
  if (!info.isFile()) throw new Error("APK path is not a file")
  if (info.size < MIN_APK_BYTES) {
    throw new Error(`APK too small (${info.size} bytes) — likely corrupted`)
  }
  const head = await readFile(apkPath, { encoding: null, flag: "r" }).then((b) => b.subarray(0, 4))
  if (!head.equals(APK_MAGIC)) {
    throw new Error("Invalid APK: missing ZIP magic header (corrupted or wrong file type)")
  }
  return { sizeBytes: info.size }
}

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

export async function publishAndroidApk(params: {
  sourceApkPath: string
  repoRoot: string
  version: string
  versionCode?: number
  minSupportedVersion?: string
  forceUpdate?: boolean
}): Promise<PublishAndroidApkResult> {
  const { sourceApkPath, repoRoot, version } = params
  const versionCode = params.versionCode ?? (Number(version.replace(/\D/g, "")) || 1)
  const releasesDir = path.join(repoRoot, "public", "releases")
  const archiveDir = path.join(releasesDir, "archive")
  const destPath = path.join(releasesDir, "nexus-pro.apk")
  const manifestPath = path.join(repoRoot, "public", "android-release.json")

  await validateApkFile(sourceApkPath)
  const sha256 = await sha256File(sourceApkPath)
  const sizeBytes = (await stat(sourceApkPath)).size

  await mkdir(releasesDir, { recursive: true })
  await mkdir(archiveDir, { recursive: true })

  let archivedPrevious: string | null = null
  try {
    await access(destPath)
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    archivedPrevious = path.join(archiveDir, `nexus-pro-${ts}.apk`)
    await rename(destPath, archivedPrevious)
  } catch {
    /* no prior APK */
  }

  const { copyFile } = await import("node:fs/promises")
  await copyFile(sourceApkPath, destPath)
  await validateApkFile(destPath)

  const publishedAt = new Date().toISOString()
  const manifest = {
    version,
    versionCode,
    apkUrl: "/api/app/android-apk",
    sha256,
    sizeBytes,
    publishedAt,
    minSupportedVersion: params.minSupportedVersion ?? version,
    pwaAssetVersion: version,
    forceUpdate: Boolean(params.forceUpdate),
    stagedRolloutPercent: 100,
    updateWifiOnlyDefault: true,
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

  return {
    version,
    versionCode,
    sha256,
    sizeBytes,
    publishedAt,
    destPath,
    archivedPrevious,
  }
}
