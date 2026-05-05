import type { NexusAssistantInput } from "./types"
import { runNexusAssistant } from "./model"

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
    const res = await fetch("/api/nexus-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as { reply?: string }
    if (res.ok && typeof data.reply === "string" && data.reply.trim()) {
      return data.reply.trim()
    }
  } catch {
    /* network */
  }
  return localFallback()
}
