import { NextResponse } from "next/server"
import { getGrokPipelineStatus } from "@/lib/grok-pipeline-status"

/** Public-safe Grok pipeline readiness (no secrets). */
export const dynamic = "force-dynamic"

export async function GET() {
  const s = getGrokPipelineStatus()
  return NextResponse.json({
    pipelineLive: s.pipelineLive,
    subscriptionActive: s.subscriptionActive,
    operatorEnabled: s.operatorEnabled,
    apiKeyConfigured: s.apiKeyConfigured,
    frozenReason: s.frozenReason,
  })
}
