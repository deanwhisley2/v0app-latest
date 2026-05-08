import type { GrokResponse } from "@/lib/analysis/grok-client"

/** Compact lines for AnalysisHistory.reasons + API consumers (no secrets). */
export function grokNarrativeReasonLines(grok: GrokResponse | null | undefined): string[] {
  if (!grok) return []
  if (grok.pipelineMode !== "live") return []

  const lines: string[] = [
    `GROK_NARRATIVE: overall=${grok.overallBias} conf=${grok.confidence} news=${grok.newsSentiment} xBias=${grok.xSentiment.bias}`,
  ]
  const mentions = (grok.xSentiment.keyMentions ?? []).slice(0, 4).join(" | ")
  if (mentions) lines.push(`GROK_MENTIONS: ${mentions.slice(0, 400)}`)
  for (const h of (grok.newsHeadlines ?? []).slice(0, 2)) {
    const t = String(h).trim().slice(0, 180)
    if (t) lines.push(`GROK_HEADLINE: ${t}`)
  }
  if (grok.narrativeShift) {
    lines.push(`GROK_SHIFT: ${String(grok.narrativeShift).slice(0, 200)}`)
  }
  return lines
}
