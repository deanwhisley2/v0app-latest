"use client"

import { cn } from "@/lib/utils"

export type NetworkBadgeKey = "MTN" | "Airtel" | "MPesa" | "USDT" | "BANK"

type Props = {
  network: NetworkBadgeKey
  className?: string
  size?: "sm" | "md"
}

const SIZE = { sm: "h-8 w-8 text-[9px]", md: "h-10 w-10 text-[10px]" } as const

/** Zero-asset inline network badges for payment gateway rails. */
export function PaymentNetworkBadge({ network, className, size = "md" }: Props) {
  const box = cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-black leading-none ring-1",
    SIZE[size],
    className,
  )

  if (network === "MTN") {
    return (
      <span className={cn(box, "bg-[#FFCC00]/20 text-[#FFCC00] ring-[#FFCC00]/40")} aria-label="MTN">
        MTN
      </span>
    )
  }
  if (network === "Airtel") {
    return (
      <span className={cn(box, "bg-[#E4002B]/15 text-[#FF6B6B] ring-[#E4002B]/35")} aria-label="Airtel">
        AT
      </span>
    )
  }
  if (network === "MPesa") {
    return (
      <span className={cn(box, "bg-[#39B54A]/15 text-[#39B54A] ring-[#39B54A]/35")} aria-label="M-Pesa">
        MP
      </span>
    )
  }
  if (network === "USDT") {
    return (
      <span className={cn(box, "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30")} aria-label="USDT TRC20">
        ₮
      </span>
    )
  }
  return (
    <span className={cn(box, "bg-zinc-500/10 text-zinc-300 ring-white/15")} aria-label="Bank">
      BK
    </span>
  )
}
