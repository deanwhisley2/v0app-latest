"use client"

import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { openDownloadsQuickAction } from "@/lib/android-install/app-update-client"
import { useAndroidAppUpdate } from "@/hooks/use-android-app-update"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

export function AndroidAppUpdateBanner() {
  if (isPwaSafeMode()) return null
  return <AndroidAppUpdateBannerActive />
}

function AndroidAppUpdateBannerActive() {
  const { t } = useUserPreferences()
  const update = useAndroidAppUpdate()

  if (!update.visible || !update.check) return null

  const title = update.forceUpdate
    ? t("install.update.forceTitle")
    : update.downloadReady
      ? t("install.update.readyTitle")
      : t("install.update.availableTitle")

  const lead = update.downloadReady
    ? t("install.update.readyLead")
    : t("install.update.availableLead").replace("{{version}}", update.check.version)

  return (
    <div
      className="mx-auto max-w-[1600px] px-4 pt-2 max-md:pt-1"
      role="region"
      aria-label={title}
    >
      <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{lead}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {update.downloadReady ? (
            <Button
              type="button"
              size="sm"
              className="min-h-9 touch-manipulation"
              onClick={() => openDownloadsQuickAction()}
            >
              {t("install.update.openDownloads")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="min-h-9 touch-manipulation"
              disabled={update.downloading}
              onClick={() => void update.applyUpdate()}
            >
              {update.downloading ? (
                <>
                  <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                  {t("install.update.downloading")}
                </>
              ) : (
                <>
                  <Download className="me-1.5 h-4 w-4" />
                  {t("install.update.downloadNow")}
                </>
              )}
            </Button>
          )}
          {!update.forceUpdate ? (
            <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={update.defer}>
              {t("install.installApp.notNow")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
