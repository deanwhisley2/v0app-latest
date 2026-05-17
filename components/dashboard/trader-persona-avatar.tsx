"use client"

import { cn } from "@/lib/utils"

type RiskLevel = "Low" | "Medium" | "High" | string

function hashHue(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
  return h % 360
}

function initialsFrom(name: string, fallback: string): string {
  const clean = (fallback || name).trim()
  if (clean.length <= 3 && clean === clean.toUpperCase()) return clean.slice(0, 2)
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  return (name.trim().slice(0, 2) || "NX").toUpperCase()
}

const RISK_RING: Record<string, string> = {
  Low: "from-emerald-500/80 to-emerald-600/40",
  Medium: "from-amber-500/80 to-amber-600/40",
  High: "from-rose-500/80 to-rose-600/40",
}

type TraderPersonaAvatarProps = {
  name: string
  initials: string
  riskLevel?: RiskLevel
  size?: "sm" | "md" | "lg"
  className?: string
}

const SIZE = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const

export function TraderPersonaAvatar({
  name,
  initials,
  riskLevel = "Medium",
  size = "md",
  className,
}: TraderPersonaAvatarProps) {
  const label = initialsFrom(name, initials)
  const hue = hashHue(name || label)
  const ring = RISK_RING[riskLevel] ?? RISK_RING.Medium

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 rounded-full bg-gradient-to-br p-[2px]",
        ring,
        SIZE[size],
        className
      )}
      title={name}
      role="img"
      aria-label={`${name} desk`}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-semibold tracking-tight text-white shadow-inner"
        style={{
          background: `linear-gradient(145deg, hsl(${hue} 42% 32%) 0%, hsl(${hue} 48% 22%) 100%)`,
        }}
      >
        {label}
      </span>
    </span>
  )
}
