import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { resolveAuthoritativeMarketState } from "@/lib/market-state-authority"

export async function GET(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const url = new URL(req.url)
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "50")))
    const scope = (url.searchParams.get("scope") ?? "GLOBAL").toUpperCase()
    await resolveAuthoritativeMarketState({
      consumer: "api-governance-market-structure",
      scope,
      minRefreshMs: 30_000,
    })
    const admin = createAdminClient()
    const { data: live } = await admin.from("LiveStructureState").select("*").eq("scope", scope).maybeSingle()
    const { data, error } = await admin
      .from("MarketStructureSnapshot")
      .select("*")
      .eq("scope", scope)
      .order("createdAt", { ascending: false })
      .limit(limit)
    if (error) throw new Error(`DB_READ_FAILED: MarketStructureSnapshot read — ${error.message}`)
    return NextResponse.json({ live, snapshots: data ?? [] })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
