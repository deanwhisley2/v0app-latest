import { NextResponse } from "next/server"

/** Lightweight liveness check for curl / load balancers (no DB or external calls). */
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "nexus",
    time: new Date().toISOString(),
  })
}
