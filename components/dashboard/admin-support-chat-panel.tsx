"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Headphones, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalRealtime } from "@/hooks/use-operational-realtime"
import { operationalThreadCategoryLabel } from "@/lib/operational-support-institutional"
import {
  SupportManualRefresh,
  SupportMessageTimeline,
  SupportReplyBar,
  SupportStatusChip,
  SupportThreadListItem,
  type SupportMessageRow,
} from "@/components/dashboard/support-conversation-ui"
import { supabase } from "@/lib/supabaseClient"

type ThreadRow = {
  id: string
  user_id: string
  category: string
  category_label?: string
  status: string
  linked_kind?: string | null
  linked_id?: string | null
  linked_summary?: string | null
  user_email?: string | null
  user_name?: string | null
  unread_for_admin: boolean
  escalated?: boolean
  priority?: string
  last_message_at: string
  created_at: string
}

type MsgRow = SupportMessageRow

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
  initialLinkedKind?: string | null
  initialLinkedId?: string | null
  onInitialLinkedConsumed?: () => void
  refreshTick?: number
  onUnreadCount?: (n: number) => void
}) {
  const { user } = useAuth()
  const {
    initialThreadId,
    onInitialThreadConsumed,
    initialLinkedKind,
    initialLinkedId,
    onInitialLinkedConsumed,
    refreshTick,
    onUnreadCount,
  } = props
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState("")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [unresolvedOnly, setUnresolvedOnly] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchDraft, setSearchDraft] = useState("")
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
  const consumedLinked = useRef<string | null>(null)

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
    if (!h) {
      setError("Session expired — sign out and back in to open Human support.")
      setThreads([])
      setLoadingList(false)
      return
    }
    setLoadingList(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (categoryFilter) qs.set("category", categoryFilter)
      if (unreadOnly) qs.set("unread", "1")
      if (unresolvedOnly) qs.set("unresolved", "1")
      if (searchQuery.trim()) qs.set("q", searchQuery.trim())
      const res = await fetch(`/api/admin/support-threads?${qs.toString()}`, {
        headers: h,
        cache: "no-store",
      })
      const j = (await res.json()) as { threads?: ThreadRow[]; unreadCount?: number; error?: string }
      if (!res.ok) {
        const msg = j.error ?? "Failed to load threads"
        setError(
          msg.includes("Level 5")
            ? `${msg} Set profiles.trading_user_level = 5 for this admin account.`
            : msg,
        )
        setThreads([])
        return
      }
      const list = j.threads ?? []
      setThreads(list)
      const uc = j.unreadCount ?? list.filter((t) => t.unread_for_admin).length
      setUnreadCount(uc)
      onUnreadCount?.(uc)
    } finally {
      setLoadingList(false)
    }
  }, [categoryFilter, unreadOnly, unresolvedOnly, searchQuery, onUnreadCount])

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
  }, [loadThreads, refreshTick, rtTick])

  useEffect(() => {
    const id = initialThreadId?.trim()
    if (!id) {
      consumedInitial.current = null
      return
    }
    if (consumedInitial.current === id) return
    consumedInitial.current = id
    setSelectedId(id)
    onInitialThreadConsumed?.()
  }, [initialThreadId, onInitialThreadConsumed])

  useEffect(() => {
    const kind = initialLinkedKind?.trim()
    const lid = initialLinkedId?.trim()
    if (!kind || !lid) {
      consumedLinked.current = null
      return
    }
    const key = `${kind}:${lid}`
    if (consumedLinked.current === key) return
    const match = threads.find((t) => t.linked_kind === kind && t.linked_id === lid)
    if (!match) return
    consumedLinked.current = key
    setSelectedId(match.id)
    setUnresolvedOnly(false)
    onInitialLinkedConsumed?.()
  }, [threads, initialLinkedKind, initialLinkedId, onInitialLinkedConsumed])

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId)
  }, [selectedId, loadMessages, refreshTick, rtTick])

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

  const manageThread = async (action: string, extra?: Record<string, unknown>) => {
    const tid = selectedId
    if (!tid) return
    const h = await authHeaders()
    if (!h) return
    const res = await fetch(`/api/admin/support-threads/${tid}/manage`, {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    })
    if (!res.ok) {
      const j = (await res.json()) as { error?: string }
      setError(j.error ?? "Action failed")
      return
    }
    await loadThreads()
    if (selectedId) await loadMessages(selectedId)
  }

  if (error && !loadingList && threads.length === 0) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 p-4">
        <p className="text-sm font-semibold text-destructive">Human support could not load</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void loadThreads()}>
          Retry
        </Button>
      </Card>
    )
  }

  return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
      <Card className="border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Support inbox</h4>
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
                <div className="mb-2 flex flex-col gap-2">
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="User ID, tx ref, email…"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearchQuery(searchDraft)
            }}
          />
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSearchQuery(searchDraft)}>
            Search
          </Button>
        </div>
        <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={unresolvedOnly} onChange={(e) => setUnresolvedOnly(e.target.checked)} />
            Unresolved
          </label>
        </div>
        {loadingList ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="max-h-[min(420px,55vh)] space-y-1 overflow-y-auto text-sm">
            {threads.length === 0 ? (
              <li className="text-xs text-muted-foreground">No threads.</li>
            ) : (
              threads.map((t) => (
                <li key={t.id}>
                  <SupportThreadListItem
                    id={t.id}
                    category={t.category}
                    status={t.status}
                    escalated={t.escalated}
                    unread={t.unread_for_admin}
                    selected={selectedId === t.id}
                    subtitle={t.user_email ?? t.user_name ?? t.user_id.slice(0, 8)}
                    onSelect={() => setSelectedId(t.id)}
                  />
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
              {selected ? <SupportStatusChip status={selected.status} escalated={selected.escalated} /> : null}
              <SupportManualRefresh onRefresh={() => { setRtTick((n) => n + 1); void loadThreads() }} busy={loadingList} />
            </div>
            {selected?.linked_summary ? (
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">{selected.linked_summary}</p>
            ) : null}
            <div className="mb-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void manageThread("assign")}>
                Assign
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void manageThread("under_review")}>
                Review
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void manageThread("pending_user")}>
                Await user
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void manageThread("escalate")}>
                Escalate
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void manageThread("priority", { priority: "urgent" })}>
                Urgent
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const note = window.prompt("Resolution note (optional)")
                  if (note === null) return
                  void manageThread("resolve", { resolutionNote: note })
                }}
              >
                Resolve
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void manageThread("reopen")}>
                Reopen
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void manageThread("close")}>
                Close
              </Button>
            </div>
            <SupportMessageTimeline
              messages={messages}
              loading={loadingThread}
              endRef={endRef}
              perspective="admin"
            />
            <SupportReplyBar
              value={reply}
              onChange={setReply}
              onSend={() => void sendReply()}
              sending={sending}
              placeholder="Reply to customer…"
            />
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </Card>
    </div>
  )
}
