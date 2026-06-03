import type { SupabaseClient } from "@supabase/supabase-js"

export type AwardPointsInput = {
  userId: string
  ruleKey: string
  idempotencyKey: string
  reason: string
  source: string
  sessionReference?: string | null
}

export async function awardPerformancePoints(
  admin: SupabaseClient,
  input: AwardPointsInput,
): Promise<{ awarded: boolean; points: number; delta: number }> {
  const { data: rule } = await admin
    .from("performance_point_rules")
    .select("points,enabled,label")
    .eq("rule_key", input.ruleKey)
    .maybeSingle()
  if (!rule?.enabled) return { awarded: false, points: 0, delta: 0 }
  const delta = Number(rule.points ?? 0)
  if (!(delta > 0)) return { awarded: false, points: 0, delta: 0 }

  const { error: insErr } = await admin.from("performance_point_events").insert({
    user_id: input.userId,
    delta,
    reason: input.reason,
    source: input.source,
    session_reference: input.sessionReference ?? null,
    idempotency_key: input.idempotencyKey,
  })
  if (insErr) {
    if (insErr.code === "23505") return { awarded: false, points: 0, delta: 0 }
    throw new Error(insErr.message)
  }

  const { data: bal } = await admin
    .from("user_performance_points")
    .select("points,completed_sessions")
    .eq("user_id", input.userId)
    .maybeSingle()

  const nextPoints = Number(bal?.points ?? 0) + delta
  const completedSessions = Number(bal?.completed_sessions ?? 0)

  const { error: upErr } = await admin.from("user_performance_points").upsert(
    {
      user_id: input.userId,
      points: nextPoints,
      completed_sessions: completedSessions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
  if (upErr) throw new Error(upErr.message)

  return { awarded: true, points: nextPoints, delta }
}

export async function incrementCompletedSessions(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: bal } = await admin
    .from("user_performance_points")
    .select("points,completed_sessions")
    .eq("user_id", userId)
    .maybeSingle()
  const { error } = await admin.from("user_performance_points").upsert(
    {
      user_id: userId,
      points: Number(bal?.points ?? 0),
      completed_sessions: Number(bal?.completed_sessions ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
  if (error) throw new Error(error.message)
}

export async function getWeeklyLeaderboard(
  admin: SupabaseClient,
  limit = 10,
): Promise<
  Array<{
    rank: number
    userId: string
    username: string
    points: number
    completedSessions: number
    streak: number
  }>
> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: rows, error } = await admin
    .from("user_performance_points")
    .select("user_id,points,completed_sessions")
    .order("points", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)

  const out: Array<{
    rank: number
    userId: string
    username: string
    points: number
    completedSessions: number
    streak: number
  }> = []

  let rank = 0
  for (const r of rows ?? []) {
    rank += 1
    const userId = String(r.user_id)
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name,email")
      .eq("id", userId)
      .maybeSingle()
    const { data: streakRow } = await admin
      .from("user_attendance_streaks")
      .select("current_streak")
      .eq("user_id", userId)
      .maybeSingle()

    const full = String((prof as { full_name?: string } | null)?.full_name ?? "").trim()
    const email = String((prof as { email?: string } | null)?.email ?? "")
    const username =
      full.length > 0
        ? full.split(/\s+/)[0] + (full.includes(" ") ? ` ${full.split(/\s+/)[1]?.[0] ?? ""}.` : "")
        : email.includes("@")
          ? email.split("@")[0].slice(0, 6) + "…"
          : `Member ${userId.slice(0, 6)}`

    out.push({
      rank,
      userId,
      username,
      points: Number(r.points ?? 0),
      completedSessions: Number(r.completed_sessions ?? 0),
      streak: Number(streakRow?.current_streak ?? 0),
    })
  }
  return out
}
