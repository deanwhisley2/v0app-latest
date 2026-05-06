import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { orchestrateStartupRecovery } from "@/lib/startup-recovery"

export async function POST(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const body = (await req.json().catch(() => ({}))) as { autoRepair?: boolean; maxAgeMinutes?: number }
    const result = await orchestrateStartupRecovery({
      userId,
      autoRepair: body.autoRepair === true,
      maxAgeMinutes: body.maxAgeMinutes,
    })
    return NextResponse.json({ result })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
