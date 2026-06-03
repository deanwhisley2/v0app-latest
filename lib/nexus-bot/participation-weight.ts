/** Remaining session duration / total duration at join time (0–1). */
export function computeParticipationWeight(params: {
  sessionStartAt: string
  sessionEndAt: string
  joinedAt: string
}): number {
  const start = new Date(params.sessionStartAt).getTime()
  const end = new Date(params.sessionEndAt).getTime()
  const joined = new Date(params.joinedAt).getTime()
  const durationMs = end - start
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(joined)) return 0
  if (durationMs <= 0) return 0
  const effectiveJoinMs = Math.max(joined, start)
  const remainingMs = end - effectiveJoinMs
  if (remainingMs <= 0) return 0
  const weight = remainingMs / durationMs
  return Math.round(Math.min(1, Math.max(0, weight)) * 1_000_000) / 1_000_000
}
