"use client"

import { ChevronRight, Link2, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  t: (key: string) => string
  connectedCount: number
  onManageConnections?: () => void
  className?: string
}

/** Exchange / execution infrastructure onboarding — institutional tone, display only. */
export function WalletInfrastructureCard({
  t,
  connectedCount,
  onManageConnections,
  className,
}: Props) {
  const linked = connectedCount > 0

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/90 bg-gradient-to-br from-muted/30 via-card to-card p-4 shadow-sm sm:p-5",
        className
      )}
      aria-label={t("home.walletInfra.title")}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
          <Link2 className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("home.walletInfra.eyebrow")}
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {linked ? t("home.walletInfra.titleLinked") : t("home.walletInfra.title")}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {linked ? t("home.walletInfra.bodyLinked").replace("{{count}}", String(connectedCount)) : t("home.walletInfra.body")}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Shield className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
            {t("home.walletInfra.trustLine")}
          </p>
        </div>
      </div>
      {onManageConnections ? (
        <Button
          type="button"
          variant={linked ? "outline" : "default"}
          size="lg"
          className="mt-4 min-h-11 w-full font-semibold transition-colors sm:w-auto"
          onClick={onManageConnections}
        >
          {linked ? t("home.walletInfra.ctaManage") : t("home.walletInfra.ctaConnect")}
          <ChevronRight className="ms-1 h-4 w-4 opacity-70" aria-hidden />
        </Button>
      ) : null}
    </section>
  )
}
