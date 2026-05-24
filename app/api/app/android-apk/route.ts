import { NextResponse } from "next/server"
import {
  apkStreamForRange,
  APK_MIME,
  resolveAndroidApkFile,
} from "@/lib/server/android-apk-delivery"
import { getDefaultAndroidRelease } from "@/lib/android-install/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function apkUnavailable() {
  return NextResponse.json(
    {
      ok: false,
      error: "apk_unavailable",
      message: "Signed APK is not published on this server yet. Use Install App (Add to Home screen) or continue in browser.",
      pwaFallback: true,
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Nexus-Apk-Available": "0",
      },
    },
  )
}

function buildApkHeaders(info: { sizeBytes: number; filename: string; version: string }, sha256: string) {
  const headers: Record<string, string> = {
    "Content-Type": APK_MIME,
    "Content-Disposition": `attachment; filename="${info.filename}"; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-transform, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "X-Nexus-Apk-Available": "1",
    "X-Nexus-Release-Version": info.version,
  }
  if (sha256) headers["X-Apk-Sha256"] = sha256
  return headers
}

async function serveApk(request: Request, headOnly: boolean) {
  const file = await resolveAndroidApkFile()
  if (!file) return apkUnavailable()

  const release = getDefaultAndroidRelease()
  const sha256 = process.env.ANDROID_APK_SHA256 ?? release.sha256 ?? ""
  const baseHeaders = buildApkHeaders(file, sha256)

  const range = request.headers.get("range")
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim())
    if (match) {
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Number(match[2]) : file.sizeBytes - 1
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end < file.sizeBytes) {
        const chunkSize = end - start + 1
        if (headOnly) {
          return new NextResponse(null, {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Length": String(chunkSize),
              "Content-Range": `bytes ${start}-${end}/${file.sizeBytes}`,
            },
          })
        }
        const stream = apkStreamForRange(file.absolutePath, start, end)
        return new NextResponse(stream as unknown as BodyInit, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${file.sizeBytes}`,
          },
        })
      }
    }
  }

  if (headOnly) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(file.sizeBytes),
      },
    })
  }

  const stream = apkStreamForRange(file.absolutePath, 0, file.sizeBytes - 1)
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(file.sizeBytes),
    },
  })
}

export async function GET(request: Request) {
  return serveApk(request, false)
}

export async function HEAD(request: Request) {
  return serveApk(request, true)
}
