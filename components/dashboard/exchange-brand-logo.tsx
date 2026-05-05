"use client"

import { Icon } from "@iconify/react"
import { cn } from "@/lib/utils"

/** Simple Icons via Iconify (https://iconify.design / https://simpleicons.org) */
const ICONIFY_ICON: Record<string, string> = {
  binance: "simple-icons:binance",
  bybit: "simple-icons:bybit",
  bitget: "simple-icons:bitget",
  kucoin: "simple-icons:kucoin",
  blofin: "simple-icons:blofin",
  okx: "simple-icons:okx",
  mexc: "simple-icons:mexc",
  gateio: "simple-icons:gateio",
}

type ExchangeBrandLogoProps = {
  exchangeId: string
  label: string
  className?: string
}

export function ExchangeBrandLogo({ exchangeId, label, className }: ExchangeBrandLogoProps) {
  const icon = ICONIFY_ICON[exchangeId] ?? "simple-icons:question"
  const isBinance = exchangeId === "binance"
  const isKucoin = exchangeId === "kucoin"

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full", className)}
    >
      {isBinance ? (
        <span className="flex h-full w-full items-center justify-center rounded-md bg-[#F0B90B] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-amber-950/25 [&>svg]:h-full [&>svg]:w-full">
          <Icon icon={icon} aria-hidden />
        </span>
      ) : isKucoin ? (
        <span className="flex h-full w-full items-center justify-center rounded-md bg-[#23B289] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] ring-1 ring-emerald-950/30 [&>svg]:h-full [&>svg]:w-full">
          <Icon icon={icon} aria-hidden />
        </span>
      ) : (
        <Icon icon={icon} aria-hidden />
      )}
    </span>
  )
}
