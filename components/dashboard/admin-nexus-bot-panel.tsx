"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NEXUS_AUTO_TRADE_PLAN_KEYS } from "@/lib/nexus-bot/plans"
import {
  defaultTradeSessionWindow,
  formatSessionClock,
  parseDatetimeLocalInput,
  toDatetimeLocalInputValue,
} from "@/lib/nexus-bot/trade-code"

type TradeSessionRow = {
  id: string
  code: string
  session_name: string
  session_slot: string
  start_at: string
  end_at: string
  status: string
  display_label: string | null
  created_at: string
  admin_terminated_at?: string | null
  adminTerminated?: boolean
  participants?: { active: number; completed: number }
}

type Stats = {
  generatedCodes: number
  registeredSessions: number
  activeSessions: number
  expiredSessions: number
  participants: number
  totalCapitalAllocatedUsd: number
  totalReleasedProfitUsd: number
}

export function AdminNexusBotPanel() {
  const [view, setView] = useState<"sessions" | "grants" | "legacy">("sessions")
  const [sessions, setSessions] = useState<TradeSessionRow[]>([])
  const [unregisteredCodes, setUnregisteredCodes] = useState<Array<{ code: string; created_at: string }>>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [sessionFilter, setSessionFilter] = useState<"all" | "active" | "expired">("all")

  const [registerCode, setRegisterCode] = useState("")
  const [sessionName, setSessionName] = useState("")
  const [sessionSlot, setSessionSlot] = useState<"morning" | "evening">("morning")
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [registerStatus, setRegisterStatus] = useState<"draft" | "active">("active")

  const [slot, setSlot] = useState<"morning" | "evening">("morning")
  const [code, setCode] = useState("")
  const [strategyTitle, setStrategyTitle] = useState("")
  const [confidence, setConfidence] = useState("High")
  const [durationHours, setDurationHours] = useState("12")
  const [grantUserId, setGrantUserId] = useState("")
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [lastRegistered, setLastRegistered] = useState<TradeSessionRow | null>(null)
  const [registeredOk, setRegisteredOk] = useState(false)
  const [reviewUserId, setReviewUserId] = useState("")
  const [memberPoints, setMemberPoints] = useState<{
    points: number
    completedSessions: number
    events: Array<{ delta: number; reason: string; source: string; created_at: string }>
  } | null>(null)

  const tokenHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error("Not signed in")
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  }

  const loadMemberPoints = async () => {
    if (!reviewUserId.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const h = await tokenHeaders()
      const res = await fetch(
        `/api/admin/trade-sessions?userId=${encodeURIComponent(reviewUserId.trim())}`,
        { headers: h },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Load failed")
      setMemberPoints(j.memberPoints ?? null)
      setMsg("Member performance loaded")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed")
    } finally {
      setBusy(false)
    }
  }

  const applyDefaultTimes = useCallback((slot: "morning" | "evening") => {
    const { start, end } = defaultTradeSessionWindow(slot)
    setStartAt(toDatetimeLocalInputValue(start))
    setEndAt(toDatetimeLocalInputValue(end))
  }, [])

  const pickGeneratedCode = (codeValue: string) => {
    setRegisterCode(codeValue)
    setRegisterError(null)
    setRegisteredOk(false)
    if (!sessionName.trim()) {
      setSessionName(sessionSlot === "morning" ? "Session 1 Morning" : "Session 2 Evening")
    }
    if (!startAt || !endAt) {
      applyDefaultTimes(sessionSlot)
    }
  }

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const h = await tokenHeaders()
      const res = await fetch(`/api/admin/trade-sessions?view=${sessionFilter}`, { headers: h })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Load failed")
      setSessions(j.sessions ?? [])
      setUnregisteredCodes(j.unregisteredCodes ?? [])
      setStats(j.stats ?? null)
    } finally {
      setSessionsLoading(false)
    }
  }, [sessionFilter])

  useEffect(() => {
    if (view !== "sessions") return
    if (!startAt && !endAt) {
      applyDefaultTimes(sessionSlot)
    }
  }, [view, sessionSlot, startAt, endAt, applyDefaultTimes])

  useEffect(() => {
    if (view !== "sessions") return
    void loadSessions().catch((e) => setMsg(e instanceof Error ? e.message : "Load failed"))
  }, [view, loadSessions])

  const generateCodes = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const h = await tokenHeaders()
      const res = await fetch("/api/admin/trade-sessions", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ action: "generate", count: 3 }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Generate failed")
      setMsg(`Generated: ${(j.codes as string[]).join(", ")}`)
      await loadSessions()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Generate failed")
    } finally {
      setBusy(false)
    }
  }

  const registerSession = async () => {
    setRegisterError(null)
    setRegisteredOk(false)
    setLastRegistered(null)

    const start = parseDatetimeLocalInput(startAt)
    const end = parseDatetimeLocalInput(endAt)
    if (!registerCode.trim()) {
      setRegisterError("Paste or select a generated code.")
      return
    }
    if (!sessionName.trim()) {
      setRegisterError("Enter a session name.")
      return
    }
    if (!start || !end) {
      setRegisterError("Set valid start and end times.")
      return
    }
    if (end.getTime() <= start.getTime()) {
      setRegisterError("End time must be after start time.")
      return
    }

    setBusy(true)
    setMsg(null)
    try {
      const h = await tokenHeaders()
      const res = await fetch("/api/admin/trade-sessions", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          action: "register",
          code: registerCode,
          sessionName,
          sessionSlot,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: registerStatus,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        session?: {
          sessionId: string
          code: string
          sessionName: string
          sessionSlot: string
          startAt: string
          endAt: string
          status: string
          displayLabel: string
        }
      }
      if (!res.ok) throw new Error(j.error ?? "Register failed")

      const saved = j.session
      if (!saved?.sessionId) throw new Error("Registration did not persist — retry.")

      setRegisteredOk(true)
      setLastRegistered({
        id: saved.sessionId,
        code: saved.code,
        session_name: saved.sessionName,
        session_slot: saved.sessionSlot,
        start_at: saved.startAt,
        end_at: saved.endAt,
        status: saved.status,
        display_label: saved.displayLabel,
        created_at: new Date().toISOString(),
      })
      setMsg(`Registered ${saved.code} · ${saved.status} · saved to database`)
      setRegisterCode("")
      setRegisterError(null)
      await loadSessions()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Register failed"
      setRegisterError(message)
      setMsg(message)
    } finally {
      setBusy(false)
    }
  }

  const canRegister =
    Boolean(registerCode.trim()) &&
    Boolean(sessionName.trim()) &&
    Boolean(startAt) &&
    Boolean(endAt) &&
    !busy

  const terminateSession = async (session: TradeSessionRow) => {
    const activeCount = session.participants?.active ?? 0
    const ok = window.confirm(
      `End session ${session.code} now?\n\n` +
        `${activeCount} active participant(s) will be settled at full session target. ` +
        `Users will see a normal completed trade — no early exit.`,
    )
    if (!ok) return
    setBusy(true)
    setMsg(null)
    try {
      const h = await tokenHeaders()
      const res = await fetch("/api/admin/trade-sessions", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ action: "terminate", tradeSessionId: session.id }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        participantsSettled?: number
        totalProfitUsd?: number
      }
      if (!res.ok) throw new Error(j.error ?? "Terminate failed")
      setMsg(
        j.message ??
          `Session ended — ${j.participantsSettled ?? 0} settled, $${Number(j.totalProfitUsd ?? 0).toFixed(2)} profit released.`,
      )
      await loadSessions()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Terminate failed")
    } finally {
      setBusy(false)
    }
  }

  const publishSignal = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const h = await tokenHeaders()
      const opens = new Date()
      const hours = Math.max(1, Number(durationHours) || 12)
      const closes = new Date(opens.getTime() + hours * 3_600_000)
      const res = await fetch("/api/admin/nexus-signal-codes", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          slot,
          code,
          strategyTitle,
          confidence,
          durationHours: hours,
          windowOpensAt: opens.toISOString(),
          windowClosesAt: closes.toISOString(),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Publish failed")
      setMsg(`Published legacy ${slot} code ${j.code?.code ?? code}`)
      setCode("")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Publish failed")
    } finally {
      setBusy(false)
    }
  }

  const loadGrants = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const h = await tokenHeaders()
      const res = await fetch(
        `/api/admin/nexus-bot/auto-trade-grants?userId=${encodeURIComponent(grantUserId.trim())}`,
        { headers: h },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Load failed")
      setGrants(j.grants ?? {})
      setMsg("Grants loaded")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed")
    } finally {
      setBusy(false)
    }
  }

  const saveGrants = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const h = await tokenHeaders()
      const res = await fetch("/api/admin/nexus-bot/auto-trade-grants", {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ userId: grantUserId.trim(), grants }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Save failed")
      setMsg("Auto Trade grants saved")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const releaseAllLegacy = async () => {
    if (!confirm("Release ALL active copy/fixed sessions for all users?")) return
    setBusy(true)
    try {
      const h = await tokenHeaders()
      const res = await fetch("/api/admin/container-legacy/release", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ allUsers: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Release failed")
      setMsg(`Legacy release: ${j.usersProcessed ?? 0} users processed`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Release failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "sessions" as const, label: "Trade Sessions" },
            { id: "grants" as const, label: "Auto Trade grants" },
            { id: "legacy" as const, label: "Legacy release" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              view === t.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      {view === "sessions" ? (
        <>
          {stats ? (
            <Card className="grid gap-2 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Generated codes</p>
                <p className="font-mono font-semibold">{stats.generatedCodes}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Active sessions</p>
                <p className="font-mono font-semibold">{stats.activeSessions}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Participants</p>
                <p className="font-mono font-semibold">{stats.participants}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Released profit (USD)</p>
                <p className="font-mono font-semibold">{stats.totalReleasedProfitUsd.toFixed(2)}</p>
              </div>
            </Card>
          ) : null}

          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">Generate trade code</h3>
            <p className="text-xs text-muted-foreground">
              Creates unique codes stored in history. Only a manually registered code becomes active.
            </p>
            <Button
              type="button"
              className="min-h-[48px] w-full touch-manipulation sm:w-auto"
              disabled={busy}
              onClick={() => void generateCodes()}
            >
              {busy ? "Working…" : "Generate trade code"}
            </Button>
            {unregisteredCodes.length > 0 ? (
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <p className="mb-2 font-medium">Unregistered suggestions — tap to fill register form</p>
                <div className="flex flex-wrap gap-2">
                  {unregisteredCodes.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className="min-h-[44px] rounded-md bg-background px-3 py-2 font-mono touch-manipulation hover:ring-2 hover:ring-primary/40"
                      onClick={() => pickGeneratedCode(c.code)}
                    >
                      {c.code}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Register trade code</h3>
              {registeredOk ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                  Code registered
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Registration is saved on the server immediately. Users can verify only <strong>active</strong>{" "}
              sessions before end time.
            </p>
            <Input
              value={registerCode}
              onChange={(e) => {
                setRegisterCode(e.target.value.toUpperCase())
                setRegisterError(null)
                setRegisteredOk(false)
              }}
              placeholder="NXP-7A82-X91K"
              className="min-h-[48px] font-mono uppercase"
            />
            <Input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Session 1 Morning"
            />
            <div className="flex gap-2">
              {(["morning", "evening"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSessionSlot(s)
                    applyDefaultTimes(s)
                    setRegisterError(null)
                  }}
                  className={`min-h-[44px] flex-1 rounded-lg py-2 text-sm capitalize touch-manipulation ${
                    sessionSlot === s ? "bg-primary/15 text-primary" : "bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Start time
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="text-xs">
                End time
                <Input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="mt-1"
                />
              </label>
            </div>
            <div className="flex gap-2">
              {(["draft", "active"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRegisterStatus(s)}
                  className={`flex-1 rounded-lg py-2 text-sm capitalize ${
                    registerStatus === s ? "bg-primary/15 text-primary" : "bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {registerError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {registerError}
              </p>
            ) : null}
            {lastRegistered ? (
              <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
                <p className="font-semibold text-success">Saved to database</p>
                <p className="font-mono">{lastRegistered.code}</p>
                <p>
                  {lastRegistered.session_name} · {lastRegistered.status} ·{" "}
                  {formatSessionClock(lastRegistered.start_at)} – {formatSessionClock(lastRegistered.end_at)}
                </p>
              </div>
            ) : null}
            <Button
              type="button"
              className="min-h-[52px] w-full touch-manipulation text-base font-semibold"
              disabled={!canRegister}
              onClick={() => void registerSession()}
            >
              {busy ? "Registering on server…" : "Register trade code"}
            </Button>
            {sessionsLoading ? (
              <p className="text-xs text-muted-foreground">Refreshing session list…</p>
            ) : null}
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Session history</h3>
              <div className="flex gap-2">
                {(["all", "active", "expired"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSessionFilter(f)}
                    className={`rounded-lg px-3 py-1 text-xs capitalize ${
                      sessionFilter === f ? "bg-primary/15 text-primary" : "bg-muted"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{s.code}</span>
                      <span
                        className={`text-xs font-semibold uppercase ${
                          s.status === "active"
                            ? "text-success"
                            : s.status === "expired"
                              ? "text-muted-foreground"
                              : "text-warning"
                        }`}
                      >
                        {s.adminTerminated ? "ended early" : s.status}
                      </span>
                    </div>
                    <p className="mt-1">{s.session_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSessionClock(s.start_at)} – {formatSessionClock(s.end_at)} · {s.session_slot}
                      {(s.participants?.active ?? 0) > 0
                        ? ` · ${s.participants?.active} active`
                        : ""}
                      {(s.participants?.completed ?? 0) > 0
                        ? ` · ${s.participants?.completed} completed`
                        : ""}
                    </p>
                    {s.status === "active" ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mt-3 min-h-[44px] w-full touch-manipulation sm:w-auto"
                        disabled={busy}
                        onClick={() => void terminateSession(s)}
                      >
                        End session &amp; release earnings
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">Member performance review</h3>
            <p className="text-xs text-muted-foreground">
              Audit how a member earned participation points (separate from wallet balances).
            </p>
            <Input
              value={reviewUserId}
              onChange={(e) => setReviewUserId(e.target.value)}
              placeholder="User UUID"
              className="font-mono text-xs"
            />
            <Button variant="outline" disabled={busy || !reviewUserId.trim()} onClick={() => void loadMemberPoints()}>
              Load point history
            </Button>
            {memberPoints ? (
              <div className="rounded-lg border border-border/60 p-3 text-sm">
                <p>
                  Total points: <span className="font-mono font-semibold">{memberPoints.points}</span> · Completed
                  sessions: {memberPoints.completedSessions}
                </p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                  {memberPoints.events.map((ev, i) => (
                    <li key={`${ev.created_at}-${i}`} className="text-muted-foreground">
                      +{ev.delta} · {ev.reason} · {ev.source} · {new Date(ev.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      {view === "grants" ? (
        <>
          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">Auto Trade grants</h3>
            <Input
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              placeholder="User UUID"
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void loadGrants()}>
                Load
              </Button>
              <Button disabled={busy} onClick={() => void saveGrants()}>
                Save grants
              </Button>
            </div>
            <div className="space-y-2">
              {NEXUS_AUTO_TRADE_PLAN_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(grants[key])}
                    onChange={(e) => setGrants((g) => ({ ...g, [key]: e.target.checked }))}
                  />
                  {key}
                </label>
              ))}
            </div>
          </Card>
          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">Legacy signal publish</h3>
            <div className="flex gap-2">
              {(["morning", "evening"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={`flex-1 rounded-lg py-2 text-sm capitalize ${slot === s ? "bg-primary/15 text-primary" : "bg-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="NXP-4728" className="font-mono uppercase" />
            <Input value={strategyTitle} onChange={(e) => setStrategyTitle(e.target.value)} placeholder="Strategy title" />
            <Button disabled={busy} onClick={() => void publishSignal()}>
              Publish legacy code
            </Button>
          </Card>
        </>
      ) : null}

      {view === "legacy" ? (
        <Card className="p-4">
          <h3 className="mb-2 font-semibold">Legacy container migration</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Closes all active copy/fixed sessions and moves container liquid to Nexus Main (per user).
          </p>
          <Button variant="destructive" disabled={busy} onClick={() => void releaseAllLegacy()}>
            Release all legacy sessions
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
