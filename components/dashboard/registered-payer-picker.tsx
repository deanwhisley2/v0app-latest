"use client"

import { PaymentNetworkLogo } from "@/components/brand/payment-network-logo"
import type { FundPayerSource } from "@/lib/client/fund-payer-from-profile"
import type { RegisteredPayoutOption } from "@/lib/nexus-security-profile-types"
import { cn } from "@/lib/utils"

type Props = {
  options: RegisteredPayoutOption[]
  selectedSource: FundPayerSource
  onSelect: (opt: RegisteredPayoutOption) => void
  t: (key: string) => string
}

/** Tap-to-select registered mobile-money lines — no manual re-entry. */
export function RegisteredPayerPicker({ options, selectedSource, onSelect, t }: Props) {
  if (options.length === 0) return null

  const network = options[0]?.network

  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-center gap-2.5">
        {network ? <PaymentNetworkLogo network={network} size="sm" /> : null}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("funding.registeredNumbersTitle")}
        </p>
      </div>
      <ul className="space-y-1.5" role="radiogroup" aria-label={t("funding.registeredNumbersTitle")}>
        {options.map((opt) => {
          const active = selectedSource === opt.id
          return (
            <li key={opt.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(opt)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left touch-manipulation",
                  active
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/70 bg-background hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-primary" : "border-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm text-foreground">{opt.numberMasked}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{opt.accountNames ?? "—"}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-[10px] leading-snug text-muted-foreground">{t("funding.registeredNumbersHint")}</p>
    </div>
  )
}
