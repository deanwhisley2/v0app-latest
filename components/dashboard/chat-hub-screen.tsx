"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Bot,
  Headphones,
  Loader2,
  MessageCircle,
  Pin,
  Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useOperationalRealtime } from "@/hooks/use-operational-realtime"
import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"
import { NX_PANEL } from "@/lib/nexus-ui-surfaces"
import {
  operationalThreadCategoryLabel,
  operationalThreadStatusLabel,
} from "@/lib/operational-support-institutional"
import { formatNotificationTimeAgo } from "@/lib/notifications/notification-inbox-presenter"
import { supabase } from "@/lib/supabaseClient"
import { TRADING_USER_LEVEL } from "@/lib/trading-user-level"
import { cn } from "@/lib/utils"

type ThreadRow = {
  id: string
  category: string
  status: string
  unread_for_user: boolean
  last_message_at: string
  created_at: string
}

type MsgRow = {
  id: string
  sender_role: string
  body: string
  created_at: string
}

type ChatRoute =
  | { screen: "list" }
  | { screen: "ai" }
  | { screen: "support"; threadId: string | null }

type ConversationKind = "ai" | "support_hub" | "support_thread"

type ConversationRow = {
  id: string
  kind: ConversationKind
  title: string
  preview: string
  timeLabel: string
  unread: number
  pinned: boolean
  threadId?: string
}

type AiMsg = { id: string; role: "user" | "assistant"; content: string }

function rowTime(iso: string | undefined, t: (key: string) => string): string {
  if (!iso) return ""
  try {
    return formatNotificationTimeAgo(iso, t)
  } catch {
    return ""
  }
}

