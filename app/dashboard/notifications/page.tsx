"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bell, Gift, Info, Shield, TrendingUp, Zap } from "lucide-react"
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
  }
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export default function NotificationsHistoryPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isGuestSession } = useAuth()
  const { inbox, history, markRead } = useNexusNotifications()

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
            <p className="text-sm text-muted-foreground">Inbox and archived items on this device ({merged.length} total)</p>
          </div>
        </div>

        <Card className="divide-y divide-border border-border">
          {merged.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            merged.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (n.nav && n.nav.kind !== "detail") openLinked(n)
                  else markRead(n.id)
                }}
                className={cn(
                  "flex w-full gap-3 border-l-4 p-4 text-left transition-colors hover:bg-muted/40",
                  border(n.type),
                  !n.read && "bg-primary/[0.04]"
                )}
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  {icon(n.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{n.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground/80">{formatWhen(n.timestamp)}</p>
                  {n.nav && n.nav.kind !== "detail" && (
                    <p className="mt-1 text-xs font-medium text-primary">Tap to open linked screen</p>
                  )}
                </div>
              </button>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
