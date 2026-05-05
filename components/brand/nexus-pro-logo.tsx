"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

export type NexusProLogoVariant = "default" | "light" | "mark"

export type NexusProLogoProps = {
  variant?: NexusProLogoVariant
  className?: string
  /** When false, decorative (e.g. watermark). */
  "aria-hidden"?: boolean
  "aria-label"?: string
}

/**
 * NEXUS PRO wordmark + tech mark (SVG). Variants: full color, light-on-dark, icon-only.
 * Export PNG: open `public/brand/nexus-pro-logo.svg` in a browser or design tool and export @2×–4×.
 */
export function NexusProLogo({
  variant = "default",
  className,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel = "NEXUS PRO",
}: NexusProLogoProps) {
  const rid = useId().replace(/:/g, "")
  const gradId = `nxp-grad-${rid}`
  const glowId = `nxp-glow-${rid}`
  const isLight = variant === "light"
  const isMark = variant === "mark"

  const gradStops = isLight ? (
    <>
      <stop offset="0%" stopColor="#f0fdfa" />
      <stop offset="45%" stopColor="#a5f3fc" />
      <stop offset="100%" stopColor="#22d3ee" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#0f7669" />
      <stop offset="45%" stopColor="#14b8a6" />
      <stop offset="100%" stopColor="#22d3ee" />
    </>
  )

  const proFill = isLight ? "#cffafe" : "#5eead4"
  const nodeAccent = isLight ? "#e0f2fe" : "#67e8f9"

  const mark = (
    <g filter={isLight ? undefined : `url(#${glowId})`}>
      <path
        d="M11 50V10M11 10L45 50M45 50V10"
        stroke={`url(#${gradId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="11" cy="10" r="2.8" fill={`url(#${gradId})`} />
      <circle cx="28" cy="30" r="2.2" fill={nodeAccent} opacity={0.95} />
      <circle cx="45" cy="50" r="2.8" fill={`url(#${gradId})`} />
    </g>
  )

  if (isMark) {
    return (
      <svg
        viewBox="0 0 56 56"
        className={cn("overflow-visible", className)}
        aria-hidden={ariaHidden ?? true}
        role="img"
        aria-label={ariaHidden ? undefined : ariaLabel}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            {gradStops}
          </linearGradient>
          {!isLight && (
            <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="1.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>
        {mark}
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 288 56"
      className={cn("overflow-visible", className)}
      aria-hidden={ariaHidden}
      role="img"
      aria-label={ariaHidden ? undefined : ariaLabel}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          {gradStops}
        </linearGradient>
        {!isLight && (
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <g transform="translate(0,2)">{mark}</g>

      <text
        x="62"
        y="38"
        fill={`url(#${gradId})`}
        style={{
          fontFamily: "var(--font-space-mono), 'Space Mono', ui-monospace, monospace",
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        NEXUS
      </text>
      <text
        x="62"
        y="52"
        fill={proFill}
        style={{
          fontFamily: "var(--font-space-mono), 'Space Mono', ui-monospace, monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.32em",
        }}
      >
        PRO
      </text>
    </svg>
  )
}
