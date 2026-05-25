"use client"

import {
  ChevronRight,
  ExternalLink,
  Linkedin,
  Mail,
  Brain,
  Zap,
  Shield,
  Headphones,
  BarChart3,
  Globe2,
  Activity,
  Lock,
  BadgeCheck,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { COMPANY_CONTACT, companyMessagesEn } from "@/lib/i18n/company-messages"
import { cn } from "@/lib/utils"

const MARKETS = [
  "about.market.forex",
  "about.market.commodities",
  "about.market.indices",
  "about.market.stocks",
  "about.market.digital",
] as const

const PILLARS = [
  { titleKey: "about.pillar.intelligence.title", bodyKey: "about.pillar.intelligence.body", icon: Brain },
  { titleKey: "about.pillar.friction.title", bodyKey: "about.pillar.friction.body", icon: Zap },
  { titleKey: "about.pillar.security.title", bodyKey: "about.pillar.security.body", icon: Shield },
  { titleKey: "about.pillar.support.title", bodyKey: "about.pillar.support.body", icon: Headphones },
] as const

const METRICS = [
  { labelKey: "about.metrics.traders.label", valueKey: "about.metrics.traders.value", icon: BarChart3 },
  { labelKey: "about.metrics.markets.label", valueKey: "about.metrics.markets.value", icon: Globe2 },
  { labelKey: "about.metrics.volume.label", valueKey: "about.metrics.volume.value", icon: Activity },
  { labelKey: "about.metrics.uptime.label", valueKey: "about.metrics.uptime.value", icon: Zap },
  { labelKey: "about.metrics.security.label", valueKey: "about.metrics.security.value", icon: Lock },
  { labelKey: "about.metrics.verification.label", valueKey: "about.metrics.verification.value", icon: BadgeCheck },
] as const

function t(key: string): string {
  return companyMessagesEn[key] ?? key
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function AboutCompanyPanel({ className }: { className?: string }) {
  const year = new Date().getFullYear()

  return (
    <Card className={cn("overflow-hidden border-border/90 bg-card p-0 shadow-sm", className)}>
      <div className="border-b border-border/60 bg-muted/20 px-5 py-6 sm:px-6">
        <img src="/logo.jpg" alt="Nexus Pro" className="h-14 w-14 rounded-xl border border-border/60 object-cover" />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("about.tagline")}
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Nexus Pro</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("about.positioning")}</p>
        <p className="mt-4 text-xs font-medium text-foreground/90">{t("about.marketsIntro")}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {MARKETS.map((key) => (
            <li
              key={key}
              className="rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {t(key)}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("about.infrastructure")}</p>
      </div>

      <section className="border-b border-border/50 px-5 py-5 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("about.trust.title")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PILLARS.map(({ titleKey, bodyKey, icon: Icon }) => (
            <div
              key={titleKey}
              className="rounded-xl border border-border/50 bg-muted/10 p-4"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{t(titleKey)}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border/50 px-5 py-5 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("about.metrics.title")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {METRICS.map(({ labelKey, valueKey, icon: Icon }) => (
            <div
              key={labelKey}
              className="rounded-xl border border-border/50 bg-background/40 px-3 py-3"
            >
              <Icon className="h-3.5 w-3.5 text-primary/80" aria-hidden />
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t(labelKey)}</p>
              <p className="mt-0.5 text-xs font-semibold leading-snug text-foreground">{t(valueKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border/50 px-5 py-4 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("about.executiveTitle")}</p>
        <p className="mt-2 text-sm font-semibold text-foreground">{COMPANY_CONTACT.ceoRole}</p>
        <p className="text-sm text-muted-foreground">{COMPANY_CONTACT.ceoName}</p>
        <a
          href={COMPANY_CONTACT.whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-10 items-center text-sm tabular-nums text-foreground/90 underline-offset-2 hover:underline"
        >
          {t("about.whatsappLabel")}: {COMPANY_CONTACT.whatsappDisplay}
        </a>
      </section>

      <section className="border-b border-border/50 px-5 py-4 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("about.connectTitle")}</p>
        <div className="mt-2 divide-y divide-border/40 rounded-xl border border-border/50 bg-muted/10">
          <a
            href={COMPANY_CONTACT.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-3 px-3 text-sm text-foreground/90 hover:bg-muted/30"
          >
            <XIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t("about.connect.twitter")}
            <ExternalLink className="ms-auto h-3.5 w-3.5 text-muted-foreground/50" />
          </a>
          <a
            href={COMPANY_CONTACT.linkedIn}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-3 px-3 text-sm text-foreground/90 hover:bg-muted/30"
          >
            <Linkedin className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t("about.connect.linkedin")}
            <ExternalLink className="ms-auto h-3.5 w-3.5 text-muted-foreground/50" />
          </a>
          <a
            href={`mailto:${COMPANY_CONTACT.email}?subject=Nexus%20Pro%20FX%20Inquiry`}
            className="flex min-h-11 items-center gap-3 px-3 text-sm text-foreground/90 hover:bg-muted/30"
          >
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t("about.connect.email")}
            <span className="ms-auto truncate text-xs text-muted-foreground">{COMPANY_CONTACT.email}</span>
          </a>
        </div>
      </section>

      <div className="space-y-0.5 p-2">
        <Button variant="ghost" className="h-11 w-full justify-between px-4 text-sm font-normal" asChild>
          <a href="/legal/terms">
            {t("about.legal.terms")}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
        </Button>
        <Button variant="ghost" className="h-11 w-full justify-between px-4 text-sm font-normal" asChild>
          <a href="/legal/privacy">
            {t("about.legal.privacy")}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
        </Button>
        <Button variant="ghost" className="h-11 w-full justify-between px-4 text-sm font-normal" asChild>
          <a href={`mailto:${COMPANY_CONTACT.email}?subject=Nexus%20Pro%20FX%20Support`}>
            {t("about.support")}
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        </Button>
        <Button variant="ghost" className="h-11 w-full justify-between px-4 text-sm font-normal" asChild>
          <a href={COMPANY_CONTACT.website} target="_blank" rel="noopener noreferrer">
            nexuspro.it.com
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        </Button>
      </div>

      <p className="border-t border-border/50 px-5 py-3 text-center text-[10px] text-muted-foreground">
        {t("about.version")} 2.4.1 · © {year} {t("about.rights")}
      </p>
    </Card>
  )
}
