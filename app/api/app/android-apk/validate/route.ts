import { NextResponse } from "next/server"
import { getDefaultAndroidRelease } from "@/lib/android-install/config"
import { resolveAndroidApkFile } from "@/lib/server/android-apk-delivery"

export const dynamic = "force-dynamic"

/** User-initiated availability probe — call only from explicit download/update taps. */
export async function GET() {
  const apk = await resolveAndroidApkFile()
  if (!apk || apk.sizeBytes <= 0) {
    return NextResponse.json(
      { ok: false, reason: "missing_file", sizeBytes: 0 },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  const release = getDefaultAndroidRelease()
  const sha256 = (process.env.ANDROID_APK_SHA256 ?? release.sha256 ?? "").trim()

  if (!sha256) {
    return NextResponse.json(
      { ok: false, reason: "missing_checksum", sizeBytes: apk.sizeBytes },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      sizeBytes: apk.sizeBytes,
      sha256,
      version: release.version,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Nexus-Apk-Available": "1",
      },
    },
  )
}
