"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeftRight,
  Bookmark,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  MessageCircle,
  Search,
  ShieldCheck,
  Users,
  XCircle,
  Building2,
  Landmark,
  AlertTriangle,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalRealtime } from "@/hooks/use-operational-realtime"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AdminSupportChatPanel } from "@/components/dashboard/admin-support-chat-panel"
import { ledgerOperationalTraceLines } from "@/lib/formatting/ledger-operational-trace"

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

  const { user: authUser } = useAuth()
  useOperationalRealtime({
    enabled: !isGuest && Boolean(authUser?.id) && Boolean(desk?.id),
    role: "retailer_desk",
    userId: authUser?.id ?? null,
    retailerProfileId: desk?.id ?? null,
    onRetailerFundRequests: refresh,
    onSupportThreads: refresh,
    onSupportMessages: refresh,
    onAccountNotifications: refresh,
  })

  /** Fallback polling if Realtime disconnects (e.g. network tab sleep). */
  useEffect(() => {
    if (isGuest) return
    const id = window.setInterval(() => {
      void refresh()
    }, 45_000)
    return () => window.clearInterval(id)
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

type AdminUserRowActions =
  | "freeze"
  | "unfreeze"
  | "disable"
  | "enable"
  | "recovery_link"
  | "reset_password"
  | "burn_balances"
  | "delete_user"

/** Matches GET /api/admin/operations-desk rows. */
type OperationsDeskApiRow = {
  kind: "retailer_float_topup" | "user_add_funds" | "user_withdrawal"
  id: string
  status: string
  subject_user_id: string
  subject_email: string | null
  subject_name: string | null
  country_code: string | null
  tx_reference: string
  amount: number
  request_type_label: string
  fund_channel: string | null
  mobile_network: string | null
  created_at: string
  reviewed_at?: string | null
  escalated_to_admin?: boolean | null
  pending_ms: number | null
  nexus_main_usd: number | null
  retail_balance_usd: number | null
  retailer_basin_usd: number | null
  retailer_desk_email?: string | null
  duplicate_risk_hint: string | null
  note?: string | null
  payer_display_name?: string | null
  payer_phone?: string | null
  commission_rate?: number | null
  amount_credited?: number | null
  resolution_note?: string | null
  payout_status?: string | null
  withdrawal_pending_usd?: number | null
}

function formatPendingAge(ms: number | null): string {
  if (ms == null) return "—"
  const m = Math.floor(ms / 60_000)
  if (m < 120) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

type DeskSnoozeEntry = { key: string; note: string; at: number }

const DESK_SNOOZE_LS = "nexus_l5_desk_snooze_v1"

function deskRowKey(row: OperationsDeskApiRow): string {
  return `${row.kind}:${row.id}`
}

export function AdminOperationalAssets({
  isGuest,
  focusSupportThreadId,
  onFocusSupportThreadConsumed,
}: {
  isGuest?: boolean
  focusSupportThreadId?: string | null
  onFocusSupportThreadConsumed?: () => void
}) {
  const { user: authUser } = useAuth()
  const [sub, setSub] = useState<"approval" | "users" | "history" | "support">("approval")
  const [supportFeedTick, setSupportFeedTick] = useState(0)
  const bumpSupportFeed = useCallback(() => setSupportFeedTick((n) => n + 1), [])
  const [approvalView, setApprovalView] = useState<"active" | "history">("active")
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([])
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [approvalRetailers, setApprovalRetailers] = useState<Array<Record<string, unknown>>>([])
  const [deskPending, setDeskPending] = useState<OperationsDeskApiRow[]>([])
  const [deskHistory, setDeskHistory] = useState<OperationsDeskApiRow[]>([])
  const [treasuryMeta, setTreasuryMeta] = useState<{
    operational_pool_env_configured: boolean
    pool_available_usd: number | null
    settlement_mode?: string
    debit_source?: string
    pool_user_id_masked?: string | null
    master_liquidity_strict?: boolean
    settlement_summary?: string
    settlement_remediation?: string | null
    approved_float_topups_total_usd?: number
    pending_float_topup_count?: number
    pending_float_topup_amount_requested_usd?: number
    retailer_desk_retail_balance_total_usd?: number
    stats_available?: boolean
    stats_error?: string | null
  } | null>(null)
  const [deskError, setDeskError] = useState<string | null>(null)
  const [reviewRow, setReviewRow] = useState<OperationsDeskApiRow | null>(null)
  const [reviewContext, setReviewContext] = useState<"active" | "history">("active")
  const [resolutionDraft, setResolutionDraft] = useState("")
  const [ledgerPreview, setLedgerPreview] = useState<Array<Record<string, unknown>>>([])
  const [accountNotifPreview, setAccountNotifPreview] = useState<
    Array<{ id: string; title: string; body: string; created_at: string; user_deleted_at?: string | null; read_at?: string | null }>
  >([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [deskSnoozed, setDeskSnoozed] = useState<DeskSnoozeEntry[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DESK_SNOOZE_LS)
      if (raw) setDeskSnoozed(JSON.parse(raw) as DeskSnoozeEntry[])
    } catch {
      /* ignore */
    }
  }, [])

  const persistDeskSnooze = useCallback((next: DeskSnoozeEntry[]) => {
    setDeskSnoozed(next)
    try {
      localStorage.setItem(DESK_SNOOZE_LS, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const visibleDeskPending = useMemo(() => {
    const hide = new Set(deskSnoozed.map((s) => s.key))
    return deskPending.filter((r) => !hide.has(deskRowKey(r)))
  }, [deskPending, deskSnoozed])

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
    setLoading(true)
    setDeskError(null)
    try {
      const [deskRes, rfRes] = await Promise.all([
        fetch("/api/admin/operations-desk", { headers: h, cache: "no-store" }),
        fetch("/api/admin/retailer-funding", { headers: h, cache: "no-store" }),
      ])
      const dj = (await deskRes.json().catch(() => ({}))) as {
        pending?: OperationsDeskApiRow[]
        history?: OperationsDeskApiRow[]
        treasury?: {
          operational_pool_env_configured: boolean
          pool_available_usd: number | null
          settlement_mode?: string
          debit_source?: string
          pool_user_id_masked?: string | null
          master_liquidity_strict?: boolean
          settlement_summary?: string
          settlement_remediation?: string | null
          approved_float_topups_total_usd?: number
          pending_float_topup_count?: number
          pending_float_topup_amount_requested_usd?: number
          retailer_desk_retail_balance_total_usd?: number
          stats_available?: boolean
          stats_error?: string | null
        }
        error?: string
      }
      if (!deskRes.ok) {
        setDeskError(dj.error ?? `Operations desk (${deskRes.status}). Level 5 profile required for liquidity approvals.`)
        setDeskPending([])
        setDeskHistory([])
      } else {
        setDeskPending(dj.pending ?? [])
        setDeskHistory(dj.history ?? [])
        setTreasuryMeta(dj.treasury ?? null)
      }
      if (rfRes.ok) {
        const rj = (await rfRes.json()) as { retailers?: Array<Record<string, unknown>> }
        setApprovalRetailers(rj.retailers ?? [])
      }
    } catch {
      setDeskError("Network error loading operations desk.")
    } finally {
      setLoading(false)
    }
  }, [])

  const bumpAdminQueues = useCallback(() => {
    void refreshApproval()
    void refreshHistory()
  }, [refreshApproval, refreshHistory])

  useEffect(() => {
    const id = focusSupportThreadId?.trim()
    if (id) setSub("support")
  }, [focusSupportThreadId])

  useOperationalRealtime({
    enabled: !isGuest && Boolean(authUser?.id),
    role: "admin",
    userId: authUser?.id ?? null,
    onRetailerFundRequests: bumpAdminQueues,
    onWithdrawals: bumpAdminQueues,
    onTreasury: bumpAdminQueues,
    onContainerEvents: bumpAdminQueues,
    onRetailerApplications: bumpAdminQueues,
    onSupportThreads: () => {
      bumpAdminQueues()
      bumpSupportFeed()
    },
    onSupportMessages: () => {
      bumpAdminQueues()
      bumpSupportFeed()
    },
    onAccountNotifications: bumpAdminQueues,
  })

  const openReview = useCallback(async (row: OperationsDeskApiRow, ctx: "active" | "history") => {
    const h = await authHeaders()
    if (!h) return
    setReviewContext(ctx)
    setReviewRow(row)
    setResolutionDraft(row.resolution_note ?? "")
    setLedgerLoading(true)
    setLedgerPreview([])
    setAccountNotifPreview([])
    try {
      const qs = new URLSearchParams({
        limit: "40",
        userId: row.subject_user_id,
      })
      const [res, nRes] = await Promise.all([
        fetch(`/api/admin/financial-events?${qs.toString()}`, { headers: h, cache: "no-store" }),
        fetch(
          `/api/admin/user-account-notifications?userId=${encodeURIComponent(row.subject_user_id)}&limit=40`,
          { headers: h, cache: "no-store" }
        ),
      ])
      if (res.ok) {
        const j = (await res.json()) as { events?: Array<Record<string, unknown>> }
        setLedgerPreview(j.events ?? [])
      }
      if (nRes.ok) {
        const nj = (await nRes.json()) as {
          items?: Array<{
            id: string
            title: string
            body: string
            created_at: string
            user_deleted_at?: string | null
            read_at?: string | null
          }>
        }
        setAccountNotifPreview(nj.items ?? [])
      }
    } finally {
      setLedgerLoading(false)
    }
  }, [])

  const executeTopupAction = useCallback(
    async (action: "approve" | "reject" | "hold") => {
      if (!reviewRow) return
      const h = await authHeaders()
      if (!h) return
      setActionBusy(action)
      try {
        const res = await fetch("/api/admin/retailer-liquidity-topup", {
          method: "PATCH",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: reviewRow.id,
            action,
            resolutionNote: resolutionDraft.trim() || undefined,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          window.alert(j.error ?? "Action failed")
          return
        }
        setReviewRow(null)
        await refreshApproval()
      } finally {
        setActionBusy(null)
      }
    },
    [reviewRow, resolutionDraft, refreshApproval],
  )

  const executeFundingAction = useCallback(
    async (
      action: "approve" | "reject" | "under_review" | "resolve",
      opts?: { approvalMode?: "treasury_pool" | "retailer_retail_balance" },
    ) => {
      if (!reviewRow) return
      const h = await authHeaders()
      if (!h) return
      const busyKey =
        action === "approve" && opts?.approvalMode ? `approve:${opts.approvalMode}` : action
      setActionBusy(busyKey)
      try {
        const payload: Record<string, unknown> = {
          requestId: reviewRow.id,
          action,
          reason: resolutionDraft.trim() || undefined,
        }
        if (action === "approve" && opts?.approvalMode) {
          payload.approvalMode = opts.approvalMode
        }
        const res = await fetch("/api/admin/retailer-funding", {
          method: "PATCH",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          window.alert(j.error ?? "Action failed")
          return
        }
        setReviewRow(null)
        await refreshApproval()
      } finally {
        setActionBusy(null)
      }
    },
    [reviewRow, resolutionDraft, refreshApproval],
  )

  const executeWithdrawalAction = useCallback(
    async (decision: "approve" | "reject" | "hold") => {
      if (!reviewRow) return
      const h = await authHeaders()
      if (!h) return
      setActionBusy(decision)
      try {
        const res = await fetch("/api/admin/withdrawal-requests", {
          method: "PATCH",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: reviewRow.id,
            decision,
            resolutionNote: resolutionDraft.trim() || undefined,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          window.alert(j.error ?? "Action failed")
          return
        }
        setReviewRow(null)
        await refreshApproval()
      } finally {
        setActionBusy(null)
      }
    },
    [reviewRow, resolutionDraft, refreshApproval],
  )

  useEffect(() => {
    if (isGuest) return
    if (sub === "history") void refreshHistory()
    if (sub === "approval") void refreshApproval()
  }, [isGuest, sub, refreshHistory, refreshApproval])

  useEffect(() => {
    if (isGuest) return
    const id = window.setInterval(() => {
      void refreshApproval()
      if (sub === "history") void refreshHistory()
    }, 45_000)
    return () => window.clearInterval(id)
  }, [isGuest, sub, refreshApproval, refreshHistory])

  const runUserAction = async (userId: string, action: AdminUserRowActions) => {
    const h = await authHeaders()
    if (!h) return
    if (action === "recovery_link") {
      const ok = window.confirm("Generate a one-time recovery link? Deliver it securely to the user.")
      if (!ok) return
    }
    if (action === "reset_password") {
      const ok = window.confirm(
        "Set a new random password on this account? The temporary password will be copied once — share via a verified channel.",
      )
      if (!ok) return
    }
    if (action === "burn_balances") {
      const ok = window.confirm(
        "ZERO Nexus Main, Retail Balance, and withdrawal pending for this user? This cannot be undone from the UI.",
      )
      if (!ok) return
    }
    if (action === "delete_user") {
      const ok = window.confirm(
        "PERMANENTLY delete this auth account from Supabase? Related rows may cascade depending on DB policy.",
      )
      if (!ok) return
    }
    const body: Record<string, unknown> = { userId, action }
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        recoveryActionLink?: string
        temporaryPassword?: string
        message?: string
      }
      if (!res.ok) {
        window.alert(j.error ?? "Failed")
        return
      }
      if (action === "recovery_link" && j.recoveryActionLink) {
        await navigator.clipboard.writeText(j.recoveryActionLink).catch(() => null)
        window.alert("Recovery link copied to clipboard. Send through a verified channel.")
      }
      if (action === "reset_password" && j.temporaryPassword) {
        await navigator.clipboard.writeText(j.temporaryPassword).catch(() => null)
        window.alert(j.message ?? "Temporary password copied once. User should sign in and change password.")
      }
      if (action === "burn_balances" || action === "delete_user") {
        window.alert(j.message ?? "Done.")
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

  const runSetUserLevel = async (userId: string, tradingUserLevel: 1 | 2 | 5) => {
    const h = await authHeaders()
    if (!h) return
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "set_level", tradingUserLevel }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        window.alert(j.error ?? "Failed")
        return
      }
      await searchUsers()
    } finally {
      setLoading(false)
    }
  }

  const snoozeDeskRow = (row: OperationsDeskApiRow) => {
    const note = window.prompt("Optional note (saved on this device only). Row moves to Saved below.") ?? ""
    persistDeskSnooze([...deskSnoozed, { key: deskRowKey(row), note: note.trim(), at: Date.now() }])
  }

  const restoreSnoozedDeskRow = (key: string) => {
    persistDeskSnooze(deskSnoozed.filter((s) => s.key !== key))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "approval" as const, label: "Approval desk", icon: ShieldCheck },
            { id: "support" as const, label: "Human support", icon: MessageCircle },
            { id: "users" as const, label: "Users", icon: Users },
            { id: "history" as const, label: "History", icon: History },
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

      {sub === "support" && (
        <AdminSupportChatPanel
          initialThreadId={focusSupportThreadId}
          onInitialThreadConsumed={onFocusSupportThreadConsumed}
          refreshTick={supportFeedTick}
        />
      )}

      {sub === "users" && (
        <Card className="border-border bg-card p-4">
          <h3 className="mb-3 text-lg font-semibold">Global user controls</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Search by UUID or email fragment. Set tier (L1 / L2 / L5), governance flags, one-time admin password, or burn
            liquid balances. Destructive actions require confirmation.
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
                <div className="flex w-full max-w-2xl flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Tier</span>
                    <button
                      type="button"
                      className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-semibold hover:bg-muted"
                      onClick={() => void runSetUserLevel(u.id, 1)}
                    >
                      L1
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-semibold hover:bg-muted"
                      onClick={() => void runSetUserLevel(u.id, 2)}
                    >
                      L2
                    </button>
                    <button
                      type="button"
                      className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                      onClick={() => void runSetUserLevel(u.id, 5)}
                    >
                      L5
                    </button>
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
                    <button
                      type="button"
                      className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-900 dark:text-amber-100"
                      onClick={() => void runUserAction(u.id, "reset_password")}
                    >
                      Admin set password
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-orange-500/15 px-2 py-1 text-xs font-semibold text-orange-900 dark:text-orange-100"
                      onClick={() => void runUserAction(u.id, "burn_balances")}
                    >
                      Burn balances
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground"
                      onClick={() => void runUserAction(u.id, "delete_user")}
                    >
                      Delete user
                    </button>
                  </div>
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
            <div className="max-h-[480px] space-y-2 overflow-y-auto text-xs">
              {events.slice(0, 200).map((ev) => {
                const trace = ledgerOperationalTraceLines({
                  metadata: ev.metadata,
                  balance_source: (ev as { balance_source?: string | null }).balance_source,
                  balance_destination: (ev as { balance_destination?: string | null }).balance_destination,
                })
                return (
                  <div
                    key={String(ev.id)}
                    className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 font-mono text-[10px]"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-muted-foreground">{String(ev.created_at ?? "").slice(0, 19)}</span>
                      <span>{String(ev.user_id ?? "").slice(0, 8)}…</span>
                      <span className="font-semibold text-foreground">{String(ev.event_type ?? "")}</span>
                      <span>{String(ev.status ?? "")}</span>
                      <span>${Number(ev.gross_amount ?? 0).toFixed(2)}</span>
                    </div>
                    {trace.length ? (
                      <ul className="mt-1 space-y-0.5 border-t border-border/40 pt-1 text-[9px] text-muted-foreground">
                        {trace.map((line, i) => (
                          <li key={`${String(ev.id)}-t-${i}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {sub === "approval" && (
        <div className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Liquidity operations desk</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Level 5 only. Click any row for review, settlement, ledger context, and fraud signals. Resolved items remain
                  in History.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshApproval()}
                className="inline-flex items-center gap-2 self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Refresh queue
              </button>
            </div>

            <div className="mb-4 space-y-3">
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  treasuryMeta?.settlement_mode === "dedicated_pool"
                    ? "border-primary/30 bg-primary/5"
                    : treasuryMeta?.settlement_mode === "approver_nexus_main"
                      ? "border-blue-500/30 bg-blue-500/10 dark:text-blue-50"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50"
                }`}
              >
                <p className="font-semibold">
                  Treasury settlement mode:{" "}
                  <span className="font-mono">
                    {treasuryMeta?.settlement_mode === "dedicated_pool"
                      ? "Dedicated pool (recommended)"
                      : treasuryMeta?.settlement_mode === "approver_nexus_main"
                        ? "Approver Nexus Main debit"
                        : "Not configured"}
                  </span>
                  {treasuryMeta?.master_liquidity_strict ? (
                    <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                      STRICT
                    </span>
                  ) : null}
                </p>
                {treasuryMeta?.pool_user_id_masked ? (
                  <p className="mt-1 text-muted-foreground">
                    Pool user id (masked): <span className="font-mono">{treasuryMeta.pool_user_id_masked}</span>
                  </p>
                ) : null}
                <p className="mt-2 text-muted-foreground">{treasuryMeta?.settlement_summary}</p>
                {treasuryMeta?.settlement_remediation ? (
                  <p className="mt-2 font-medium text-amber-900 dark:text-amber-100">{treasuryMeta.settlement_remediation}</p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Treasury pool (Nexus Main)</p>
                  <p className="text-lg font-bold tabular-nums">
                    ${Number(treasuryMeta?.pool_available_usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {treasuryMeta?.operational_pool_env_configured ? "Available to fund approvals" : "— set pool UUID env"}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Approved float credits (historical)</p>
                  <p className="text-lg font-bold tabular-nums">
                    $
                    {Number(treasuryMeta?.approved_float_topups_total_usd ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Sum of amount_credited (incl. commission)</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Pending retailer float requests</p>
                  <p className="text-lg font-bold tabular-nums">
                    {Number(treasuryMeta?.pending_float_topup_count ?? 0)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">req</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Requested base total ~ $
                    {Number(treasuryMeta?.pending_float_topup_amount_requested_usd ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    (approval debits base + commission)
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Retail float on desks</p>
                  <p className="text-lg font-bold tabular-nums">
                    $
                    {Number(treasuryMeta?.retailer_desk_retail_balance_total_usd ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Σ retail_balance (retailer_profiles)</p>
                </div>
              </div>
              {treasuryMeta?.stats_available === false && treasuryMeta?.stats_error ? (
                <p className="text-[11px] text-destructive">
                  Aggregate stats unavailable ({treasuryMeta.stats_error}). Apply migration{" "}
                  <code className="rounded bg-muted px-1">admin_treasury_float_stats</code> or refresh after deploy.
                </p>
              ) : null}
            </div>

            {deskError ? (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deskError}
              </div>
            ) : null}

            <div className="mb-4 inline-flex rounded-lg border border-border p-1">
              <button
                type="button"
                onClick={() => setApprovalView("active")}
                className={`rounded-md px-4 py-1.5 text-xs font-semibold ${
                  approvalView === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Active ({visibleDeskPending.length}/{deskPending.length})
              </button>
              <button
                type="button"
                onClick={() => setApprovalView("history")}
                className={`rounded-md px-4 py-1.5 text-xs font-semibold ${
                  approvalView === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                History ({deskHistory.length})
              </button>
            </div>

            <div className="max-h-[520px] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[920px] border-collapse text-left text-[11px]">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                  <tr className="border-b border-border">
                    <th className="p-2 font-semibold">When / age</th>
                    <th className="p-2 font-semibold">Type</th>
                    <th className="p-2 font-semibold">Party</th>
                    <th className="p-2 font-semibold">Network</th>
                    <th className="p-2 font-semibold">Reference</th>
                    <th className="p-2 font-semibold">Amount</th>
                    <th className="p-2 font-semibold">Balances</th>
                    <th className="p-2 font-semibold">Status</th>
                    <th className="p-2 font-semibold">Risk</th>
                    <th className="p-2 font-semibold">Queue</th>
                  </tr>
                </thead>
                <tbody>
                  {(approvalView === "active" ? visibleDeskPending : deskHistory).map((row) => (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className="cursor-pointer border-b border-border/60 hover:bg-muted/40"
                      onClick={() => void openReview(row, approvalView)}
                    >
                      <td className="p-2 align-top">
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </div>
                        <div className="text-[10px]">{formatPendingAge(row.pending_ms)}</div>
                      </td>
                      <td className="p-2 align-top">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                          {row.kind === "retailer_float_topup"
                            ? "Float"
                            : row.kind === "user_withdrawal"
                              ? "Withdraw"
                              : "Add funds"}
                        </span>
                        <div className="mt-1 text-muted-foreground">{row.request_type_label}</div>
                      </td>
                      <td className="p-2 align-top">
                        <div className="font-medium">{row.subject_name ?? "—"}</div>
                        <div className="truncate text-muted-foreground">{row.subject_email ?? row.subject_user_id}</div>
                        <div className="text-[10px] text-muted-foreground">{row.country_code ?? "Country —"}</div>
                      </td>
                      <td className="p-2 align-top font-mono text-[10px]">
                        {row.kind === "user_withdrawal"
                          ? row.fund_channel ?? "—"
                          : row.kind === "user_add_funds"
                            ? row.fund_channel ?? "—"
                            : "crypto_ref"}
                        {row.mobile_network ? (
                          <>
                            <br />
                            {row.mobile_network}
                          </>
                        ) : null}
                      </td>
                      <td className="p-2 align-top font-mono text-[10px] break-all">{row.tx_reference}</td>
                      <td className="p-2 align-top font-semibold">${Number(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 align-top font-mono text-[10px]">
                        Main ${Number(row.nexus_main_usd ?? 0).toFixed(0)}
                        <br />
                        Retail ${Number(row.retail_balance_usd ?? 0).toFixed(0)}
                        {row.withdrawal_pending_usd != null ? (
                          <>
                            <br />
                            Pending WD ${Number(row.withdrawal_pending_usd).toFixed(0)}
                          </>
                        ) : null}
                        {row.retailer_basin_usd != null ? (
                          <>
                            <br />
                            Basin ${Number(row.retailer_basin_usd).toFixed(0)}
                          </>
                        ) : null}
                      </td>
                      <td className="p-2 align-top text-[10px] font-semibold">
                        <span className="uppercase">{row.status}</span>
                        {row.kind === "user_withdrawal" && row.payout_status ? (
                          <span className="block font-normal normal-case text-muted-foreground">{row.payout_status}</span>
                        ) : null}
                      </td>
                      <td className="p-2 align-top text-[10px] text-rose-700 dark:text-rose-400">
                        {row.duplicate_risk_hint ?? "—"}
                      </td>
                      <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                        {approvalView === "active" ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                            title="Hide from main queue — review later under Saved"
                            onClick={() => snoozeDeskRow(row)}
                          >
                            <Bookmark className="h-3 w-3" />
                            Save
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {(approvalView === "active" ? visibleDeskPending : deskHistory).length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-muted-foreground" colSpan={10}>
                        {loading ? "Loading…" : "No rows in this bucket."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {approvalView === "active" && deskSnoozed.length > 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/25 p-3 text-[11px]">
                <p className="mb-2 font-semibold text-foreground">Saved for later (this browser)</p>
                <ul className="max-h-40 space-y-2 overflow-y-auto">
                  {deskSnoozed.map((s) => (
                    <li
                      key={s.key}
                      className="flex flex-wrap items-start justify-between gap-2 rounded border border-border bg-background px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] text-muted-foreground break-all">{s.key}</span>
                        {s.note ? <p className="text-muted-foreground">{s.note}</p> : null}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-[10px] font-semibold text-primary underline"
                        onClick={() => restoreSnoozedDeskRow(s.key)}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card className="border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Retail desk directory</p>
            <p className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
              {approvalRetailers.slice(0, 32).map((r) => (
                <span key={String(r.id)} className="mr-3 inline-block truncate">
                  <span className="font-medium text-foreground">
                    {String(r.profile_email ?? "").trim() || `${String(r.user_id ?? "").slice(0, 8)}…`}
                  </span>{" "}
                  · {String(r.country_code ?? "—")} · basin ${Number(r.credit_basin ?? 0).toFixed(0)}
                </span>
              ))}
            </p>
          </Card>

          <Dialog open={Boolean(reviewRow)} onOpenChange={(o) => !o && setReviewRow(null)}>
            <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Liquidity review</DialogTitle>
              </DialogHeader>
              {!reviewRow ? null : (
                <div className="space-y-4 text-sm">
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <p className="font-semibold">
                      {reviewRow.kind === "retailer_float_topup"
                        ? "Retailer float (crypto proof)"
                        : reviewRow.kind === "user_withdrawal"
                          ? "Withdrawal / cashout"
                          : "Customer add funds"}
                    </p>
                    <p className="mt-2 text-muted-foreground">{reviewRow.request_type_label}</p>
                    <p className="mt-2 font-mono break-all">Ref · {reviewRow.tx_reference}</p>
                    <p className="mt-1 font-mono">${Number(reviewRow.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  {reviewRow.duplicate_risk_hint ? (
                    <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-800 dark:text-rose-100">
                      {reviewRow.duplicate_risk_hint}
                    </div>
                  ) : null}
                  <div className="grid gap-2 text-xs">
                    <p>
                      <span className="text-muted-foreground">Subject</span>{" "}
                      <span className="font-medium">
                        {reviewRow.subject_name ?? "—"} · {reviewRow.subject_email ?? ""}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Country</span> {reviewRow.country_code ?? "—"}
                    </p>
                    <p className="font-mono">
                      Balances snapshot — Main ${Number(reviewRow.nexus_main_usd ?? 0).toFixed(2)} · Retail $
                      {Number(reviewRow.retail_balance_usd ?? 0).toFixed(2)}
                      {reviewRow.withdrawal_pending_usd != null
                        ? ` · Withdrawal pending $${Number(reviewRow.withdrawal_pending_usd).toFixed(2)}`
                        : ""}
                      {reviewRow.retailer_basin_usd != null ? ` · Basin $${Number(reviewRow.retailer_basin_usd).toFixed(2)}` : ""}
                    </p>
                    {reviewRow.kind === "user_withdrawal" ? (
                      <p className="text-[11px] text-muted-foreground">
                        Currency context · {reviewRow.fund_channel ?? "—"}
                        <br />
                        Payout rail / destination · {reviewRow.mobile_network ?? "—"}
                        <br />
                        Payout state · {reviewRow.payout_status ?? "—"}
                      </p>
                    ) : null}
                    {reviewRow.kind === "user_add_funds" ? (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Payer line</span> {reviewRow.payer_display_name ?? "—"} /{" "}
                        {reviewRow.payer_phone ?? "—"}
                        {reviewRow.retailer_desk_email ? (
                          <>
                            <br />
                            <span className="text-muted-foreground">Desk</span> {reviewRow.retailer_desk_email}
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      User ledger snapshot (recent events for this account)
                      {ledgerLoading ? <Loader2 className="ml-2 inline h-3 w-3 animate-spin" /> : null}
                    </p>
                    <ul className="max-h-48 space-y-2 overflow-y-auto rounded border border-border bg-background p-2 font-mono text-[10px]">
                      {ledgerPreview.slice(0, 20).map((ev) => {
                        const trace = ledgerOperationalTraceLines({
                          metadata: ev.metadata,
                          balance_source: (ev as { balance_source?: string | null }).balance_source,
                          balance_destination: (ev as { balance_destination?: string | null }).balance_destination,
                        })
                        return (
                          <li key={String(ev.id)} className="rounded border border-border/50 px-1.5 py-1">
                            <span className="block truncate">
                              {String(ev.created_at ?? "").slice(0, 19)} · {String(ev.event_type ?? "")} · $
                              {Number(ev.gross_amount ?? 0).toFixed(0)}
                            </span>
                            {trace.length ? (
                              <span className="mt-0.5 block whitespace-normal text-[9px] leading-snug text-muted-foreground">
                                {trace.join(" · ")}
                              </span>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                    <p className="text-muted-foreground">
                      Account notification log (includes items the user dismissed from their inbox)
                    </p>
                    <ul className="max-h-32 space-y-1 overflow-y-auto rounded border border-border bg-background p-2 text-[10px]">
                      {accountNotifPreview.length ? (
                        accountNotifPreview.slice(0, 25).map((n) => (
                          <li key={n.id} className="truncate">
                            {String(n.created_at ?? "").slice(0, 19)} · {n.user_deleted_at ? "[hidden from user] " : ""}
                            {n.read_at ? "· read " : "· unread "}
                            {n.title}: {n.body.slice(0, 120)}
                            {n.body.length > 120 ? "…" : ""}
                          </li>
                        ))
                      ) : (
                        <li className="text-muted-foreground">No rows loaded.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Decision note (reject / hold / approve context)
                    </label>
                    <textarea
                      className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs"
                      rows={3}
                      value={resolutionDraft}
                      onChange={(e) => setResolutionDraft(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reviewContext === "history" ? (
                      <p className="text-xs text-muted-foreground">Read-only: item is in History (already adjudicated).</p>
                    ) : reviewRow.kind === "retailer_float_topup" &&
                      (reviewRow.status === "pending" || reviewRow.status === "under_review") ? (
                      <>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeTopupAction("approve")}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve (+commission)"}
                        </button>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeTopupAction("hold")}
                          className="rounded-lg bg-slate-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "hold" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hold / investigate"}
                        </button>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeTopupAction("reject")}
                          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
                        </button>
                      </>
                    ) : reviewRow.kind === "retailer_float_topup" ? (
                      <p className="text-xs text-muted-foreground">
                        Queue row is read-only until status returns to pending/review — refresh desk.
                      </p>
                    ) : reviewRow.kind === "user_withdrawal" &&
                      (reviewRow.status === "pending" || reviewRow.status === "under_review") ? (
                      <>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeWithdrawalAction("approve")}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve (recycle)"}
                        </button>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeWithdrawalAction("hold")}
                          className="rounded-lg bg-slate-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "hold" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hold / investigate"}
                        </button>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeWithdrawalAction("reject")}
                          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
                        </button>
                      </>
                    ) : reviewRow.kind === "user_withdrawal" ? (
                      <p className="text-xs text-muted-foreground">
                        Withdrawal already settled — payout rail is outside this dialog.
                      </p>
                    ) : reviewRow.status === "pending" ||
                      reviewRow.status === "under_review" ||
                      reviewRow.status === "appealed" ||
                      reviewRow.status === "escalated" ? (
                      <>
                        {reviewRow.kind === "user_add_funds" &&
                        String(reviewRow.fund_channel ?? "") === "local_mobile" ? (
                          <div className="flex w-full flex-col gap-3">
                            <p className="text-[11px] font-medium text-amber-950 dark:text-amber-100">
                              Two explicit rails — there is <strong>no automatic fallback</strong>. Pick the liquidity that
                              actually funds this credit.
                            </p>
                            <button
                              type="button"
                              disabled={!!actionBusy}
                              onClick={() =>
                                void executeFundingAction("approve", { approvalMode: "retailer_retail_balance" })
                              }
                              className="flex w-full flex-col items-start gap-1 rounded-xl border-2 border-amber-600 bg-amber-500/15 px-4 py-3 text-left shadow-sm transition hover:bg-amber-500/25 disabled:opacity-50 dark:border-amber-500 dark:bg-amber-950/40"
                            >
                              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-950 dark:text-amber-50">
                                <Building2 className="h-4 w-4 shrink-0" />
                                Approve via retailer liquidity
                              </span>
                              <span className="text-[11px] font-normal text-muted-foreground">
                                Debits the desk&apos;s <strong>Retail Balance</strong>. Company treasury is not used.
                              </span>
                              <span className="font-mono text-[10px] text-amber-900/90 dark:text-amber-200/90">
                                {actionBusy === "approve:retailer_retail_balance" ? (
                                  <Loader2 className="inline h-3 w-3 animate-spin" />
                                ) : (
                                  "RETAIL_BALANCE → customer Nexus Main"
                                )}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={!!actionBusy}
                              onClick={() => void executeFundingAction("approve", { approvalMode: "treasury_pool" })}
                              className="flex w-full flex-col items-start gap-1 rounded-xl border-2 border-sky-700 bg-sky-500/10 px-4 py-3 text-left shadow-sm transition hover:bg-sky-500/20 disabled:opacity-50 dark:border-sky-500 dark:bg-sky-950/35"
                            >
                              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-sky-950 dark:text-sky-50">
                                <Landmark className="h-4 w-4 shrink-0" />
                                Approve via company treasury
                              </span>
                              <span className="flex items-start gap-1.5 text-[11px] font-normal text-muted-foreground">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                Debits <strong>MAIN_TREASURY</strong> — intentional company funding. Retailer float stays
                                untouched.
                              </span>
                              <span className="font-mono text-[10px] text-sky-900/90 dark:text-sky-200/90">
                                {actionBusy === "approve:treasury_pool" ? (
                                  <Loader2 className="inline h-3 w-3 animate-spin" />
                                ) : (
                                  "MAIN_TREASURY → customer Nexus Main"
                                )}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!!actionBusy}
                            onClick={() => void executeFundingAction("approve")}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {actionBusy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeFundingAction("under_review")}
                          className="rounded-lg bg-slate-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "under_review" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Hold / investigate"
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeFundingAction("reject")}
                          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {actionBusy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
                        </button>
                        <button
                          type="button"
                          disabled={!!actionBusy}
                          onClick={() => void executeFundingAction("resolve")}
                          className="rounded-lg border border-border px-4 py-2 text-xs font-bold disabled:opacity-50"
                        >
                          {actionBusy === "resolve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resolve"}
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No settlement actions remain for this request status.</p>
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  )
}
