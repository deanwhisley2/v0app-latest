/**
 * APK delivery health check — run after deploy or when uploads change.
 * Usage: npm run verify:android-apk-delivery
 */
import { resolveAndroidApkFile } from "../lib/server/android-apk-delivery"

async function main() {
  const file = await resolveAndroidApkFile()
  if (!file) {
    console.error("FAIL: no APK found (set ANDROID_APK_PATH or public/releases/nexus-pro.apk)")
    process.exit(1)
  }
  if (file.sizeBytes < 1024) {
    console.error(`FAIL: APK too small (${file.sizeBytes} bytes)`)
    process.exit(1)
  }
  console.log(`OK: ${file.absolutePath} (${file.sizeBytes} bytes) v${file.version}`)
}

void main()
