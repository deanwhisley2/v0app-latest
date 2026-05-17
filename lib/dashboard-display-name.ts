/** UI-only: concise greeting name from profile full_name (no ledger impact). */
export function profileGreetingName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "Member"
  return parts[0]!
}

export function profileTimeGreetingKey(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours()
  if (h < 12) return "morning"
  if (h < 17) return "afternoon"
  return "evening"
}
