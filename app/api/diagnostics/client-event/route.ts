import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type ClientEventBody = {
  kind?: string
  message?: string
  url?: string
  path?: string
  phase?: string
  stack?: string
  meta?: Record<string, unknown>
  ts?: number
}

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60
const hits = new Map<string, { count: number; resetAt: number }>()

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown"
  return request.headers.get("x-real-ip") ?? "unknown"
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const row = hits.get(ip)
  if (!row || now > row.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  row.count += 1
  if (row.count > RATE_MAX) return true
  return false
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  if (rateLimited(ip)) {
    return new NextResponse(null, { status: 429 })
  }

  let body: ClientEventBody = {}
  try {
    body = (await request.json()) as ClientEventBody
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const payload = {
    kind: String(body.kind ?? "unknown").slice(0, 64),
    message: String(body.message ?? "").slice(0, 500),
    url: body.url?.slice(0, 500) ?? null,
    path: body.path?.slice(0, 200) ?? null,
    phase: body.phase?.slice(0, 32) ?? null,
    stack: body.stack?.slice(0, 800) ?? null,
    meta: body.meta ?? null,
    ts: body.ts ?? null,
    ua: request.headers.get("user-agent")?.slice(0, 220) ?? "",
    ip,
    at: new Date().toISOString(),
  }

  console.info("[nexus-diag]", JSON.stringify(payload))

  return new NextResponse(null, { status: 204 })
}
