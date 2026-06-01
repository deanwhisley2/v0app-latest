"use client"

import { TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { cn } from "@/lib/utils"

const STEP_KEYS = [
  "marketing.newMember.howToTradeStep1",
  "marketing.newMember.howToTradeStep2",
  "marketing.newMember.howToTradeStep3",
  "marketing.newMember.howToTradeStep4",
] as const

type HowToTradeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartTrading: () => void
  amountLabel?: string
}

export function HowToTradeDialog({
  open,
  onOpenChange,
  onStartTrading,
  amountLabel,
}: HowToTradeDialogProps) {
  const { t } = useUserPreferences()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[min(92vh,720px)] gap-0 overflow-hidden border-primary/25 p-0 sm:max-w-md",
          "bg-gradient-to-b from-card via-card to-background",
        )}
      >
        <div className="border-b border-border/80 bg-primary/5 px-4 py-4 sm:px-6">
          <DialogHeader className="gap-2 text-left">
            <p className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <TrendingUp className="h-3 w-3" aria-hidden />
              {t("marketing.newMember.howToTradeBadge")}
            </p>
            <DialogTitle className="text-base font-semibold sm:text-lg">
              {t("marketing.newMember.howToTradeTitle")}
            </DialogTitle>
            <DialogDescription className="text-left text-xs sm:text-sm">
              {t("marketing.newMember.howToTradeLead")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-none sm:px-6">
          {amountLabel ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-foreground">
              {t("marketing.newMember.howToTradeBalance").replace("{{amount}}", amountLabel)}
            </p>
          ) : null}
          <ol className="space-y-3">
            {STEP_KEYS.map((key, i) => (
              <li key={key} className="flex gap-3 text-sm text-foreground">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="leading-relaxed">{t(key)}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("marketing.newMember.howToTradeEncourage")}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-border/80 bg-muted/20 px-4 py-4 sm:px-6">
          <Button
            type="button"
            className="w-full touch-manipulation bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => {
              onOpenChange(false)
              onStartTrading()
            }}
          >
            {t("marketing.newMember.howToTradeCta")}
          </Button>
          <Button type="button" variant="ghost" className="w-full touch-manipulation" onClick={() => onOpenChange(false)}>
            {t("marketing.newMember.howToTradeLater")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
