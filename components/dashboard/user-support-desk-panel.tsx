"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Headphones, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalRealtime } from "@/hooks/use-operational-realtime"
import { operationalThreadCategoryLabel } from "@/lib/operational-support-institutional"
import {
  SupportManualRefresh,
  SupportMessageTimeline,
  SupportReplyBar,
  SupportThreadListItem,
  type SupportMessageRow,
} from "@/components/dashboard/support-conversation-ui"
import { supabase } from "@/lib/supabaseClient"

type ThreadRow = {
  id: string
  category: string
  status: string
  unread_for_user: boolean
  last_message_at: string
  created_at: string
  escalated?: boolean
}

export function UserSupportDeskPanel(props: {
  initialThreadId?: string | null
  onInitialThreadConsumed?: () => void
}) {
  const { user } = useAuth()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessageRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [compose, setCompose] = useState("")
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const consumedInitial = useRef<string | null>(null)

  const authHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null
    return { Authorization: `Bearer ${token}` } as HeadersInit
  }

  const loadThreads = useCallback(async () => {
    const h = await authHeaders()
    if (!h) return
    setLoadingList(true)
    setError(null)
    try {
      const res = await fetch("/api/user/support-threads", { headers: h, cache: "no-store" })
      const j = (await res.json()) as { threads?: ThreadRow[]; error?: string }
      if (!res.ok) {
        setError(j.error ?? "Failed to load threads")
        return
      }
      setThreads(j.threads ?? [])
    } finally {
      setLoadingList(false)
    }
  }, [])

  const loadMessages = useCallback(async (tid: string) => {
    const h = await authHeaders()
    if (!h) return
    setLoadingThread(true)
    setError(null)
    try {
      const res = await fetch(`/api/user/support-threads/${tid}`, { headers: h, cache: "no-store" })
      const j = (await res.json()) as { messages?: SupportMessageRow[]; error?: string }
      if (!res.ok) {
        setError(j.error ?? "Failed to load thread")
        return
      }
      setMessages(j.messages ?? [])
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useOperationalRealtime({
    enabled: Boolean(user?.id),
    role: "trading_user",
    userId: user?.id ?? null,
    onSupportThreads: () => setTick((n) => n + 1),
    onSupportMessages: () => setTick((n) => n + 1),
  })

  useEffect(() => {
    void loadThreads()
  }, [loadThreads, tick])

  useEffect(() => {
    const id = props.initialThreadId?.trim()
    if (!id) {
      consumedInitial.current = null
      return
    }
    if (consumedInitial.current === id) return
    consumedInitial.current = id
    setSelectedId(id)
    props.onInitialThreadConsumed?.()
  }, [props.initialThreadId, props.onInitialThreadConsumed])

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId)
  }, [selectedId, loadMessages, tick])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const createThread = async () => {
    const text = compose.trim()
    if (!text || creating) return
    const h = await authHeaders()
    if (!h) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/user/support-threads", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, category: "appeal" }),
      })
      const j = (await res.json()) as { threadId?: string; error?: string }
      if (!res.ok || !j.threadId) {
        setError(j.error ?? "Could not create thread")
        return
      }
      setCompose("")
      await loadThreads()
      setSelectedId(j.threadId)
    } finally {
      setCreating(false)
    }
  }

  const sendReply = async () => {
    const tid = selectedId
    const text = reply.trim()
    if (!tid || !text || sending) return
    const h = await authHeaders()
    if (!h) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/user/support-threads/${tid}/reply`, {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(j.error ?? "Send failed")
        return
      }
      setReply("")
      await loadMessages(tid)
      await loadThreads()
    } finally {
      setSending(false)
    }
  }

  const selected = threads.find((t) => t.id === selectedId)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
      <Card className="border-border/80 bg-card/80 p-3 shadow-sm backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Support Center</h4>
          </div>
          <SupportManualRefresh onRefresh={() => setTick((n) => n + 1)} busy={loadingList} />
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          My conversations — appeals, verification, funding, and humane assistance. Replies appear here and in
          notifications.
        </p>
        <div className="mb-3 space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Open new thread</p>
          <textarea
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            placeholder="Describe your issue…"
            rows={3}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm touch-manipulation"
          />
          <Button
            type="button"
            size="sm"
            className="w-full gap-2 touch-manipulation"
            onClick={() => void createThread()}
            disabled={creating || !compose.trim()}
          >
            <Plus className="h-4 w-4" />
            Start conversation
          </Button>
        </div>
        {loadingList ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : threads.length === 0 ? (
          <p className="text-xs text-muted-foreground">No conversations yet.</p>
        ) : (
          <ul className="max-h-[min(300px,42vh)] space-y-2 overflow-y-auto touch-pan-y">
            {threads.map((t) => (
              <li key={t.id}>
                <SupportThreadListItem
                  id={t.id}
                  category={t.category}
                  status={t.status}
                  escalated={t.escalated}
                  unread={t.unread_for_user}
                  selected={selectedId === t.id}
                  onSelect={() => setSelectedId(t.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex min-h-[360px] flex-col border-border/80 bg-card/80 p-0 shadow-sm backdrop-blur-sm">
        {!selectedId ? (
          <p className="p-6 text-sm text-muted-foreground">Select a conversation or start a new thread.</p>
        ) : (
          <>
            <div className="border-b border-border/60 px-4 py-3">
              <p className="text-sm font-semibold">{operationalThreadCategoryLabel(selected?.category ?? "general")}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{selectedId}</p>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <SupportMessageTimeline
                messages={messages}
                loading={loadingThread}
                endRef={endRef}
                perspective="user"
              />
              <SupportReplyBar
                value={reply}
                onChange={setReply}
                onSend={() => void sendReply()}
                sending={sending}
                disabled={selected?.status === "closed"}
                placeholder="Write your reply…"
              />
            </div>
            {error ? <p className="px-4 pb-3 text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </Card>
    </div>
  )
}
