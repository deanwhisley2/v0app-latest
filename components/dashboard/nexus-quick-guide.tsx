"use client"

import { useState, type ReactNode } from "react"
import {
  BadgeCheck,
  Banknote,
  ChevronDown,
  HelpCircle,
  LineChart,
  Lock,
  Wallet,
  Waypoints,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { NexusTooltip } from "@/components/ui/NexusTooltip"
import { cn } from "@/lib/utils"

export type QuickGuideStep = {
  icon: LucideIcon
  titleKey: string
  bodyKey: string
  learnMoreKey: string
  /** Substrings in the body that should show a tooltip (matched to tooltip keys). */
  terms?: Array<{ phrase: string; tooltipKey: string }>
}

export const QUICK_START_STEPS: QuickGuideStep[] = [
  {
    icon: Wallet,
    titleKey: "guide.quickStart.step1.title",
    bodyKey: "guide.quickStart.step1.body",
    learnMoreKey: "guide.quickStart.step1.learnMore",
    terms: [
      { phrase: "Nexus Main", tooltipKey: "guide.tooltip.nexusMain" },
      { phrase: "available balance", tooltipKey: "guide.tooltip.availableBalance" },
    ],
  },
  {
    icon: Waypoints,
    titleKey: "guide.quickStart.step2.title",
    bodyKey: "guide.quickStart.step2.body",
    learnMoreKey: "guide.quickStart.step2.learnMore",
    terms: [
      { phrase: "Copy Trading", tooltipKey: "guide.tooltip.copyTrading" },
      { phrase: "Fixed Trading", tooltipKey: "guide.tooltip.fixedTrading" },
    ],
  },
  {
    icon: Lock,
    titleKey: "guide.quickStart.step3.title",
    bodyKey: "guide.quickStart.step3.body",
    learnMoreKey: "guide.quickStart.step3.learnMore",
    terms: [{ phrase: "Nexus Main", tooltipKey: "guide.tooltip.nexusMain" }],
  },
  {
    icon: LineChart,
    titleKey: "guide.quickStart.step4.title",
    bodyKey: "guide.quickStart.step4.body",
    learnMoreKey: "guide.quickStart.step4.learnMore",
  },
  {
    icon: BadgeCheck,
    titleKey: "guide.quickStart.step5.title",
    bodyKey: "guide.quickStart.step5.body",
    learnMoreKey: "guide.quickStart.step5.learnMore",
  },
  {
    icon: Banknote,
    titleKey: "guide.quickStart.step6.title",
    bodyKey: "guide.quickStart.step6.body",
    learnMoreKey: "guide.quickStart.step6.learnMore",
    terms: [{ phrase: "Nexus Main", tooltipKey: "guide.tooltip.nexusMain" }],
  },
]

type Props = {
  t: (key: string) => string
  className?: string
  /** Show expandable learn-more under each step. */
  showLearnMore?: boolean
  layout?: "grid" | "list"
}

function renderBodyWithTooltips(
  body: string,
  terms: QuickGuideStep["terms"],
  t: (key: string) => string,
) {
  if (!terms?.length) return body

  const parts: ReactNode[] = []
  let remaining = body
  let key = 0

  while (remaining.length > 0) {
    let earliest = -1
    let matched: (typeof terms)[number] | null = null
    for (const term of terms) {
      const idx = remaining.indexOf(term.phrase)
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx
        matched = term
      }
    }
    if (earliest === -1 || !matched) {
      parts.push(remaining)
      break
    }
    if (earliest > 0) parts.push(remaining.slice(0, earliest))
    parts.push(
      <NexusTooltip key={key++} content={t(matched.tooltipKey)} position="top">
        <span className="cursor-help border-b border-dotted border-primary/40 text-foreground">
          {matched.phrase}
        </span>
      </NexusTooltip>,
    )
    remaining = remaining.slice(earliest + matched.phrase.length)
  }

  return <>{parts}</>
}

export function NexusQuickGuide({
  t,
  className,
  showLearnMore = true,
  layout = "grid",
}: Props) {
  const [openLearn, setOpenLearn] = useState<Record<number, boolean>>({})

  return (
    <ol
      className={cn(
        layout === "grid"
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          : "space-y-3",
        className,
      )}
    >
      {QUICK_START_STEPS.map((step, index) => {
        const Icon = step.icon
        const learnOpen = openLearn[index] === true
        return (
          <li
            key={step.titleKey}
            className={cn(
              "rounded-xl border border-border bg-muted/35 px-3 py-2.5",
              layout === "list" ? "flex flex-col gap-2" : "flex min-h-[48px] items-start gap-2.5",
            )}
          >
            <div className="flex w-full items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  <span className="mr-1.5 text-[10px] font-bold text-primary/80">{index + 1}.</span>
                  {t(step.titleKey)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {renderBodyWithTooltips(t(step.bodyKey), step.terms, t)}
                </p>
                {showLearnMore ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-[11px] font-medium text-primary touch-manipulation"
                    aria-expanded={learnOpen}
                    onClick={() =>
                      setOpenLearn((prev) => ({ ...prev, [index]: !prev[index] }))
                    }
                  >
                    <HelpCircle className="h-3 w-3 shrink-0" aria-hidden />
                    {t("guide.quickStart.learnMore")}
                    <ChevronDown
                      className={cn("h-3 w-3 transition-transform", learnOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </div>
            </div>
            {showLearnMore && learnOpen ? (
              <p className="w-full border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                {t(step.learnMoreKey)}
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
