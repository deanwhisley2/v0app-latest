/**
 * Grok (xAI) narrative layer — subscription + config gates.
 *
 * Pipeline is **live** only when all are true:
 *   1. NEXUS_GROK_SUBSCRIPTION_ACTIVE=1  (billing / credits — default unset = frozen)
 *   2. NEXUS_GROK_ENABLED=1              (operator arms the integration)
 *   3. XAI_API_KEY set on the server
 *
 * Until subscription is active, keep subscription unset or 0 — no API spend, analysis uses fast paths only for Grok score.
 */

export type GrokPipelineMode = "live" | "frozen_subscription" | "frozen_operator_off" | "mock_no_key"

export function isGrokSubscriptionActive(): boolean {
  return process.env.NEXUS_GROK_SUBSCRIPTION_ACTIVE?.trim() === "1"
}

export function isGrokOperatorEnabled(): boolean {
  return process.env.NEXUS_GROK_ENABLED?.trim() === "1"
}

export function hasXaiApiKeyConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim())
}

/** True only when Grok may call xAI (all gates pass). */
export function isGrokPipelineLive(): boolean {
  return isGrokSubscriptionActive() && isGrokOperatorEnabled() && hasXaiApiKeyConfigured()
}

export type GrokPipelineStatus = {
  pipelineLive: boolean
  subscriptionActive: boolean
  operatorEnabled: boolean
  apiKeyConfigured: boolean
  /** Human-readable primary blocker when not live */
  frozenReason: string | null
}

export function getGrokPipelineStatus(): GrokPipelineStatus {
  const subscriptionActive = isGrokSubscriptionActive()
  const operatorEnabled = isGrokOperatorEnabled()
  const apiKeyConfigured = hasXaiApiKeyConfigured()

  let frozenReason: string | null = null
  if (!subscriptionActive) {
    frozenReason =
      "Grok narrative layer is frozen until subscription / API credits are active (set NEXUS_GROK_SUBSCRIPTION_ACTIVE=1 when ready)."
  } else if (!operatorEnabled) {
    frozenReason = "Set NEXUS_GROK_ENABLED=1 on the server to arm Grok after subscription is active."
  } else if (!apiKeyConfigured) {
    frozenReason = "Add XAI_API_KEY to the server environment for live Grok calls."
  }

  return {
    pipelineLive: subscriptionActive && operatorEnabled && apiKeyConfigured,
    subscriptionActive,
    operatorEnabled,
    apiKeyConfigured,
    frozenReason,
  }
}
