"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { HowToTradeDialog } from "@/components/marketing/how-to-trade-dialog"
import { StartupBonusWelcomeFlow } from "@/components/marketing/startup-bonus-welcome-flow"
import { useStartupOnboarding } from "@/hooks/use-startup-onboarding"
import { openStartupFixedTrade } from "@/lib/client/open-startup-fixed-trade"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"

const FLOW_DONE_KEY = "nexus_startup_onboarding_v1_done"
const FLOW_STEP_KEY = "nexus_startup_onboarding_v1_step"

type FlowStep = 1 | 2 | 3

function readFlowStep(): FlowStep | null {
  if (typeof window === "undefined") return null
  try {
    if (localStorage.getItem(FLOW_DONE_KEY) === "1") return null
    const raw = localStorage.getItem(FLOW_STEP_KEY)
    if (raw === "2" || raw === "3") return Number(raw) as FlowStep
    return 1
  } catch {
    return 1
  }
}

function persistFlowStep(step: FlowStep | null, done = false) {
  try {
    if (done) {
      localStorage.setItem(FLOW_DONE_KEY, "1")
      localStorage.removeItem(FLOW_STEP_KEY)
      return
    }
    if (step) localStorage.setItem(FLOW_STEP_KEY, String(step))
  } catch {
    /* private mode */
  }
}

type StartupBonusOnboardingOrchestratorProps = {
  enabled?: boolean
  onGoToTrading: () => void
  onOpenSecuritySetup: () => void
  /** When set, opens the activation step (Release Bullish). */
  requestActivateStep?: number
  onActivateStepHandled?: () => void
}

export function StartupBonusOnboardingOrchestrator({
  enabled = true,
  onGoToTrading,
  onOpenSecuritySetup,
  requestActivateStep = 0,
  onActivateStepHandled,
}: StartupBonusOnboardingOrchestratorProps) {
  const { t, formatUserMoney } = useUserPreferences()
  const { data, loading, refresh } = useStartupOnboarding(enabled)
  const [flowStep, setFlowStep] = useState<FlowStep | null>(null)
  const [howToOpen, setHowToOpen] = useState(false)
  const [openingTrade, setOpeningTrade] = useState(false)
  const [flowBooted, setFlowBooted] = useState(false)

  const amountLabel = useMemo(
    () => formatUserMoney(data.recommendedCommitUsd || data.startupCapitalLockedUsd),
    [data.recommendedCommitUsd, data.startupCapitalLockedUsd, formatUserMoney],
  )

  const shouldEngage = enabled && !loading && data.hasStartupBonus && data.showCampaignPromo

  useEffect(() => {
    if (!shouldEngage || flowBooted) return
    if (data.hasFixedTrade) {
      persistFlowStep(null, true)
      setFlowBooted(true)
      return
    }
    const step = readFlowStep()
    if (step) {
      setFlowStep(step)
    } else if (data.startupBonusReceivedAt) {
      setFlowStep(1)
      persistFlowStep(1)
    }
    setFlowBooted(true)
  }, [shouldEngage, data.hasFixedTrade, data.startupBonusReceivedAt, flowBooted])

  useEffect(() => {
    if (!requestActivateStep || !shouldEngage) return
    setFlowStep(2)
    persistFlowStep(2)
    onActivateStepHandled?.()
  }, [requestActivateStep, shouldEngage, onActivateStepHandled])

  const advanceFlow = useCallback(
    (next: FlowStep | null, done = false) => {
      if (done) {
        persistFlowStep(null, true)
        setFlowStep(null)
        return
      }
      if (next) {
        persistFlowStep(next)
        setFlowStep(next)
      }
    },
    [],
  )

  const handleDismissStep = useCallback(() => {
    if (flowStep === 1) {
      advanceFlow(2)
      return
    }
    if (flowStep === 2) {
      persistFlowStep(null, true)
      setFlowStep(null)
      return
    }
    if (flowStep === 3) {
      persistFlowStep(null, true)
      setFlowStep(null)
    }
  }, [advanceFlow, flowStep])

  const handleReleaseBullish = useCallback(async () => {
    if (openingTrade) return
    setOpeningTrade(true)
    try {
      const result = await openStartupFixedTrade({
        commitUsd: data.recommendedCommitUsd,
        traderPersonaId: data.starterFixPersonaId,
        fixPeriodMonths: 1,
        riskClass: "Low",
      })
      if (!result.ok) {
        toast.error(result.error, { duration: 6500 })
        return
      }
      toast.success(t("marketing.newMember.activateSuccess"), { duration: 5000 })
      const refreshedStatus = await refresh()
      if (refreshedStatus?.needsSecuritySetup ?? data.needsSecuritySetup) {
        advanceFlow(3)
      } else {
        advanceFlow(null, true)
      }
      onGoToTrading()
    } finally {
      setOpeningTrade(false)
    }
  }, [
    advanceFlow,
    data.needsSecuritySetup,
    data.recommendedCommitUsd,
    data.starterFixPersonaId,
    onGoToTrading,
    openingTrade,
    refresh,
    t,
  ])

  const handleStartTrading = useCallback(() => {
    if (!data.hasFixedTrade) {
      setFlowStep(2)
      persistFlowStep(2)
      return
    }
    onGoToTrading()
  }, [data.hasFixedTrade, onGoToTrading])

  const handleOpenSecurityFromFlow = useCallback(() => {
    persistFlowStep(null, true)
    setFlowStep(null)
    onOpenSecuritySetup()
  }, [onOpenSecuritySetup])

  if (!shouldEngage) return null

  return (
    <>
      <StartupBonusWelcomeFlow
        step={flowStep}
        amountLabel={amountLabel}
        openingTrade={openingTrade}
        onDismissStep={handleDismissStep}
        onReleaseBullish={() => void handleReleaseBullish()}
        onOpenSecuritySetup={handleOpenSecurityFromFlow}
        onOpenHowToTrade={() => setHowToOpen(true)}
      />

      <HowToTradeDialog
        open={howToOpen}
        onOpenChange={setHowToOpen}
        amountLabel={amountLabel}
        onStartTrading={() => {
          setHowToOpen(false)
          handleStartTrading()
        }}
      />
    </>
  )
}
