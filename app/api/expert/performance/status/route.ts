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
    const [regime, conf, gov, exec] = await Promise.all([
      admin.from("RegimePerformanceSnapshot").select("*").eq("userId", userId).order("createdAt", { ascending: false }).limit(20),
      admin.from("ConfidenceAuditSnapshot").select("*").eq("userId", userId).order("createdAt", { ascending: false }).limit(1).maybeSingle(),
      admin.from("GovernanceEffectivenessSnapshot").select("*").eq("userId", userId).order("createdAt", { ascending: false }).limit(1).maybeSingle(),
      admin.from("ExecutionQualitySnapshot").select("*").eq("userId", userId).order("createdAt", { ascending: false }).limit(1).maybeSingle(),
    ])
    if (regime.error) throw new Error(regime.error.message)
    if (conf.error) throw new Error(conf.error.message)
    if (gov.error) throw new Error(gov.error.message)
    if (exec.error) throw new Error(exec.error.message)
    return NextResponse.json({
      regimePerformance: regime.data ?? [],
      confidenceAudit: conf.data ?? null,
      governanceEffectiveness: gov.data ?? null,
      executionQuality: exec.data ?? null,
    })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
