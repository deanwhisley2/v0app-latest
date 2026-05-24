"use client"

import { Download, Loader2, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import {
  useAndroidInstallPromotion,
} from "@/hooks/use-android-install-promotion"
import { openDownloadsQuickAction } from "@/lib/android-install/app-update-client"
import { isLightweightAndroidInstallEnabled, isPwaInstallEnabled } from "@/lib/mobile/pwa-safe-mode"
import { cn } from "@/lib/utils"

type AndroidInstallPromptProps = {
  surface: "auth" | "dashboard"
  variant?: "banner" | "card"
  freshLogin?: boolean
  freshLoginOnly?: boolean
  className?: string
}

function manualHint(browser: string | null, t: (k: string) => string): string {
  if (browser === "samsung") return t("install.installApp.manualSamsung")
  if (browser === "opera") return t("install.installApp.manualOpera")
  if (browser === "firefox") return t("install.installApp.manualFirefox")
  return t("install.installApp.manualChrome")
}

function unknownSourcesHint(browser: string | null, t: (k: string) => string): string {
  if (browser === "samsung") return t("install.installApp.unknownSourcesSamsung")
  return t("install.installApp.unknownSourcesGeneric")
}

export function AndroidInstallPrompt(props: AndroidInstallPromptProps) {
  if (!isLightweightAndroidInstallEnabled() && !isPwaInstallEnabled()) return null
  return <AndroidInstallPromptActive {...props} />
}

function AndroidInstallPromptActive({
  surface,
  variant = "banner",
  freshLogin = false,
  freshLoginOnly = false,
  className,
}: AndroidInstallPromptProps) {
  const { t } = useUserPreferences()
  const lightweight = isLightweightAndroidInstallEnabled()
  const promo = useAndroidInstallPromotion({ surface, freshLogin, freshLoginOnly })

  if (!promo.visible) return null

  const isOpenMode = promo.uiMode === "open"
  const isUpdate = promo.uiMode === "update"
  const isManualMode = promo.uiMode === "manual" || promo.primaryInstallKind === "manual"
  const busy = promo.downloadState === "checking" || promo.loadingRelease || promo.probingInstall
  const showFallback =
    promo.downloadState === "failed" ||
    promo.downloadState === "unavailable" ||
    promo.downloadState === "rate_limited"

  const title = isOpenMode
    ? t("install.installApp.openApp")
    : isUpdate
      ? t("install.installApp.update")
      : isManualMode
        ? t("install.installApp.manualTitle")
        : promo.primaryInstallKind === "pwa"
          ? t("install.installApp.title")
          : t("install.installApp.title")

  const lead = isOpenMode
    ? t("install.installApp.alreadyInstalledHint")
    : isUpdate
      ? t("install.installApp.updateLead")
      : lightweight
        ? t("install.installApp.lightweightLead")
        : isManualMode
          ? t("install.installApp.manualOnlyLead")
          : promo.primaryInstallKind === "apk"
            ? t("install.installApp.apkLead")
            : t("install.installApp.lead")

  const primaryLabel = isOpenMode
    ? t("install.installApp.openApp")
    : isUpdate
      ? promo.apkAvailable
        ? t("install.installApp.downloadApk")
        : t("install.installApp.update")
      : busy
        ? t("install.installApp.preparingInstall")
        : promo.primaryInstallKind === "apk"
          ? t("install.installApp.downloadApk")
          : t("install.installApp.install")

  const statusMsg = promo.statusKey ? t(promo.statusKey) : null
  const showUnknownSources =
    promo.downloadState === "downloading" && promo.primaryInstallKind === "apk" && promo.apkAvailable

  const showManualSteps =
    lightweight || isManualMode || (!promo.installButtonEnabled && !isOpenMode && !isUpdate)

  return (
    <div
      className={cn(
        lightweight
          ? "relative overflow-hidden border border-border/70 bg-card"
          : "relative overflow-hidden border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background",
        variant === "banner"
          ? "mx-auto w-full max-w-lg rounded-xl px-4 py-3 shadow-sm"
          : "rounded-2xl px-4 py-4",
        className,
      )}
      role="region"
      aria-label={title}
    >
      <button
        type="button"
        onClick={() => promo.dismiss()}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted/60"
        aria-label={t("install.installApp.notNow")}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isOpenMode ? (
            <Smartphone className="h-5 w-5" />
          ) : (
            <Download className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{lead}</p>

          {!isOpenMode && variant === "card" && !isManualMode ? (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              <li>• {t("install.installApp.benefitSpeed")}</li>
              <li>• {t("install.installApp.benefitNotify")}</li>
              <li>• {t("install.installApp.benefitTrust")}</li>
            </ul>
          ) : null}

          {showManualSteps ? (
            <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {manualHint(promo.browser, t)}
            </p>
          ) : null}

          {showUnknownSources ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {unknownSourcesHint(promo.browser, t)}
            </p>
          ) : null}

          <p className="text-[10px] text-muted-foreground/80">{t("install.installApp.secureSource")}</p>

          {statusMsg && !showFallback ? (
            <p className="text-xs text-primary">{statusMsg}</p>
          ) : null}

          {statusMsg && showFallback ? (
            <p className="text-xs text-muted-foreground">{statusMsg}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-0.5">
            {!isManualMode && (isOpenMode || isUpdate || promo.installButtonEnabled) ? (
              <Button
                type="button"
                size="sm"
                className="min-h-9 touch-manipulation"
                disabled={busy || (!isOpenMode && !promo.installButtonEnabled)}
                onClick={() => {
                  if (isOpenMode) {
                    promo.openApp()
                    return
                  }
                  if (isUpdate && promo.apkAvailable) {
                    void promo.downloadApk()
                    return
                  }
                  void promo.install()
                }}
              >
                {primaryLabel}
              </Button>
            ) : null}

            {promo.downloadState === "downloading" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 touch-manipulation"
                onClick={() => openDownloadsQuickAction()}
              >
                {t("install.installApp.openDownloads")}
              </Button>
            ) : null}

            {showFallback && promo.apkAvailable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 touch-manipulation"
                onClick={() => void promo.retryDownload()}
              >
                {t("install.installApp.retryDownload")}
              </Button>
            ) : null}

            {isManualMode || showFallback ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-9 touch-manipulation text-muted-foreground"
                onClick={promo.useWebVersion}
              >
                {t("install.installApp.useWebVersion")}
              </Button>
            ) : null}

            {!isOpenMode && !isManualMode && !showFallback && promo.primaryInstallKind === "pwa" && promo.apkAvailable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 touch-manipulation"
                onClick={() => void promo.downloadApk()}
              >
                {t("install.installApp.downloadApk")}
              </Button>
            ) : null}

            {!isOpenMode && !showFallback ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-9 touch-manipulation text-muted-foreground"
                onClick={() => promo.dismiss()}
              >
                {t("install.installApp.notNow")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
