import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()

    const { data: mine } = await admin
      .from("user_performance_points")
      .select("points,completed_sessions")
      .eq("user_id", user.id)
      .maybeSingle()

    const { data: events } = await admin
      .from("performance_point_events")
      .select("delta,reason,source,session_reference,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    const { data: streakRow } = await admin
      .from("user_attendance_streaks")
      .select("current_streak,longest_streak")
      .eq("user_id", user.id)
      .maybeSingle()

    return NextResponse.json({
      myPoints: Number(mine?.points ?? 0),
      myCompletedSessions: Number(mine?.completed_sessions ?? 0),
      myStreak: Number(streakRow?.current_streak ?? 0),
      recentEvents: events ?? [],
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
