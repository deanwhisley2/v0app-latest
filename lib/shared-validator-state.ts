"use client"

/**
 * Single PreTradeValidator + StrategyLearner pair for the whole client session.
 * StrategyLearner mutates the validator when patterns are blocked — new pipeline runs
 * must reuse this pair so learned rules persist.
 */

import { fetchLearnerPatterns, persistLearnerPattern } from "@/lib/learner-patterns-client"
import { PreTradeValidator } from "@/lib/pre-trade-validator"
import { StrategyLearner } from "@/lib/strategy-learner"

let sharedValidator: PreTradeValidator | null = null
let sharedLearner: StrategyLearner | null = null

export function getSharedValidator(): PreTradeValidator {
  if (!sharedValidator) {
    sharedValidator = new PreTradeValidator()
  }
  return sharedValidator
}

/** Same validator instance passed into {@link StrategyLearner} at construction. */
export function getSharedLearner(): StrategyLearner {
  if (!sharedLearner) {
    sharedLearner = new StrategyLearner(getSharedValidator(), {
      onPatternBlocked: (pattern) => {
        void persistLearnerPattern(pattern)
      },
    })
  }
  return sharedLearner
}

/** Load persisted blocked patterns for the logged-in user and replay into shared learner + validator. */
export async function hydrateSharedLearnerFromServer(): Promise<void> {
  ensureSharedValidationState()
  const patterns = await fetchLearnerPatterns()
  if (patterns.length === 0) return
  const learner = getSharedLearner()
  for (const p of patterns) {
    learner.importBlockedPattern(p)
  }
}

/** Idempotent — call before pipeline validation so learner-linked rules exist. */
export function ensureSharedValidationState(): void {
  getSharedValidator()
  getSharedLearner()
}

/** Testing / hard reset only — clears singletons so the next call creates fresh instances. */
export function resetSharedValidationState(): void {
  sharedLearner = null
  sharedValidator = null
}
