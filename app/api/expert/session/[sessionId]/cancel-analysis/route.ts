import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES } from "@/lib/expert/execution-guards"
import { getAnalysisById } from "@/lib/expert/phase2-store"

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const userOrRes = await requireExpertUserId()
  if (userOrRes instanceof NextResponse) return userOrRes
  const userId = userOrRes

  const { sessionId } = await params
  const body = (await req.json().catch(() => ({}))) as { analysisId?: string }
  if (!body.analysisId) return NextResponse.json({ error: "analysisId required" }, { status: 400 })
  const analysis = await getAnalysisById(body.analysisId)
  if (!analysis) return NextResponse.json({ error: "analysis not found" }, { status: 404 })
  if (analysis.userId !== userId) {
    return NextResponse.json({ code: ERROR_CODES.FORBIDDEN_SESSION, error: "FORBIDDEN_SESSION" }, { status: 403 })
  }
  return NextResponse.json({ cancelled: true, sessionId })
}
