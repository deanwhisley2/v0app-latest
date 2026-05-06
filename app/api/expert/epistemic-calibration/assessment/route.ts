import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runEpistemicCalibrationAssessment } from "@/lib/epistemic-calibration-assessment"

/** Market-truth alignment assessment — advisory only; no execution or governance mutation. */
export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as {
      calibrationWindowDays?: number
      persist?: boolean
      persistCorrelatedMetaSnapshot?: boolean
    }
    const result = await runEpistemicCalibrationAssessment({
      userId: userOrRes,
      calibrationWindowDays: body.calibrationWindowDays,
      persist: body.persist,
      persistCorrelatedMetaSnapshot: body.persistCorrelatedMetaSnapshot,
    })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
