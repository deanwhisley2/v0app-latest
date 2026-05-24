"use client"

import { Download, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import {
  useAndroidInstallPromotion,
  type AndroidInstallUiMode,
} from "@/hooks/use-android-install-promotion"
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
  const isManual = promo.uiMode === "manual"
  const title = isOpenMode
    ? t("install.installApp.openApp")
    : isUpdate
      ? t("install.installApp.update")
      : t("install.installApp.title")
  const lead = isOpenMode
    ? t("install.installApp.alreadyInstalledHint")
    : isUpdate
      ? t("install.installApp.updateLead")
      : t("install.installApp.lead")

  const primaryLabel = isOpenMode
    ? t("install.installApp.openApp")
    : isUpdate
      ? t("install.installApp.update")
      : promo.canNativePwaPrompt
        ? t("install.installApp.install")
        : isManual
          ? t("install.installApp.downloadApk")
          : t("install.installApp.installPwa")

  const onPrimary = () => {
    if (isOpenMode) promo.openApp()
    else if (isManual && !promo.canNativePwaPrompt) promo.downloadApk()
    else void promo.install()
  }

  const statusMsg =
    promo.statusMessage === "download"
      ? t("install.installApp.downloadStarted")
      : promo.statusMessage === "install"
        ? t("install.installApp.installStarted")
        : promo.loadingRelease
          ? t("install.installApp.verifying")
          : null

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
        onClick={() => promo.dismiss(surface === "auth")}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted/60"
        aria-label={t("install.installApp.notNow")}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {isOpenMode ? <Smartphone className="h-5 w-5" /> : <Download className="h-5 w-5" />}
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

          {(isManual || promo.uiMode === "install") && !promo.canNativePwaPrompt ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {manualHint(promo.uiMode, promo.browser, t)}
            </p>
          ) : null}

          <p className="text-[10px] text-muted-foreground/80">{t("install.installApp.secureSource")}</p>

          {statusMsg ? <p className="text-xs text-primary">{statusMsg}</p> : null}

          <div className="flex flex-wrap gap-2 pt-0.5">
            <Button type="button" size="sm" className="min-h-9 touch-manipulation" onClick={onPrimary}>
              {primaryLabel}
            </Button>
            {!isOpenMode && promo.canNativePwaPrompt && promo.release?.apkUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 touch-manipulation"
                onClick={promo.downloadApk}
              >
                {t("install.installApp.downloadApk")}
              </Button>
            ) : null}
            {!isOpenMode ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-9 touch-manipulation text-muted-foreground"
                onClick={() => promo.dismiss(surface === "auth")}
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
