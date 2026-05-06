import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { createRollbackCheckpoint } from "@/lib/evolution-governor"

export async function GET(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 30)))
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("RollbackCheckpoint")
      .select("id,createdAt,userId,label,proposalId,snapshot")
      .eq("userId", userOrRes)
      .order("createdAt", { ascending: false })
      .limit(limit)
    if (error) throw new Error(`DB_READ_FAILED: RollbackCheckpoint list — ${error.message}`)
    return NextResponse.json({ checkpoints: data ?? [] })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}

export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as { label?: string; proposalId?: string | null }
    if (!body.label?.trim()) {
      return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "label is required" }, { status: 400 })
    }
    const checkpoint = await createRollbackCheckpoint({
      userId: userOrRes,
      label: body.label,
      proposalId: body.proposalId ?? null,
    })
    return NextResponse.json({ checkpoint })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
