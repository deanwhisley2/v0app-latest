import { NextRequest, NextResponse } from "next/server"
import {
  disableDemoMode,
  enableDemoMode,
  getRemainingSeconds,
  isDemoModeEnabled,
} from "@/lib/demo-mode-manager"

export async function GET() {
  return NextResponse.json({
    enabled: isDemoModeEnabled(),
    remainingSeconds: getRemainingSeconds(),
  })
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NEXUS_REAL_TRADING === "1") {
      return NextResponse.json(
        {
          success: false,
          enabled: false,
          error: "Demo mode cannot be enabled while NEXUS_REAL_TRADING=1 (live execution).",
        },
        { status: 403 }
      )
    }
    const body = (await request.json()) as { enabled?: boolean; duration?: number }
    const enabled = Boolean(body.enabled)
    const duration = typeof body.duration === "number" && body.duration > 0 ? body.duration : 5

    if (enabled) {
      enableDemoMode(duration)
      return NextResponse.json({
        success: true,
        enabled: true,
        remainingSeconds: getRemainingSeconds(),
        message: `Demo mode on for ${duration} minute(s) — orders are not sent to the exchange.`,
      })
    }
    disableDemoMode()
    return NextResponse.json({
      success: true,
      enabled: false,
      remainingSeconds: 0,
      message: "Demo mode off.",
    })
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 })
  }
}
