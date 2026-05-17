import { NextResponse } from "next/server"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"

export const dynamic = "force-dynamic"

/** Public launch window status (no secrets). */
export async function GET() {
  try {
    const launch = await getPlatformLaunchStatus(true)
    return NextResponse.json({
      ok: true,
      launch,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
