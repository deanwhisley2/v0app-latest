"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { NexusAuthBrand } from "@/components/auth/nexus-auth-brand"
import { AuthTrustStrip } from "@/components/auth/auth-trust-strip"
import { getAuthMessages, isRtlAuthLanguage } from "@/lib/i18n/auth-messages"
import type { AppLanguage } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  language?: AppLanguage
  /** Logo + wordmark above the card (off for login — copy-only header). */
  showBrand?: boolean
  showTrustStrip?: boolean
  footer?: ReactNode
}

/**
 * Mobile-first auth shell: single scroll container, safe-area padding, RTL-ready.
 */
export function AuthLayoutShell({
  children,
  language = "en",
  showBrand = true,
  showTrustStrip = true,
  footer,
}: Props) {
  const t = getAuthMessages(language)
  const rtl = isRtlAuthLanguage(language)

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className="min-h-[100dvh] bg-background"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(6.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary)/0.12),transparent_55%)]"
        aria-hidden
      />
      <div className="mx-auto flex w-full max-w-md flex-col px-4 py-4 sm:px-5">
        {showBrand ? <NexusAuthBrand className="mb-5" /> : null}
        {showTrustStrip ? <AuthTrustStrip language={language} className="mb-5" /> : null}
        <div
          className={cn(
            "rounded-2xl border border-border/90 bg-card/95 p-5 shadow-xl shadow-black/10 backdrop-blur-sm sm:p-6",
          )}
        >
          {children}
        </div>
        {footer ?? (
          <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-[11px] text-muted-foreground">
            <Link href="/legal/terms" className="min-h-[44px] inline-flex items-center hover:text-foreground">
              {t.footer.terms}
            </Link>
            <Link href="/legal/privacy" className="min-h-[44px] inline-flex items-center hover:text-foreground">
              {t.footer.privacy}
            </Link>
            <Link href="/auth/recovery" className="min-h-[44px] inline-flex items-center hover:text-foreground">
              {t.footer.support}
            </Link>
          </footer>
        )}
      </div>
    </div>
  )
}
