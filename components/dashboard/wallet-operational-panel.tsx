"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type TimelineItem = {
  sortAt: string
  kind: "ledger" | "funding_req"
  id: string
  title: string
  subtitle: string | null
  amount: number | null
  status: string | null
  transactionRef: string | null
  network: string | null
}

type IncomingReq = {
  id: string
  user_id: string
  amount: string | number
  tx_reference: string
  status: string
  note?: string | null
  mobile_network?: string | null
  fund_channel?: string | null
  created_at: string
  appeal_note?: string | null
  escalated_to_admin?: boolean | null
  payer_display_name?: string | null
  payer_phone?: string | null
  updated_at?: string | null
  retailer_response_deadline_at?: string | null
}

type DeskInfo = {
  id: string
  payment_numbers?: Array<{ label?: string; value?: string }>
  registered_payee_names?: string | null
  country_code?: string | null
  whatsapp_number?: string | null
  contact_phone?: string | null
} | null

export function RetailerOperationalAssets({ isGuest }: { isGuest?: boolean }) {
  const [assetSubTab, setAssetSubTab] = useState<"history" | "approval">("approval")
  const [mainBal, setMainBal] = useState(0)
  const [retailBal, setRetailBal] = useState(0)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [queue, setQueue] = useState<IncomingReq[]>([])
  const [desk, setDesk] = useState<DeskInfo>(null)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewRow, setReviewRow] = useState<IncomingReq | null>(null)
  const [xferAmt, setXferAmt] = useState("")
  const [xferDir, setXferDir] = useState<"to_retail" | "to_nexus">("to_retail")
  const [xferBusy, setXferBusy] = useState(false)

  const refresh = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    setLoading(true)
    try {
      const [b, h, q] = await Promise.all([
        fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/user/retailer-operations-history", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/user/retailer-incoming-queue", { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (b.ok) {
        const j = (await b.json()) as { available_balance?: number; retail_balance?: number }
        setMainBal(Number(j.available_balance ?? 0))
        setRetailBal(Number(j.retail_balance ?? 0))
      }
      if (h.ok) {
        const j = (await h.json()) as { timeline?: TimelineItem[] }
        setTimeline(j.timeline ?? [])
      }
      if (q.ok) {
        const j = (await q.json()) as { requests?: IncomingReq[]; desk?: DeskInfo }
        setQueue(j.requests ?? [])
        setDesk(j.desk ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isGuest) return
    void refresh()
  }, [isGuest, refresh])

  const deskNumbersDisplay = useMemo(() => {
    const nums = desk?.payment_numbers ?? []
    if (!nums.length) return "(configure payment numbers in Settings / desk)"
    return nums.map((p) => `${p.label ?? "line"}: ${p.value ?? ""}`).join(" · ")
  }, [desk])

  const runQueueAction = async (requestId: string, action: "approve" | "reject" | "review") => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    setActionId(requestId)
    try {
      const res = await fetch("/api/user/retailer-incoming-queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, action }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        window.alert(j.error ?? "Action failed")
        return
      }
      if (action === "review") {
        setReviewOpen(false)
      }
      await refresh()
    } finally {
      setActionId(null)
    }
  }

  const submitXfer = async () => {
    const amt = Number(xferAmt)
    if (!(amt > 0)) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    setXferBusy(true)
    try {
      const res = await fetch("/api/user/retail-balance-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ direction: xferDir, amount: amt }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; retail_balance?: number; available_balance?: number }
      if (!res.ok) {
        window.alert(j.error ?? "Transfer failed")
        return
      }
      setMainBal(Number(j.available_balance ?? mainBal))
      setRetailBal(Number(j.retail_balance ?? retailBal))
      setXferAmt("")
      void refresh()
    } finally {
      setXferBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-gradient-to-br from-primary/10 to-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Retailer operations</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Retail Balance is isolated operational float for user funding approvals. Nexus Main remains for trading.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <div>
                <p className="text-[11px] text-muted-foreground">Nexus Main (available)</p>
                <p className="font-mono text-lg font-semibold">${mainBal.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Retail Balance</p>
                <p className="font-mono text-lg font-semibold text-primary">${retailBal.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="w-full max-w-xs space-y-2 rounded-lg border border-border bg-background/60 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Move liquidity</p>
            <select
              value={xferDir}
              onChange={(e) => setXferDir(e.target.value as "to_retail" | "to_nexus")}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="to_retail">Nexus Main → Retail Balance</option>
              <option value="to_nexus">Retail Balance → Nexus Main</option>
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={xferAmt}
                onChange={(e) => setXferAmt(e.target.value)}
                placeholder="USD amount"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
              />
              <button
                type="button"
                disabled={xferBusy}
                onClick={() => void submitXfer()}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {xferBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
                Apply
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Need more float? Submit a crypto reference under Add Funds → retailer top-up (Level 5 approves into Retail Balance).
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "approval" as const, label: "Approval", icon: ShieldCheck },
            { id: "history" as const, label: "History", icon: History },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAssetSubTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              assetSubTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      {assetSubTab === "approval" && (
        <Card className="border-border bg-card p-4">
          <h3 className="mb-1 text-lg font-semibold">Funding approval queue</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Pending Add Funds from users on your payment rails. Review against actual mobile-money receipts, then approve to
            settle from Retail Balance.
          </p>
          {!queue.length ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {queue.map((r) => {
                const pend = ["pending", "under_review", "appealed", "escalated"].includes(r.status)
                const deadlineMs = r.retailer_response_deadline_at
                  ? new Date(r.retailer_response_deadline_at).getTime()
                  : null
                const overdue = Boolean(pend && deadlineMs && Date.now() > deadlineMs)
                return (
                <div
                  key={r.id}
                  className={`flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between ${overdue ? "border-destructive/60 bg-destructive/5" : "border-border bg-muted/20"}`}
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    {overdue ? (
                      <span className="inline-flex rounded bg-destructive/15 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                        Over SLA — user may appeal / escalate
                      </span>
                    ) : null}
                    <p className="font-semibold">
                      ${Number(r.amount).toFixed(2)} · {String(r.mobile_network ?? "network ?")}
                    </p>
                    <p className="truncate text-muted-foreground">
                      From: {r.payer_display_name ?? "—"} · {r.payer_phone ?? "—"}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">Ref: {r.tx_reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()} · status: {r.status}
                      {r.retailer_response_deadline_at
                        ? ` · respond by ${new Date(r.retailer_response_deadline_at).toLocaleString()}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Your desk: {deskNumbersDisplay}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionId === r.id}
                      onClick={() => {
                        setReviewRow(r)
                        setReviewOpen(true)
                      }}
                      className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      disabled={actionId === r.id}
                      onClick={() => {
                        if (!window.confirm("Approve and credit user from Retail Balance?")) return
                        void runQueueAction(r.id, "approve")
                      }}
                      className="rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/20"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={actionId === r.id}
                      onClick={() => {
                        if (!window.confirm("Reject this funding request?")) return
                        void runQueueAction(r.id, "reject")
                      }}
                      className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
                    >
                      Reject
                    </button>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {assetSubTab === "history" && (
        <Card className="border-border bg-card p-4">
          <h3 className="mb-1 text-lg font-semibold">Operations history</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Financial notifications and request lifecycle from the last {7} days (audit records are retained; this view trims
            for performance).
          </p>
          {!timeline.length ? (
            <p className="text-sm text-muted-foreground">No rows in window.</p>
          ) : (
            <div className="space-y-2">
              {timeline.map((row) => (
                <div
                  key={`${row.kind}-${row.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-muted/15 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{row.title}</p>
                    {row.subtitle ? (
                      <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-start gap-0.5 text-right md:items-end">
                    {row.amount != null ? (
                      <span className="font-mono text-sm">${Number(row.amount).toFixed(2)}</span>
                    ) : null}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {row.status === "approved" || row.status === "completed" ? (
                        <CheckCircle2 className="h-3 w-3 text-success" />
                      ) : row.status === "rejected" ? (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <Clock className="h-3 w-3 text-warning" />
                      )}
                      {row.status ?? "—"} · {new Date(row.sortAt).toLocaleString()}
                    </span>
                    {row.transactionRef ? (
                      <span className="font-mono text-[10px] text-muted-foreground">ID: {row.transactionRef}</span>
                    ) : null}
                    {row.network ? (
                      <span className="text-[10px] text-muted-foreground">Rail: {row.network}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review funding request</DialogTitle>
          </DialogHeader>
          {reviewRow ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-semibold text-muted-foreground">User-entered sender</p>
                <p>
                  {reviewRow.payer_display_name ?? "—"} · {reviewRow.payer_phone ?? "—"}
                </p>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">Reference / memo</p>
                <p className="font-mono text-xs">{reviewRow.tx_reference}</p>
                {reviewRow.note ? <p className="mt-1 text-xs">{reviewRow.note}</p> : null}
              </div>
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-semibold text-warning">Expected payment destination (your desk)</p>
                <p className="mt-1 break-words">{deskNumbersDisplay}</p>
                {desk?.registered_payee_names ? (
                  <p className="mt-1 text-xs">Registered payee(s): {desk.registered_payee_names}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-mono font-semibold">${Number(reviewRow.amount).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Network</p>
                  <p>{reviewRow.mobile_network ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Request ID</p>
                  <p className="font-mono break-all">{reviewRow.id}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Compare these details against your mobile-money ledger before approving. Mis-matched payer details should be
                rejected or escalated.
              </p>
              <button
                type="button"
                className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
                onClick={() => void runQueueAction(reviewRow.id, "review")}
              >
                Mark under review &amp; return
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type AdminUserRow = {
  id: string
  email: string
  created_at?: string
  profile: {
    trading_user_level?: number
    operational_freeze_at?: string | null
    account_disabled_at?: string | null
  } | null
}

type AdminUserRowActions = "freeze" | "unfreeze" | "disable" | "enable" | "recovery_link"

export function AdminOperationalAssets({ isGuest }: { isGuest?: boolean }) {
  const [sub, setSub] = useState<"hub" | "users" | "history" | "approval">("hub")
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([])
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [approvalFunding, setApprovalFunding] = useState<Array<Record<string, unknown>>>([])
  const [approvalTopups, setApprovalTopups] = useState<Array<Record<string, unknown>>>([])
  const [approvalRetailers, setApprovalRetailers] = useState<Array<Record<string, unknown>>>([])

  const authHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null
    return { Authorization: `Bearer ${token}` } as HeadersInit
  }

  const refreshHistory = useCallback(async () => {
    const h = await authHeaders()
    if (!h) return
    setLoading(true)
    try {
      const res = await fetch("/api/admin/financial-events?limit=300", { headers: h })
      if (!res.ok) return
      const j = (await res.json()) as { events?: Array<Record<string, unknown>> }
      setEvents(j.events ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshApproval = useCallback(async () => {
    const h = await authHeaders()
    if (!h) return
    try {
      const [a, b] = await Promise.all([
        fetch("/api/admin/retailer-funding", { headers: h }),
        fetch("/api/admin/retailer-liquidity-topup", { headers: h }),
      ])
      if (a.ok) {
        const j = (await a.json()) as {
          requests?: Array<Record<string, unknown>>
          retailers?: Array<Record<string, unknown>>
        }
        const pending = (j.requests ?? []).filter((r) =>
          ["pending", "under_review", "appealed", "escalated"].includes(String(r.status ?? "")),
        )
        setApprovalFunding(pending)
        setApprovalRetailers(j.retailers ?? [])
      }
      if (b.ok) {
        const j = (await b.json()) as { requests?: Array<Record<string, unknown>> }
        const pending = (j.requests ?? []).filter((r) => ["pending", "under_review"].includes(String(r.status ?? "")))
        setApprovalTopups(pending)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (isGuest) return
    if (sub === "history") void refreshHistory()
    if (sub === "approval") void refreshApproval()
  }, [isGuest, sub, refreshHistory, refreshApproval])

  const runUserAction = async (userId: string, action: AdminUserRowActions) => {
    const h = await authHeaders()
    if (!h) return
    const body: { userId: string; action: string } = { userId, action }
    if (action === "recovery_link") {
      const ok = window.confirm("Generate a one-time recovery link? Deliver it securely to the user.")
      if (!ok) return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; recoveryActionLink?: string }
      if (!res.ok) {
        window.alert(j.error ?? "Failed")
        return
      }
      if (action === "recovery_link" && j.recoveryActionLink) {
        await navigator.clipboard.writeText(j.recoveryActionLink).catch(() => null)
        window.alert("Recovery link copied to clipboard. Send through a verified channel.")
      }
    } finally {
      setLoading(false)
    }
  }

  const searchUsers = async () => {
    const q = search.trim()
    if (q.length < 2 && !/^[0-9a-f-]{36}$/i.test(q)) {
      window.alert("Enter at least 2 characters or a user UUID.")
      return
    }
    const h = await authHeaders()
    if (!h) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, { headers: h })
      const j = (await res.json()) as { users?: AdminUserRow[]; error?: string }
      if (!res.ok) {
        window.alert(j.error ?? "Search failed")
        return
      }
      setUsers(j.users ?? [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "hub" as const, label: "Operations hub", icon: MessageSquare },
            { id: "users" as const, label: "Users", icon: Users },
            { id: "history" as const, label: "History", icon: History },
            { id: "approval" as const, label: "Approval", icon: ShieldCheck },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSub(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              sub === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {sub === "hub" && (
        <Card className="border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="text-lg font-semibold">Admin communication &amp; operations hub</h3>
                <p className="mt-1 text-muted-foreground">
                  Central coordination for disputes, funding fallbacks, and operational anomalies. Pair this view with Joelin /
                  Expert flows for narrative analysis — escalate to humans when automation cannot safely close a case.
                </p>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Use AI panels to summarize transaction clusters, appealed funding, and retailer health.</li>
                <li>Route unresolved appeals after the retailer response window to this hub + Approval tab.</li>
                <li>Never distribute recovery links outside verified channels.</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {sub === "users" && (
        <Card className="border-border bg-card p-4">
          <h3 className="mb-3 text-lg font-semibold">Global user controls</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Search accounts by UUID or email substring. Governance flags are persisted on profiles — wire auth middleware to
            enforce freezes/disables in trading routes as a follow-through.
          </p>
          <div className="mb-4 flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email contains… or UUID"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void searchUsers()}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={loading}
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{u.id}</p>
                  <p className="font-medium">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Level {u.profile?.trading_user_level ?? "—"}
                    {u.profile?.operational_freeze_at ? " · Frozen" : ""}
                    {u.profile?.account_disabled_at ? " · Disabled" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-muted px-2 py-1 text-xs font-semibold"
                    onClick={() => void runUserAction(u.id, "freeze")}
                  >
                    Freeze
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-muted px-2 py-1 text-xs font-semibold"
                    onClick={() => void runUserAction(u.id, "unfreeze")}
                  >
                    Unfreeze
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
                    onClick={() => void runUserAction(u.id, "disable")}
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-muted px-2 py-1 text-xs font-semibold"
                    onClick={() => void runUserAction(u.id, "enable")}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                    onClick={() => void runUserAction(u.id, "recovery_link")}
                  >
                    Recovery link
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sub === "history" && (
        <Card className="border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Operational audit ledger</h3>
            <button
              type="button"
              onClick={() => void refreshHistory()}
              className="text-xs text-primary underline disabled:opacity-50"
              disabled={loading}
            >
              Reload
            </button>
          </div>
          {!events.length ? (
            <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No events loaded."}</p>
          ) : (
            <div className="max-h-[480px] space-y-1 overflow-y-auto text-xs">
              {events.slice(0, 200).map((ev) => (
                <div key={String(ev.id)} className="flex flex-wrap items-baseline gap-2 rounded border border-border/60 px-2 py-1">
                  <span className="text-muted-foreground">{String(ev.created_at ?? "")}</span>
                  <span className="font-mono">{String(ev.user_id ?? "").slice(0, 8)}…</span>
                  <span className="font-semibold">{String(ev.event_type ?? "")}</span>
                  <span>{String(ev.status ?? "")}</span>
                  <span className="font-mono">${Number(ev.gross_amount ?? 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {sub === "approval" && (
        <Card className="border-border bg-card p-4">
          <h3 className="mb-3 text-lg font-semibold">Approval overview</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Open queues for retailer-mediated funding and crypto float top-ups. Detailed actions remain in dashboard modals /
            desks — this panel is the wallet-native summary.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3 md:col-span-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Retail desk directory</p>
              <p className="font-mono text-2xl font-bold">{approvalRetailers.length}</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px]">
                {approvalRetailers.slice(0, 24).map((r) => (
                  <li key={String(r.id)} className="truncate text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {String(r.profile_email ?? "").trim() || `${String(r.user_id ?? "").slice(0, 8)}…`}
                    </span>{" "}
                    · {String(r.country_code ?? "—")} · basin ${Number(r.credit_basin ?? 0).toFixed(0)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">User funding requests</p>
              <p className="font-mono text-2xl font-bold">{approvalFunding.length}</p>
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[11px]">
                {approvalFunding.slice(0, 8).map((r) => (
                  <li key={String(r.id)} className="truncate">
                    {String(r.tx_reference ?? r.id)} · ${Number(r.amount ?? 0).toFixed(0)} · {String(r.status)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Retailer liquidity top-ups</p>
              <p className="font-mono text-2xl font-bold">{approvalTopups.length}</p>
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[11px]">
                {approvalTopups.slice(0, 8).map((r) => (
                  <li key={String(r.id)} className="truncate">
                    {String(r.crypto_tx_reference ?? r.id)} · ${Number(r.amount_requested ?? 0).toFixed(0)} ·{" "}
                    {String(r.status)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
