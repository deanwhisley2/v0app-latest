"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  PAYMENT_NETWORK_LABEL,
  PAYMENT_NETWORK_LOGO,
  type PaymentNetworkKey,
} from "@/lib/payment-network-brand"

type Props = {
  network: PaymentNetworkKey | "combined_local" | null
  className?: string
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
}

const SIZE_PX = { sm: 40, md: 56, lg: 72 } as const

/**
 * Single-network logo for receipts, payment cards, and history.
 * `combined_local` is ONLY for rail-selection panels (MTN + Airtel pickers).
 */
export function PaymentNetworkLogo({ network, className, size = "md", showLabel = false }: Props) {
  const px = SIZE_PX[size]

  if (network === "combined_local") {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <PaymentNetworkLogo network="MTN" size={size} />
        <span className="text-[10px] text-muted-foreground/60" aria-hidden>
          |
        </span>
        <PaymentNetworkLogo network="Airtel" size={size} />
      </div>
    )
  }

  if (!network) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25",
          className,
        )}
        style={{ width: px, height: px }}
        aria-hidden
      >
        <span className="text-lg font-bold text-primary">N</span>
      </div>
    )
  }

  const src = PAYMENT_NETWORK_LOGO[network]
  const label = PAYMENT_NETWORK_LABEL[network]

  if (network === "MPesa") {
    return (
      <div className={cn("flex flex-col items-center gap-1", className)}>
        <div
          className="flex shrink-0 items-center justify-center rounded-xl bg-[#39B54A]/15 ring-1 ring-[#39B54A]/30"
          style={{ width: px, height: px }}
        >
          <span className="text-[10px] font-black text-[#39B54A]">M-PESA</span>
        </div>
        {showLabel ? <span className="text-[10px] font-medium text-muted-foreground">{label}</span> : null}
      </div>
    )
  }

  if (!src) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-border/60",
          className,
        )}
        style={{ width: px, height: px }}
      >
        <span className="text-xs font-semibold text-muted-foreground">{label.slice(0, 4)}</span>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <Image
        src={src}
        alt={label}
        width={px}
        height={px}
        className="shrink-0 rounded-xl object-cover ring-1 ring-border/40"
        unoptimized
      />
      {showLabel ? <span className="text-[10px] font-medium text-muted-foreground">{label}</span> : null}
    </div>
  )
}

/** @deprecated Use PaymentNetworkLogo — kept for existing imports. */
export function MobileMoneyNetworkLogo({
  network,
  className,
  size = "md",
}: {
  network: "MTN" | "Airtel"
  className?: string
  size?: "sm" | "md"
}) {
  return <PaymentNetworkLogo network={network} className={className} size={size} />
}
