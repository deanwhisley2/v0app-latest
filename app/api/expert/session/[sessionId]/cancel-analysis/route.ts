import { NextRequest, NextResponse } from "next/server"
import { getAnalysisById } from "@/lib/expert/phase2-store"

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const body = (await req.json().catch(() => ({}))) as { analysisId?: string }
  if (!body.analysisId) return NextResponse.json({ error: "analysisId required" }, { status: 400 })
  const analysis = await getAnalysisById(body.analysisId)
  if (!analysis) return NextResponse.json({ error: "analysis not found" }, { status: 404 })
  return NextResponse.json({ cancelled: true, sessionId })
}
