"use client"

export type ExpertAnalysisDecision = "BUY" | "SELL" | "HOLD"

export type ExpertAnalysisRecord = {
  id: string
  symbol: string
  action: ExpertAnalysisDecision
  confidence: number
  timestamp: string
  durationSeconds: number
  completedAt: string
  entryPrice?: number
  keyIndicators: string[]
  riskAssessment: string
}

const STORAGE_KEY = "nexus_expert_analysis_history_v1"

function readAll(): ExpertAnalysisRecord[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ExpertAnalysisRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(rows: ExpertAnalysisRecord[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // Ignore storage failures (quota/private mode).
  }
}

export function saveExpertAnalysis(record: ExpertAnalysisRecord) {
  const rows = readAll()
  writeAll([record, ...rows.filter((r) => r.id !== record.id)])
}

export function getExpertAnalysisById(id: string): ExpertAnalysisRecord | null {
  const rows = readAll()
  return rows.find((r) => r.id === id) ?? null
}
