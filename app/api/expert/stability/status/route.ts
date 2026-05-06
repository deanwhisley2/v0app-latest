import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"

export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const admin = createAdminClient()
    const state = await admin.from("DriftDetectionState").select("*").eq("userId", userId).maybeSingle()
    const snaps = await admin.from("StabilitySnapshot").select("*").eq("userId", userId).order("createdAt", { ascending: false }).limit(20)
    const events = await admin.from("DriftEvent").select("*").eq("userId", userId).order("createdAt", { ascending: false }).limit(30)
    const baselines = await admin.from("BehavioralBaseline").select("*").eq("userId", userId)
    if (state.error) throw new Error(state.error.message)
    if (snaps.error) throw new Error(snaps.error.message)
    if (events.error) throw new Error(events.error.message)
    if (baselines.error) throw new Error(baselines.error.message)
    return NextResponse.json({
      driftDetection: state.data ?? null,
      recentSnapshots: snaps.data ?? [],
      recentDriftEvents: events.data ?? [],
      behavioralBaselines: baselines.data ?? [],
    })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
