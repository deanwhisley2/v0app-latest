"use client"

import { NexusProLogo } from "@/components/brand/nexus-pro-logo"

type Props = {
  tillNumber: string
  businessName: string
  className?: string
}

/** M-PESA Buy Goods till sticker — Kenya corridor. */
export function KenyaMpesaTillCard({ tillNumber, businessName, className }: Props) {
  return (
    <div
      className={
        className ??
        "overflow-hidden rounded-xl border-2 border-[#39B54A]/60 bg-gradient-to-b from-[#39B54A] to-[#2d9a3f] text-white shadow-md"
      }
    >
      <div className="bg-[#39B54A] px-3 py-2 text-center">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em]">Lipa na M-PESA</p>
      </div>
      <div className="space-y-2 bg-white px-4 py-4 text-center text-[#1a1a1a]">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#39B54A]">Buy Goods Till Number</p>
        <p className="font-mono text-2xl font-extrabold tracking-tight text-[#39B54A]">{tillNumber}</p>
        <p className="text-sm font-semibold">{businessName}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0A0F1C]/90 ring-1 ring-[#39B54A]/40">
            <NexusProLogo className="h-6 w-6" variant="mark" aria-hidden />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">Nexus Pro</span>
        </div>
      </div>
      <p className="bg-[#2d9a3f] px-3 py-2 text-center text-[10px] leading-snug text-white/95">
        Pay via M-PESA App or dial *126#
      </p>
    </div>
  )
}
