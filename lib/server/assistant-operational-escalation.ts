import type { User } from "@supabase/supabase-js"
import { evaluateAssistantEscalation } from "@/lib/nexus-assistant/escalation-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  bridgeUserOperationalEscalation,
  type OperationalThreadCategory,
} from "@/lib/server/operational-support-bridge"

export type AssistantEscalationResult = {
  threadId: string
  created: boolean
  category: OperationalThreadCategory
}

/** Create or append an operational support thread when Joelin detects human / dispute intent. */
export async function maybeEscalateAssistantToOperations(
  user: User,
  userMessage: string,
  opts?: { tradingUserLevel?: number; isGuest?: boolean },
): Promise<AssistantEscalationResult | null> {
  if (opts?.isGuest) return null
  if ((opts?.tradingUserLevel ?? 1) === 5) return null

  const gov = evaluateAssistantEscalation({ userMessage })
  if (!gov.shouldEscalate) return null

  const admin = createAdminClient()
  const priority = gov.immediate ? ("high" as const) : ("normal" as const)
  const { threadId, created } = await bridgeUserOperationalEscalation(admin, {
    userId: user.id,
    body: userMessage.trim(),
    category: gov.suggestedCategory,
    source: "assistant",
    escalationSource: "assistant",
    priority,
    searchKey: user.email?.trim().toLowerCase() ?? null,
  })

  return { threadId, created, category: gov.suggestedCategory }
}

export function assistantEscalationReplySuffix(threadId: string): string {
  const short = threadId.slice(0, 8)
  return [
    "",
    "—",
    `Escalated to Nexus operations (case ${short}…).`,
    "A specialist will reply in your support thread — open Chat → Nexus Support to add details.",
  ].join("\n")
}
