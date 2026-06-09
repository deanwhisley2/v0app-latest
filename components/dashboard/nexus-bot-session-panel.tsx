"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { FixedTradeSimulation } from "@/components/dashboard/fixed-trade-simulation"
import {
  sessionActiveStatusLabel,
  sessionProgressMeterBlocks,
  sessionProgressPct,
  visibleSessionActivities,
} from "@/lib/nexus-bot/session-earnings-ux"
import { TRADE_SESSION_CANCELLABLE_STATUSES } from "@/lib/nexus-bot/user-session-messaging"
import { cn } from "@/lib/utils"

export type NexusBotSessionPanelSession = {
  id: string
  stake_usd: number
  status?: string
  headline?: string
  detail?: string
  session_start_at?: string | null
  session_end_at?: string | null
  session_progress_pct?: number
  earnings_withdrawable?: boolean
  profit_released_usd?: number
}

type Props = {
  session: NexusBotSessionPanelSession
  formatMoney: (usd: number) => string
  onCancel?: () => void
  cancelBusy?: boolean
}

export function NexusBotSessionPanel({ session, formatMoney, onCancel, cancelBusy }: Props) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const progressPct = useMemo(() => {
    void tick
    if (typeof session.session_progress_pct === "number") {
      return Math.min(100, Math.max(0, session.session_progress_pct))
    }
    return sessionProgressPct({
      startAt: session.session_start_at,
      endAt: session.session_end_at,
    })
  }, [session.session_end_at, session.session_progress_pct, session.session_start_at, tick])

  const activities = useMemo(() => visibleSessionActivities(progressPct), [progressPct])
  const meter = useMemo(() => sessionProgressMeterBlocks(progressPct), [progressPct])
  const statusLabel = useMemo(() => sessionActiveStatusLabel(progressPct), [progressPct])

  const isPreStart = (TRADE_SESSION_CANCELLABLE_STATUSES as readonly string[]).includes(
    session.status ?? "",
  )
  const isLive =
    !isPreStart && !["booked", "ready", "pending"].includes(session.status ?? "")

  const canCancel = useMemo(() => {
    void tick
    if (!onCancel || !isPreStart) return false
    const startAt = session.session_start_at
    if (!startAt) return true
    return Date.now() < new Date(startAt).getTime()
  }, [isPreStart, onCancel, session.session_start_at, tick])
  const showReleased =
    session.earnings_withdrawable && Number(session.profit_released_usd ?? 0) > 0

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Allocation {formatMoney(Number(session.stake_usd))}
      </p>

      {showReleased ? (
        <p className="mt-2 text-sm">
          Released earnings{" "}
          <span className="font-mono font-semibold text-success">
            +{formatMoney(Number(session.profit_released_usd))}
          </span>
          <span className="block text-xs text-muted-foreground">
            Credited to your Pocket balance
          </span>
        </p>
      ) : isLive ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm font-medium text-foreground">{statusLabel}</p>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Session progress
            </p>
            <p
              className="mt-1 font-mono text-xs tabular-nums text-foreground"
              aria-label={`${progressPct}%`}
            >
              {meter.label}
            </p>
          </div>
          <ul className="space-y-1.5" aria-label="Trade session activity">
            {activities.map((label) => (
              <li
                key={label}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success/80" aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isPreStart ? (
        <div className="mt-2 space-y-2">
          <p className="flex items-center gap-2 text-sm text-warning">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Trade booked successfully · Waiting for session start
          </p>
          {canCancel ? (
            <button
              type="button"
              onClick={() => onCancel?.()}
              disabled={cancelBusy}
              className={cn(
                "border border-red-500/30 text-red-400 hover:bg-red-500/10 transition rounded-xl px-3 py-1.5 text-sm",
                "touch-manipulation disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {cancelBusy ? "Cancelling…" : "Cancel Trade"}
            </button>
          ) : null}
        </div>
      ) : null}

      {isLive ? (
        <div className={cn("mt-4")}>
          <FixedTradeSimulation
            sessionId={session.id}
            deskSalt={session.id}
            sessionStartAt={session.session_start_at}
            sessionEndAt={session.session_end_at}
          />
        </div>
      ) : null}
    </>
  )
}
