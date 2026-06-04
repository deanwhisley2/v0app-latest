"use client"

import { useEffect, useMemo, useState } from "react"
import { StartupBonusCampaignPanel } from "@/components/marketing/startup-bonus-campaign-panel"
import { HowToTradeDialog } from "@/components/marketing/how-to-trade-dialog"
import { useStartupOnboarding } from "@/hooks/use-startup-onboarding"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import {
  dismissLiveCampaignBanner,
  getStoredLiveCampaignRevision,
  isLiveCampaignDismissed,
  LIVE_CAMPAIGN_DISMISS_KEY,
  storeLiveCampaignRevision,
} from "@/lib/marketing/campaign-session-dismiss"

type StartupBonusCampaignPanelSectionProps = {
  onStartTrading: () => void
}

/** Container home promo strip for users with startup bonus. */
export function StartupBonusCampaignPanelSection({ onStartTrading }: StartupBonusCampaignPanelSectionProps) {
  const { formatUserMoney } = useUserPreferences()
  const { data, loading } = useStartupOnboarding(true)
  const [howToOpen, setHowToOpen] = useState(false)
  const [dismissed, setDismissed] = useState(() => isLiveCampaignDismissed())

  const amountLabel = useMemo(
    () => formatUserMoney(data.recommendedCommitUsd || data.startupCapitalLockedUsd),
    [data.recommendedCommitUsd, data.startupCapitalLockedUsd, formatUserMoney],
  )

  useEffect(() => {
    if (!data.campaignContentRevision) return
    const stored = getStoredLiveCampaignRevision()
    if (stored && stored !== data.campaignContentRevision) {
      try {
        sessionStorage.removeItem(LIVE_CAMPAIGN_DISMISS_KEY)
      } catch {
        /* ignore */
      }
      setDismissed(false)
    }
    storeLiveCampaignRevision(data.campaignContentRevision)
  }, [data.campaignContentRevision])

  if (loading || !data.hasStartupBonus || !data.showCampaignPromo || dismissed) return null

  return (
    <>
      <StartupBonusCampaignPanel
        amountLabel={amountLabel}
        hasFixedTrade={data.hasFixedTrade}
        onHowToTrade={() => setHowToOpen(true)}
        onStartTrading={onStartTrading}
        onDismiss={() => {
          dismissLiveCampaignBanner()
          setDismissed(true)
        }}
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
