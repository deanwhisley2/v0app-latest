import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type InstallEventBody = {
  event?: string
  surface?: string
  browser?: string | null
  version?: string | null
  statusCode?: number | null
  detail?: string | null
}

export async function POST(request: Request) {
  let body: InstallEventBody = {}
  try {
    body = (await request.json()) as InstallEventBody
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const payload = {
    event: String(body.event ?? "unknown").slice(0, 64),
    surface: body.surface?.slice(0, 32) ?? null,
    browser: body.browser?.slice(0, 32) ?? null,
    version: body.version?.slice(0, 32) ?? null,
    statusCode: body.statusCode ?? null,
    detail: body.detail?.slice(0, 200) ?? null,
    ua: request.headers.get("user-agent")?.slice(0, 200) ?? "",
    at: new Date().toISOString(),
  }

  console.info("[android-install]", JSON.stringify(payload))

  return new NextResponse(null, { status: 204 })
}
