import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function GET(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { searchParams } = new URL(request.url)
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 100)))
    const proposalId = searchParams.get("proposalId")?.trim()
    const admin = createAdminClient()
    let q = admin.from("EvolutionAuditEvent").select("*").eq("userId", userOrRes).order("createdAt", { ascending: false }).limit(limit)
    if (proposalId) q = q.eq("proposalId", proposalId)
    const { data, error } = await q
    if (error) throw new Error(`DB_READ_FAILED: EvolutionAuditEvent list — ${error.message}`)
    return NextResponse.json({ events: data ?? [] })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
