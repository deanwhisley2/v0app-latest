import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runPluralisticCognitiveCouncil } from "@/lib/pluralistic-cognitive-governance"

/** Runs specialist council + governance debate (persisted by default). Does not mutate adaptation or execution. */
export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as {
      cognitiveWindowDays?: number
      persist?: boolean
      persistCorrelatedMetaSnapshot?: boolean
    }
    const result = await runPluralisticCognitiveCouncil({
      userId: userOrRes,
      cognitiveWindowDays: body.cognitiveWindowDays,
      persist: body.persist,
      persistCorrelatedMetaSnapshot: body.persistCorrelatedMetaSnapshot,
    })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
