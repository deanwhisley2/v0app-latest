import type { NexusAssistantInput } from "./types"
import { runNexusAssistant } from "./model"
import { supabase } from "@/lib/supabaseClient"

export type NexusAssistantApiBody = NexusAssistantInput & {
  /** When set, the server uses this as the factual draft instead of recomputing (e.g. Wallstreet strategy heuristics). */
  precomputedDraft?: string
}

/**
 * Calls POST /api/nexus-assistant — Joelin via DeepSeek when DEEPSEEK_API_KEY is set; otherwise local draft only.
 * Falls back to local `runNexusAssistant` on network or server errors.
 */
export async function requestNexusAssistantReply(input: NexusAssistantApiBody): Promise<string> {
  const localFallback = () => {
    const { precomputedDraft, ...core } = input
    if (precomputedDraft?.trim()) return precomputedDraft.trim()
    return runNexusAssistant(core)
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    const headers: HeadersInit = { "Content-Type": "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch("/api/nexus-assistant", {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as {
      reply?: string
      escalation?: { threadId: string; created: boolean } | null
    }
    if (res.ok && typeof data.reply === "string" && data.reply.trim()) {
      return data.reply.trim()
    }
  } catch {
    /* network */
  }
  return localFallback()
}
