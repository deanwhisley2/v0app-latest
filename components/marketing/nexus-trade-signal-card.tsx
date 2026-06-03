"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { BarChart3, Bot, Copy, Shield, Sparkles } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import {
  buildDashboardTradeCodeUrl,
  buildLoginWithTradeCodeReturn,
  type TradeSignalPublicView,
} from "@/lib/nexus-bot/trade-signal-share"
import { brandAsset } from "@/lib/site-branding"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type NexusTradeSignalCardProps = {
  signal: TradeSignalPublicView
  className?: string
}

export function NexusTradeSignalCard({ signal, className }: NexusTradeSignalCardProps) {
  const { user, isGuestSession, isLoading } = useAuth()
  const [copied, setCopied] = useState(false)
  const isActive = signal.state === "active"

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(signal.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      /* ignore */
    }
  }, [signal.code])

  const openHref =
    !isLoading && user && !isGuestSession
      ? buildDashboardTradeCodeUrl(signal.code)
      : buildLoginWithTradeCodeReturn(signal.code)

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-[#0b1220] via-[#070a12] to-[#05070d] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_70%)]"
        aria-hidden
      />

      <header className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src={brandAsset("/brand/nexus-pro-logo-light.svg")}
            alt="Nexus Pro"
            width={140}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/90">Trade Signal</p>
          {signal.sessionLabel ? (
            <p className="mt-1 text-sm font-medium text-foreground">{signal.sessionLabel}</p>
          ) : null}
        </div>
      </header>

      <div className="relative mt-8 text-center">
        {isActive && signal.statusLabel ? (
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {signal.statusLabel}
          </p>
        ) : null}

        <p
          className={cn(
            "font-mono text-3xl font-bold tracking-[0.12em] sm:text-4xl",
            isActive
              ? "text-primary drop-shadow-[0_0_24px_rgba(16,185,129,0.45)]"
              : "text-muted-foreground",
          )}
        >
          {signal.code}
        </p>

        {isActive ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-success">
            <Shield className="h-4 w-4 shrink-0" aria-hidden />
            Verified Nexus Signal
          </p>
        ) : (
          <div className="mt-6 space-y-2">
            <p className="text-lg font-semibold text-foreground">{signal.headline}</p>
            <p className="text-sm text-muted-foreground">{signal.detail}</p>
          </div>
        )}
      </div>

      {isActive ? (
        <>
          <div className="relative mt-8 space-y-3">
            <Button
              type="button"
              className="min-h-[52px] w-full touch-manipulation text-base font-semibold"
              onClick={() => void copyCode()}
            >
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              {copied ? "Trade code copied" : "Copy Trade Code"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {copied ? signal.copyHint : "One tap to copy · paste into Nexus Bot"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-[48px] w-full touch-manipulation border-primary/30 bg-primary/5"
              asChild
            >
              <Link href={openHref}>Open Nexus Pro</Link>
            </Button>
          </div>

          <p className="relative mt-6 text-center text-sm text-muted-foreground">{signal.detail}</p>
        </>
      ) : null}

      <footer className="relative mt-8 grid gap-2 border-t border-border/40 pt-5 text-xs text-muted-foreground sm:grid-cols-3">
        <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start">
          <Shield className="h-3.5 w-3.5 text-primary" aria-hidden />
          Verified Signal
        </span>
        <span className="inline-flex items-center justify-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-primary" aria-hidden />
          Nexus Bot Compatible
        </span>
        <span className="inline-flex items-center justify-center gap-1.5 sm:justify-end">
          <BarChart3 className="h-3.5 w-3.5 text-primary" aria-hidden />
          Trade Allocation Session
        </span>
      </footer>
    </div>
  )
}