export function ChatHubScreen({
  isGuestSession = false,
  initialFocus = null,
  supportThreadFocusId = null,
  onSupportThreadFocusConsumed,
  showOperationalInboxHint = false,
  onGoToOperationalInbox,
}: {
  isGuestSession?: boolean
  initialFocus?: "ai" | "support" | null
  supportThreadFocusId?: string | null
  onSupportThreadFocusConsumed?: () => void
  /** Level-5 desk: customer Chat is not the operational inbox. */
  showOperationalInboxHint?: boolean
  onGoToOperationalInbox?: () => void
}) {
  const { t, language, country } = useUserPreferences()
  const { user } = useAuth()
  const scrollBehavior = isMobileLowGpuMode() ? "auto" : "smooth"

  const [route, setRoute] = useState<ChatRoute>({ screen: "list" })
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadTick, setThreadTick] = useState(0)

  const [messages, setMessages] = useState<MsgRow[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [supportReply, setSupportReply] = useState("")
  const [supportCompose, setSupportCompose] = useState("")
  const [supportSending, setSupportSending] = useState(false)
  const [supportCreating, setSupportCreating] = useState(false)
  const [supportError, setSupportError] = useState<string | null>(null)
  const supportEndRef = useRef<HTMLDivElement>(null)

  const [aiMessages, setAiMessages] = useState<AiMsg[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content: getNexusAssistantWelcome("dashboard_chat", isGuestSession),
    },
  ])
  const [aiInput, setAiInput] = useState("")
  const [aiBusy, setAiBusy] = useState(false)
  const aiEndRef = useRef<HTMLDivElement>(null)

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null
    return { Authorization: `Bearer ${token}` } as HeadersInit
  }, [])

  const loadThreads = useCallback(async () => {
    const h = await authHeaders()
    if (!h) {
      setThreads([])
      setThreadsLoading(false)
      return
    }
    setThreadsLoading(true)
    try {
      const res = await fetch("/api/user/support-threads", { headers: h, cache: "no-store" })
      const j = (await res.json()) as { threads?: ThreadRow[] }
      setThreads(j.threads ?? [])
    } finally {
      setThreadsLoading(false)
    }
  }, [authHeaders])

  const loadMessages = useCallback(
    async (tid: string) => {
      const h = await authHeaders()
      if (!h) return
      setMessagesLoading(true)
      setSupportError(null)
      try {
        const res = await fetch(`/api/user/support-threads/${tid}`, { headers: h, cache: "no-store" })
        const j = (await res.json()) as { messages?: MsgRow[]; error?: string }
        if (!res.ok) {
          setSupportError(j.error ?? "Failed to load messages")
          return
        }
        setMessages(j.messages ?? [])
      } finally {
        setMessagesLoading(false)
      }
    },
    [authHeaders],
  )

  useOperationalRealtime({
    enabled: Boolean(user?.id),
    role: "trading_user",
    userId: user?.id ?? null,
    onSupportThreads: () => setThreadTick((n) => n + 1),
    onSupportMessages: () => setThreadTick((n) => n + 1),
  })

  useEffect(() => {
    void loadThreads()
  }, [loadThreads, threadTick])

  useEffect(() => {
    if (initialFocus === "ai") setRoute({ screen: "ai" })
    else if (initialFocus === "support") setRoute({ screen: "support", threadId: null })
  }, [initialFocus])

  useEffect(() => {
    const tid = supportThreadFocusId?.trim()
    if (!tid) return
    setRoute({ screen: "support", threadId: tid })
    onSupportThreadFocusConsumed?.()
  }, [supportThreadFocusId, onSupportThreadFocusConsumed])

  useEffect(() => {
    const tid = route.screen === "support" ? route.threadId : null
    if (tid) void loadMessages(tid)
    else setMessages([])
  }, [route, loadMessages, threadTick])

  useEffect(() => {
    supportEndRef.current?.scrollIntoView({ behavior: scrollBehavior })
  }, [messages, scrollBehavior])

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: scrollBehavior })
  }, [aiMessages, aiBusy, scrollBehavior])

  const supportUnread = useMemo(() => threads.filter((th) => th.unread_for_user).length, [threads])

  const conversations = useMemo((): ConversationRow[] => {
    const rows: ConversationRow[] = [
      {
        id: "ai",
        kind: "ai",
        title: t("chat.conversation.aiTitle"),
        preview: t("chat.conversation.aiPreview"),
        timeLabel: "",
        unread: 0,
        pinned: true,
      },
      {
        id: "support-hub",
        kind: "support_hub",
        title: t("chat.conversation.supportTitle"),
        preview:
          threads.length > 0
            ? t("chat.conversation.supportPreviewActive").replace("{{count}}", String(threads.length))
            : t("chat.conversation.supportPreview"),
        timeLabel: threads[0] ? rowTime(threads[0].last_message_at, t) : "",
        unread: supportUnread,
        pinned: true,
      },
    ]

    for (const th of [...threads].sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
    )) {
      rows.push({
        id: `thread-${th.id}`,
        kind: "support_thread",
        threadId: th.id,
        title: `${t("chat.conversation.supportThread")} · ${operationalThreadCategoryLabel(th.category)}`,
        preview: operationalThreadStatusLabel(th.status, false),
        timeLabel: rowTime(th.last_message_at, t),
        unread: th.unread_for_user ? 1 : 0,
        pinned: false,
      })
    }

    return rows
  }, [threads, supportUnread, t])

  const filteredConversations = useMemo(() => {
    if (!deferredSearch) return conversations
    return conversations.filter((c) => {
      const blob = `${c.title} ${c.preview}`.toLowerCase()
      return blob.includes(deferredSearch)
    })
  }, [conversations, deferredSearch])

  const pinnedRows = filteredConversations.filter((c) => c.pinned)
  const otherRows = filteredConversations.filter((c) => !c.pinned)

  const openConversation = (row: ConversationRow) => {
    if (row.kind === "ai") setRoute({ screen: "ai" })
    else if (row.kind === "support_hub") setRoute({ screen: "support", threadId: null })
    else if (row.kind === "support_thread" && row.threadId)
      setRoute({ screen: "support", threadId: row.threadId })
  }

  const sendAi = async () => {
    const raw = aiInput.trim()
    if (!raw || aiBusy) return
    const uid = `u-${Date.now()}`
    const aid = `a-${Date.now()}`
    setAiMessages((m) => [...m, { id: uid, role: "user", content: raw }])
    setAiInput("")
    setAiBusy(true)
    try {
      const reply = await requestNexusAssistantReply({
        userMessage: raw,
        surface: "dashboard_chat",
        isGuest: isGuestSession,
        tradingUserLevel: TRADING_USER_LEVEL,
        appLanguage: language,
        fundingCountryCode: country ?? undefined,
      })
      setAiMessages((m) => [...m, { id: aid, role: "assistant", content: reply }])
    } finally {
      setAiBusy(false)
    }
  }

  const createSupportThread = async () => {
    const text = supportCompose.trim()
    if (!text || supportCreating) return
    const h = await authHeaders()
    if (!h) return
    setSupportCreating(true)
    setSupportError(null)
    try {
      const res = await fetch("/api/user/support-threads", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, category: "appeal" }),
      })
      const j = (await res.json()) as { threadId?: string; error?: string }
      if (!res.ok || !j.threadId) {
        setSupportError(j.error ?? "Could not open thread")
        return
      }
      setSupportCompose("")
      await loadThreads()
      setRoute({ screen: "support", threadId: j.threadId })
    } finally {
      setSupportCreating(false)
    }
  }

  const sendSupportReply = async () => {
    const tid = route.screen === "support" ? route.threadId : null
    const text = supportReply.trim()
    if (!tid || !text || supportSending) return
    const h = await authHeaders()
    if (!h) return
    setSupportSending(true)
    setSupportError(null)
    try {
      const res = await fetch(`/api/user/support-threads/${tid}/reply`, {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        setSupportError(j.error ?? "Send failed")
        return
      }
      setSupportReply("")
      await loadMessages(tid)
      await loadThreads()
    } finally {
      setSupportSending(false)
    }
  }

  const listHeader = (
    <div className="space-y-4 border-b border-border/50 px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("chat.title")}</h2>
        </div>
        {supportUnread > 0 ? (
          <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
            {supportUnread > 99 ? "99+" : supportUnread}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{t("chat.subtitle")}</p>
      {showOperationalInboxHint ? (
        <div className="rounded-xl border border-primary/35 bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Liquidity admin inbox</p>
          <p className="mt-1 text-xs">
            Customer appeals and escalations are in Desk → Human support, not this chat list.
          </p>
          {onGoToOperationalInbox ? (
            <Button type="button" size="sm" variant="outline" className="mt-2 h-8" onClick={onGoToOperationalInbox}>
              Open Human support
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("chat.searchPlaceholder")}
          className="min-h-11 border-border/70 bg-muted/20 ps-3"
          autoComplete="off"
        />
      </div>
    </div>
  )

  const renderRow = (row: ConversationRow) => {
    const Icon = row.kind === "ai" ? Bot : Headphones
    return (
      <button
        key={row.id}
        type="button"
        onClick={() => openConversation(row)}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-muted/35 active:bg-muted/50"
      >
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            row.kind === "ai" ? "bg-primary/12 text-primary" : "bg-muted/60 text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
            {row.pinned ? <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.preview}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {row.timeLabel ? <span className="text-[10px] text-muted-foreground">{row.timeLabel}</span> : null}
          {row.unread > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {row.unread > 9 ? "9+" : row.unread}
            </span>
          ) : null}
        </div>
      </button>
    )
  }

  if (route.screen === "list") {
    return (
      <div className={cn(NX_PANEL, "flex min-h-[min(72dvh,720px)] flex-col overflow-hidden")}>
        {listHeader}
        <div className="nexus-scroll-isolated min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          {threadsLoading && pinnedRows.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {pinnedRows.length > 0 ? (
            <section className="mb-2">
              <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground">{t("chat.section.pinned")}</p>
              {pinnedRows.map(renderRow)}
            </section>
          ) : null}
          {otherRows.length > 0 ? (
            <section>
              <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground">{t("chat.section.threads")}</p>
              {otherRows.map(renderRow)}
            </section>
          ) : null}
          {!threadsLoading && filteredConversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("chat.searchEmpty")}</p>
          ) : null}
        </div>
      </div>
    )
  }

  const backToList = () => setRoute({ screen: "list" })

  const detailShell = (title: string, subtitle: string, children: React.ReactNode) => (
    <div className={cn(NX_PANEL, "flex min-h-[min(72dvh,720px)] flex-col overflow-hidden")}>
      <div className="flex items-center gap-2 border-b border-border/80 px-3 py-3 sm:px-4">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={backToList}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )

  if (route.screen === "ai") {
    return detailShell(
      t("chat.conversation.aiTitle"),
      t("chat.conversation.aiSubtitle"),
      <>
        <div className="nexus-scroll-isolated min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {aiMessages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground ring-1 ring-border/60",
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {aiBusy ? (
            <p className="text-xs text-muted-foreground">{t("chat.ai.thinking")}</p>
          ) : null}
          <div ref={aiEndRef} />
        </div>
        <div className="flex gap-2 border-t border-border/80 p-3 sm:p-4">
          <Input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder={t("chat.ai.placeholder")}
            disabled={aiBusy}
            className="min-h-11 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void sendAi()
              }
            }}
          />
          <Button type="button" size="icon" className="h-11 w-11 shrink-0" disabled={aiBusy || !aiInput.trim()} onClick={() => void sendAi()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </>,
    )
  }

  if (route.screen === "support") {
    const tid = route.threadId
    return detailShell(
      tid ? t("chat.support.threadTitle") : t("chat.conversation.supportTitle"),
      tid ? t("chat.support.threadSubtitle") : t("chat.support.hubSubtitle"),
      <>
        {!tid ? (
          <div className="space-y-3 border-b border-border/80 px-4 py-4">
            <textarea
              value={supportCompose}
              onChange={(e) => setSupportCompose(e.target.value)}
              placeholder={t("chat.support.composePlaceholder")}
              rows={3}
              className="w-full resize-y rounded-xl border border-border bg-input px-3 py-2.5 text-sm"
            />
            <Button
              type="button"
              className="w-full"
              disabled={supportCreating || !supportCompose.trim()}
              onClick={() => void createSupportThread()}
            >
              {supportCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("chat.support.openThread")}
            </Button>
            <div className="space-y-1">
              {threads.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setRoute({ screen: "support", threadId: th.id })}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                >
                  <span className="truncate font-medium">{operationalThreadCategoryLabel(th.category)}</span>
                  {th.unread_for_user ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="nexus-scroll-isolated min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messagesLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.sender_role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm",
                        m.sender_role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-foreground ring-1 ring-border/60",
                      )}
                    >
                      <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                        {m.sender_role === "user" ? t("chat.support.you") : t("chat.support.team")}
                      </p>
                      {m.body}
                    </div>
                  </div>
                ))
              )}
              <div ref={supportEndRef} />
            </div>
            <div className="flex gap-2 border-t border-border/80 p-3 sm:p-4">
              <Input
                value={supportReply}
                onChange={(e) => setSupportReply(e.target.value)}
                placeholder={t("chat.support.replyPlaceholder")}
                disabled={supportSending}
                className="min-h-11 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void sendSupportReply()
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={supportSending || !supportReply.trim()}
                onClick={() => void sendSupportReply()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
        {supportError ? <p className="px-4 pb-3 text-sm text-destructive">{supportError}</p> : null}
      </>,
    )
  }

  return null
}
