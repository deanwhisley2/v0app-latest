"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bell, Compass, Gift, Info, Landmark, Shield, TrendingUp, Zap, Trash2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useNexusNotifications, type NexusNotificationItem, type NexusNotificationType } from "@/contexts/NexusNotificationsContext"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"

const PENDING_KEY = "nexus_pending_nav"

const icon = (type: NexusNotificationType) => {
  switch (type) {
    case "price":
      return <TrendingUp className="h-4 w-4 text-success" />
    case "trade":
      return <Zap className="h-4 w-4 text-primary" />
    case "security":
      return <Shield className="h-4 w-4 text-warning" />
    case "promo":
      return <Gift className="h-4 w-4 text-accent" />
    case "system":
      return <Info className="h-4 w-4 text-muted-foreground" />
    case "analysis":
      return <Compass className="h-4 w-4 text-cyan-400" />
    case "financial":
      return <Landmark className="h-4 w-4 text-emerald-400" />
  }
}

const border = (type: NexusNotificationType) => {
  switch (type) {
    case "price":
      return "border-l-success"
    case "trade":
      return "border-l-primary"
    case "security":
      return "border-l-warning"
    case "promo":
      return "border-l-accent"
    case "system":
      return "border-l-muted-foreground"
    case "analysis":
      return "border-l-cyan-400"
    case "financial":
      return "border-l-emerald-400"
  }
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export default function NotificationsHistoryPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isGuestSession } = useAuth()
  const { inbox, history, markRead, deleteFromHistory, clearHistory } = useNexusNotifications()

  useEffect(() => {
    if (isGuestSession) return
    if (!authLoading && !user) {
      router.replace("/auth/login")
    }
  }, [authLoading, user, isGuestSession, router])

  const merged = useMemo(() => {
    const map = new Map<string, NexusNotificationItem>()
    for (const n of [...inbox, ...history]) map.set(n.id, n)
    return [...map.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [inbox, history])

  const visibleMerged = useMemo(() => merged.slice(0, listLimit), [merged, listLimit])

  const openLinked = (n: NexusNotificationItem) => {
    markRead(n.id)
    if (!n.nav || n.nav.kind === "detail") return
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(n.nav as NexusNotificationNav))
    } catch {
      /* ignore */
    }
    router.push("/dashboard")
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notification history</h1>
            <p className="text-sm text-muted-foreground">
              Inbox and archived items on this device ({merged.length} total
              {merged.length > visibleMerged.length ? `, showing ${visibleMerged.length}` : ""})
            </p>
          </div>
          <button
            type="button"
            onClick={clearHistory}
            className="ml-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear history
          </button>
        </div>

        <Card className="divide-y divide-border border-border">
          {merged.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <>
              {visibleMerged.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "flex w-full gap-3 border-l-4 p-4 text-left transition-colors hover:bg-muted/40 [content-visibility:auto] [contain-intrinsic-size:120px_1px]",
                  border(n.type),
                  !n.read && "bg-primary/[0.04]"
                )}
              >
                <button
                  type="button"
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"
                  onClick={() => {
                    if (n.nav && n.nav.kind !== "detail") openLinked(n)
                    else markRead(n.id)
                  }}
                >
                  {icon(n.type)}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (n.nav && n.nav.kind !== "detail") openLinked(n)
                      else markRead(n.id)
                    }}
                    className="text-left"
                  >
                    <p className="font-semibold text-foreground">{n.title}</p>
                  </button>
                  <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground/80">{formatWhen(n.timestamp)}</p>
                  {n.nav && n.nav.kind !== "detail" && (
                    <p className="mt-1 text-xs font-medium text-primary">Tap to open linked screen</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteFromHistory(n.id)}
                  className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted"
                  aria-label="Delete notification"
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            ))}
              {merged.length > visibleMerged.length ? (
                <div className="p-4 text-center">
                  <button
                    type="button"
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary hover:bg-muted/50"
                    onClick={() => setListLimit((x) => x + 100)}
                  >
                    Load more ({merged.length - visibleMerged.length} remaining)
                  </button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
