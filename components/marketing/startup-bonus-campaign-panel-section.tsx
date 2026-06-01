"use client"

import { StartupBonusCampaignPanel } from "@/components/marketing/startup-bonus-campaign-panel"
import { HowToTradeDialog } from "@/components/marketing/how-to-trade-dialog"
import { useStartupOnboarding } from "@/hooks/use-startup-onboarding"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useMemo, useState } from "react"

type StartupBonusCampaignPanelSectionProps = {
  onStartTrading: () => void
}

/** Container home promo strip for users with startup bonus. */
export function StartupBonusCampaignPanelSection({ onStartTrading }: StartupBonusCampaignPanelSectionProps) {
  const { formatUserMoney } = useUserPreferences()
  const { data, loading } = useStartupOnboarding(true)
  const [howToOpen, setHowToOpen] = useState(false)

  const amountLabel = useMemo(
    () => formatUserMoney(data.recommendedCommitUsd || data.startupCapitalLockedUsd),
    [data.recommendedCommitUsd, data.startupCapitalLockedUsd, formatUserMoney],
  )

  if (loading || !data.hasStartupBonus || !data.showCampaignPromo) return null

  return (
    <>
      <StartupBonusCampaignPanel
        amountLabel={amountLabel}
        hasFixedTrade={data.hasFixedTrade}
        onHowToTrade={() => setHowToOpen(true)}
        onStartTrading={onStartTrading}
      />
      <HowToTradeDialog
        open={howToOpen}
        onOpenChange={setHowToOpen}
        amountLabel={amountLabel}
        onStartTrading={() => {
          setHowToOpen(false)
          onStartTrading()
        }}
      />
    </>
  )
}
