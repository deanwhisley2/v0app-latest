"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Headphones, Loader2, Plus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalRealtime } from "@/hooks/use-operational-realtime"
import {
  operationalThreadCategoryLabel,
  operationalThreadStatusLabel,
} from "@/lib/operational-support-institutional"
import { supabase } from "@/lib/supabaseClient"

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

export function UserSupportDeskPanel(props: {
  initialThreadId?: string | null
  onInitialThreadConsumed?: () => void
}) {
  const { user } = useAuth()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
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
      const j = (await res.json()) as { messages?: MsgRow[]; error?: string }
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr]">
      <Card className="border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <Headphones className="h-4 w-4 text-primary" />
          <h4 className="font-semibold">Support</h4>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">Appeals and account disputes. Replies notify you in-app.</p>
        <div className="mb-3 space-y-2">
          <textarea
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            placeholder="Describe your issue…"
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button type="button" size="sm" className="w-full gap-2" onClick={() => void createThread()} disabled={creating || !compose.trim()}>
            <Plus className="h-4 w-4" />
            Open thread
          </Button>
        </div>
        {loadingList ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="max-h-[min(280px,40vh)] space-y-1 overflow-y-auto text-sm">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full rounded-lg border px-2 py-2 text-left transition-colors ${
                    selectedId === t.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{t.id.slice(0, 8)}…</span>
                    {t.unread_for_user ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {operationalThreadCategoryLabel(t.category)} ·{" "}
                    {operationalThreadStatusLabel(t.status, (t as { escalated?: boolean }).escalated)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-border bg-card p-4">
        {!selectedId ? (
          <p className="text-sm text-muted-foreground">Select a thread or open a new one.</p>
        ) : (
          <>
            <div className="mb-3 border-b border-border pb-2 font-mono text-[10px] text-muted-foreground break-all">{selectedId}</div>
            <div className="mb-4 max-h-[min(320px,45vh)] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/15 p-3 touch-pan-y overscroll-contain">
              {loadingThread ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                        m.sender_role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground ring-1 ring-border"
                      }`}
                    >
                      <p className="mb-1 text-[10px] uppercase opacity-70">{m.sender_role}</p>
                      <p className="mb-1 text-[9px] opacity-60">{new Date(m.created_at).toLocaleString()}</p>
                      {m.body}
                    </div>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>
            <div className="flex gap-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply…"
                disabled={sending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void sendReply()
                  }
                }}
              />
              <Button type="button" size="icon" onClick={() => void sendReply()} disabled={sending || !reply.trim()} aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </Card>
    </div>
  )
}
