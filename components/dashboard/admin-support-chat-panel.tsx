"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Headphones, Loader2, Send } from "lucide-react"
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
  user_id: string
  category: string
  category_label?: string
  status: string
  linked_kind: string | null
  linked_id: string | null
  linked_summary: string | null
  user_email: string | null
  user_name: string | null
  unread_for_admin: boolean
  last_message_at: string
  created_at: string
}

type MsgRow = {
  id: string
  sender_role: string
  body: string
  created_at: string
}

const CATEGORY_FILTERS = [
  { id: "", label: "All" },
  { id: "funding_dispute", label: "Funding" },
  { id: "withdrawal_dispute", label: "Withdrawal" },
  { id: "crypto_dispute", label: "Crypto" },
  { id: "assistant_escalation", label: "Assistant" },
  { id: "appeal", label: "Appeal" },
] as const

export function AdminSupportChatPanel(props: {
  initialThreadId?: string | null
  onInitialThreadConsumed?: () => void
  refreshTick?: number
  onUnreadCount?: (n: number) => void
}) {
  const { user } = useAuth()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState("")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rtTick, setRtTick] = useState(0)
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
      const qs = new URLSearchParams()
      if (categoryFilter) qs.set("category", categoryFilter)
      if (unreadOnly) qs.set("unread", "1")
      const res = await fetch(`/api/admin/support-threads?${qs.toString()}`, {
        headers: h,
        cache: "no-store",
      })
      const j = (await res.json()) as { threads?: ThreadRow[]; unreadCount?: number; error?: string }
      if (!res.ok) {
        setError(j.error ?? "Failed to load threads")
        return
      }
      const list = j.threads ?? []
      setThreads(list)
      const uc = j.unreadCount ?? list.filter((t) => t.unread_for_admin).length
      setUnreadCount(uc)
      props.onUnreadCount?.(uc)
    } finally {
      setLoadingList(false)
    }
  }, [categoryFilter, unreadOnly, props])

  const loadMessages = useCallback(
    async (tid: string) => {
      const h = await authHeaders()
      if (!h) return
      setLoadingThread(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/support-threads/${tid}`, { headers: h, cache: "no-store" })
        const j = (await res.json()) as { messages?: MsgRow[]; error?: string }
        if (!res.ok) {
          setError(j.error ?? "Failed to load thread")
          return
        }
        setMessages(j.messages ?? [])
        await fetch(`/api/admin/support-threads/${tid}/read`, { method: "PATCH", headers: h })
        void loadThreads()
      } finally {
        setLoadingThread(false)
      }
    },
    [loadThreads],
  )

  useOperationalRealtime({
    enabled: Boolean(user?.id),
    role: "admin",
    userId: user?.id ?? null,
    onSupportThreads: () => setRtTick((n) => n + 1),
    onSupportMessages: () => setRtTick((n) => n + 1),
  })

  useEffect(() => {
    void loadThreads()
  }, [loadThreads, props.refreshTick, rtTick])

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
  }, [selectedId, loadMessages, props.refreshTick, rtTick])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loadingThread])

  const sendReply = async () => {
    const tid = selectedId
    const text = reply.trim()
    if (!tid || !text || sending) return
    const h = await authHeaders()
    if (!h) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/support-threads/${tid}/reply`, {
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
    } finally {
      setSending(false)
    }
  }

  const selected = useMemo(() => threads.find((t) => t.id === selectedId), [threads, selectedId])
  return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
      <Card className="border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Operational inbox</h4>
          </div>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {unreadCount}
            </span>
          ) : null}
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Funding appeals, disputes, assistant escalations, and support threads. Live refresh enabled.
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.id || "all"}
              type="button"
              onClick={() => setCategoryFilter(f.id)}
              className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                categoryFilter === f.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        {loadingList ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="max-h-[min(420px,55vh)] space-y-1 overflow-y-auto text-sm">
            {threads.length === 0 ? (
              <li className="text-xs text-muted-foreground">No threads.</li>
            ) : (
              threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full rounded-lg border px-2 py-2 text-left transition-colors ${
                      selectedId === t.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">
                        {t.user_email ?? t.user_name ?? t.user_id.slice(0, 8)}
                      </span>
                      {t.unread_for_admin ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {t.category_label ?? operationalThreadCategoryLabel(t.category)} ·{" "}
                      {operationalThreadStatusLabel(t.status)}
                    </p>
                    {t.linked_summary ? (
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{t.linked_summary}</p>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </Card>

      <Card className="border-border bg-card p-4">
        {!selectedId ? (
          <p className="text-sm text-muted-foreground">Select a thread to view history and reply.</p>
        ) : (
          <>
                        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
              <span className="break-all text-xs font-mono text-muted-foreground">{selectedId}</span>
              {selected ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                  {operationalThreadStatusLabel(selected.status)}
                </span>
              ) : null}
            </div>
            {selected?.linked_summary ? (
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">{selected.linked_summary}</p>
            ) : null}
            <div className="mb-4 max-h-[min(380px,50vh)] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/15 p-3">
              {loadingThread ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                                        <div
                      className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                        m.sender_role === "admin"
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
                placeholder="Reply to customer…"
                disabled={sending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void sendReply()
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                onClick={() => void sendReply()}
                disabled={sending || !reply.trim()}
                aria-label="Send reply"
              >
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
