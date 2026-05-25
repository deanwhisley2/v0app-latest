import { maskSensitiveValue } from "@/lib/nexus-security-code"

/** Redact plaintext sensitive values from user-visible security appeal threads after resolution. */
export function maskSecurityThreadMessagesForUser(
  messages: Array<{ body: string; sender_role: string; is_system?: boolean }>,
  threadCategory: string,
  threadStatus: string,
): Array<{ body: string; sender_role: string; is_system?: boolean }> {
  if (threadCategory !== "security_update") return messages
  const terminal = threadStatus === "resolved" || threadStatus === "closed"
  if (!terminal) {
    return messages.map((m) => {
      if (m.sender_role === "user" && !m.is_system) {
        return { ...m, body: "[Your appeal details are visible to operations while under review.]" }
      }
      return m
    })
  }
  return messages.map((m) => {
    if (m.sender_role === "user" && !m.is_system) {
      return { ...m, body: "[Message archived for your privacy after case closure.]" }
    }
    if (m.sender_role === "admin" && m.body.length > 80) {
      return { ...m, body: maskSensitiveValue(m.body.slice(0, 40), "generic") + "…" }
    }
    return m
  })
}
