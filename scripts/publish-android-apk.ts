#!/usr/bin/env npx tsx
/**
 * Publish signed APK: validate, checksum, archive prior build, update android-release.json.
 * Usage: npm run publish:android-apk -- /path/to/nexus-pro.apk [--version 20260525] [--force-update]
 */
import path from "node:path"
import { publishAndroidApk } from "../lib/server/android-apk-publish"

async function main() {
  const args = process.argv.slice(2)
  const apkPath = args.find((a) => !a.startsWith("--"))
  if (!apkPath) {
    console.error("Usage: publish-android-apk.ts <signed.apk> [--version YYYYMMDD] [--force-update]")
    process.exit(1)
  }
  const versionFlag = args.indexOf("--version")
  const version =
    versionFlag >= 0 && args[versionFlag + 1]
      ? args[versionFlag + 1]
      : new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const forceUpdate = args.includes("--force-update")
  const repoRoot = path.resolve(__dirname, "..")

  const result = await publishAndroidApk({
    sourceApkPath: path.resolve(apkPath),
    repoRoot,
    version,
    versionCode: Number(version.replace(/\D/g, "")) || 1,
    forceUpdate,
  })

  console.log("Published Nexus Pro APK")
  console.log(`  version:   ${result.version}`)
  console.log(`  sha256:    ${result.sha256}`)
  console.log(`  sizeBytes: ${result.sizeBytes}`)
  console.log(`  dest:      ${result.destPath}`)
  if (result.archivedPrevious) console.log(`  archived:  ${result.archivedPrevious}`)
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
