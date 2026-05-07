import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"

function parseWindowHours(value: string | null): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 24
  return Math.max(1, Math.min(168, Math.round(n)))
}

function parseReasonBuckets(reasons: unknown[]): Record<string, number> {
  const buckets: Record<string, number> = {}
  for (const row of reasons) {
    if (typeof row !== "string") continue
    const key = row.includes(":") ? row.slice(0, row.indexOf(":")) : row
    buckets[key] = (buckets[key] ?? 0) + 1
  }
  return buckets
}

export async function GET(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const windowHours = parseWindowHours(req.nextUrl.searchParams.get("windowHours"))
    const since = new Date(Date.now() - windowHours * 60 * 60_000).toISOString()
    const admin = createAdminClient()

    const [analysisRows, governanceRows] = await Promise.all([
      admin
        .from("AnalysisHistory")
        .select("id,symbol,action,reasons,createdAt")
        .eq("userId", userId)
        .gte("createdAt", since)
        .order("createdAt", { ascending: false })
        .limit(500),
      admin
        .from("GovernanceApprovalLog")
        .select("status,reason,lane,createdAt,symbol")
        .eq("userId", userId)
        .gte("createdAt", since)
        .order("createdAt", { ascending: false })
        .limit(500),
    ])

    if (analysisRows.error) throw new Error(`DB_READ_FAILED: ${analysisRows.error.message}`)
    if (governanceRows.error) throw new Error(`DB_READ_FAILED: ${governanceRows.error.message}`)

    const analyses = analysisRows.data ?? []
    const governance = governanceRows.data ?? []
    const actionCounts = analyses.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.action ?? "UNKNOWN")
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    const reasonCounts = analyses.reduce<Record<string, number>>((acc, row) => {
      const parsed = parseReasonBuckets(Array.isArray(row.reasons) ? row.reasons : [])
      for (const [k, v] of Object.entries(parsed)) acc[k] = (acc[k] ?? 0) + v
      return acc
    }, {})
    const governanceStatusCounts = governance.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.status ?? "UNKNOWN")
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      windowHours,
      since,
      totals: {
        analyses: analyses.length,
        governanceDecisions: governance.length,
      },
      actionCounts,
      reasonCounts,
      governanceStatusCounts,
      topSymbols: Object.entries(
        analyses.reduce<Record<string, number>>((acc, row) => {
          const key = String(row.symbol ?? "UNKNOWN")
          acc[key] = (acc[key] ?? 0) + 1
          return acc
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([symbol, count]) => ({ symbol, count })),
    })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
