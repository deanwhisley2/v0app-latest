"use client"

import { Download, Loader2, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import {
  useAndroidInstallPromotion,
  type AndroidInstallUiMode,
} from "@/hooks/use-android-install-promotion"
import { openDownloadsQuickAction } from "@/lib/android-install/app-update-client"
import { cn } from "@/lib/utils"

type AndroidInstallPromptProps = {
  surface: "auth" | "dashboard"
  variant?: "banner" | "card"
  freshLogin?: boolean
  freshLoginOnly?: boolean
  className?: string
}

function manualHint(mode: AndroidInstallUiMode, browser: string | null, t: (k: string) => string): string {
  if (browser === "samsung") return t("install.installApp.manualSamsung")
  if (browser === "opera") return t("install.installApp.manualOpera")
  if (mode === "manual") return t("install.installApp.manualApk")
  return t("install.installApp.manualChrome")
}

function unknownSourcesHint(browser: string | null, t: (k: string) => string): string {
  if (browser === "samsung") return t("install.installApp.unknownSourcesSamsung")
  return t("install.installApp.unknownSourcesGeneric")
}

export function AndroidInstallPrompt({
  surface,
  variant = "banner",
  freshLogin = false,
  freshLoginOnly = false,
  className,
}: AndroidInstallPromptProps) {
  const { t } = useUserPreferences()
  const promo = useAndroidInstallPromotion({ surface, freshLogin, freshLoginOnly })

  if (!promo.visible) return null

  const isOpenMode = promo.uiMode === "open"
  const isUpdate = promo.uiMode === "update"
  const busy = promo.downloadState === "checking" || promo.loadingRelease
  const showFallback =
    promo.downloadState === "failed" ||
    promo.downloadState === "unavailable" ||
    promo.downloadState === "rate_limited"

  const isInstantAppMode = !promo.apkAvailable && (promo.canNativePwaPrompt || promo.uiMode === "install")
  const title = isOpenMode
    ? t("install.installApp.openApp")
    : isUpdate
      ? t("install.installApp.update")
      : isInstantAppMode
        ? t("install.installApp.instantTitle")
        : t("install.installApp.title")
  const lead = isOpenMode
    ? t("install.installApp.alreadyInstalledHint")
    : isUpdate
      ? t("install.installApp.updateLead")
      : isInstantAppMode
        ? t("install.installApp.instantLead")
        : t("install.installApp.lead")

  const primaryLabel = isOpenMode
    ? t("install.installApp.openApp")
    : isUpdate
      ? t("install.installApp.update")
      : busy
        ? t("install.installApp.verifying")
        : t("install.installApp.install")

  const statusMsg = promo.statusKey ? t(promo.statusKey) : null
  const showUnknownSources =
    promo.downloadState === "downloading" && !promo.canNativePwaPrompt && promo.apkAvailable

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background",
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

          {!isOpenMode && variant === "card" ? (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              <li>• {t("install.installApp.benefitSpeed")}</li>
              <li>• {t("install.installApp.benefitNotify")}</li>
              <li>• {t("install.installApp.benefitTrust")}</li>
            </ul>
          ) : null}

          {(promo.uiMode === "manual" || (promo.uiMode === "install" && !promo.canNativePwaPrompt)) &&
          !showFallback ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {manualHint(promo.uiMode, promo.browser, t)}
            </p>
          ) : null}

          {showUnknownSources ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {unknownSourcesHint(promo.browser, t)}
            </p>
          ) : null}

          <p className="text-[10px] text-muted-foreground/80">{t("install.installApp.secureSource")}</p>

          {statusMsg ? (
            <p
              className={cn(
                "text-xs",
                showFallback ? "text-destructive" : "text-primary",
              )}
            >
              {statusMsg}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-0.5">
            <Button
              type="button"
              size="sm"
              className="min-h-9 touch-manipulation"
              disabled={busy}
              onClick={() => (isOpenMode ? promo.openApp() : void promo.install())}
            >
              {primaryLabel}
            </Button>

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

            {showFallback ? (
              <>
                {promo.apkAvailable ? (
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
                {promo.canNativePwaPrompt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9 touch-manipulation"
                    onClick={() => void promo.install()}
                  >
                    {t("install.installApp.installPwa")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-9 touch-manipulation text-muted-foreground"
                  onClick={promo.useWebVersion}
                >
                  {t("install.installApp.useWebVersion")}
                </Button>
              </>
            ) : null}

            {!isOpenMode && !showFallback && promo.apkAvailable && promo.canNativePwaPrompt ? (
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
