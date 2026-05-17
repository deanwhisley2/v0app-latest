"use client"

import { cn } from "@/lib/utils"

type RiskLevel = "Low" | "Medium" | "High" | string

function hashHue(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
  return 210 + (h % 28)
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
  Low: "from-slate-400/70 to-slate-500/30",
  Medium: "from-slate-500/80 to-slate-600/35",
  High: "from-slate-600/85 to-slate-700/40",
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
        className="flex h-full w-full items-center justify-center rounded-full font-semibold tracking-tight text-slate-100 shadow-inner"
        style={{
          background: `linear-gradient(160deg, hsl(${hue} 18% 28%) 0%, hsl(${hue} 22% 18%) 100%)`,
        }}
      >
        {label}
      </span>
    </span>
  )
}
