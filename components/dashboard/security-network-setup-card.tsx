"use client"

import { MobileMoneyNetworkLogo } from "@/components/brand/mobile-money-network-logo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { SECURITY_SETUP_INPUT_CLASS } from "@/lib/nexus-security-setup-field-styles"
import { NEXUS_SECURE_SHIELD_CLASS, SECURE_PIN_INPUT_PROPS } from "@/lib/security/secure-input"

type Props = {
  network: "MTN" | "Airtel"
  number: string
  onNumberChange: (v: string) => void
  accountNames: string
  onAccountNamesChange: (v: string) => void
  sameForDepositWithdraw: boolean
  onSameForDepositWithdrawChange: (v: boolean) => void
  withdrawalNumber?: string
  onWithdrawalNumberChange?: (v: string) => void
  withdrawalNames?: string
  onWithdrawalNamesChange?: (v: string) => void
}

export function SecurityNetworkSetupCard({
  network,
  number,
  onNumberChange,
  accountNames,
  onAccountNamesChange,
  sameForDepositWithdraw,
  onSameForDepositWithdrawChange,
  withdrawalNumber = "",
  onWithdrawalNumberChange,
  withdrawalNames = "",
  onWithdrawalNamesChange,
}: Props) {
  const isMtn = network === "MTN"
  const accentBorder = isMtn ? "border-[#FFCC00]/45" : "border-[#ED1C24]/40"
  const accentBg = isMtn ? "bg-[#FFCC00]/6" : "bg-[#ED1C24]/5"

  return (
    <div className={cn(NEXUS_SECURE_SHIELD_CLASS, "rounded-xl border p-3.5 sm:p-4", accentBorder, accentBg)}>
      <div className="mb-3 flex items-center gap-3">
        <MobileMoneyNetworkLogo network={network} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{network}</p>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Mobile money{sameForDepositWithdraw ? " · same line for deposits & withdrawals" : " · deposit line"}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <div>
          <Label className="text-xs font-medium text-foreground">Mobile money number</Label>
          <Input
            value={number}
            onChange={(e) => onNumberChange(e.target.value)}
            className={SECURITY_SETUP_INPUT_CLASS}
            placeholder="+256…"
            inputMode="tel"
            {...SECURE_PIN_INPUT_PROPS}
          />
        </div>
        <div>
          <Label className="text-xs font-medium text-foreground">Registered account name</Label>
          <Input
            value={accountNames}
            onChange={(e) => onAccountNamesChange(e.target.value)}
            className={SECURITY_SETUP_INPUT_CLASS}
            placeholder="e.g. RICHARD KATO"
            autoComplete="name"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2.5 touch-manipulation">
          <span className="text-xs leading-snug text-foreground">
            Use same number for deposits &amp; withdrawals
          </span>
          <Switch checked={sameForDepositWithdraw} onCheckedChange={onSameForDepositWithdrawChange} />
        </label>

        {!sameForDepositWithdraw ? (
          <div className="space-y-2 border-t border-border/50 pt-2.5">
            <p className="text-[10px] font-medium text-muted-foreground">Withdrawal-only line (optional)</p>
            <Input
              value={withdrawalNumber}
              onChange={(e) => onWithdrawalNumberChange?.(e.target.value)}
              className={SECURITY_SETUP_INPUT_CLASS}
              placeholder="+256… withdrawal"
              inputMode="tel"
              {...SECURE_PIN_INPUT_PROPS}
            />
            <Input
              value={withdrawalNames}
              onChange={(e) => onWithdrawalNamesChange?.(e.target.value)}
              className={SECURITY_SETUP_INPUT_CLASS}
              placeholder="Registered name(s) for withdrawal"
              autoComplete="name"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
