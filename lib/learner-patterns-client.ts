"use client"

import type { LearnedPattern } from "@/lib/strategy-learner"

export async function fetchLearnerPatterns(): Promise<LearnedPattern[]> {
  try {
    const res = await fetch("/api/learner-patterns", { credentials: "include", cache: "no-store" })
    if (!res.ok) return []
    const data = (await res.json()) as { patterns?: LearnedPattern[] }
    return Array.isArray(data.patterns) ? data.patterns : []
  } catch {
    return []
  }
}

export async function persistLearnerPattern(pattern: LearnedPattern): Promise<boolean> {
  try {
    const res = await fetch("/api/learner-patterns", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern }),
    })
    return res.ok
  } catch {
    return false
  }
}
