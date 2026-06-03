"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NEXUS_AUTO_TRADE_PLAN_KEYS } from "@/lib/nexus-bot/plans"
import { formatSessionClock } from "@/lib/nexus-bot/trade-code"

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

  const loadSessions = useCallback(async () => {
    const h = await tokenHeaders()
    const res = await fetch(`/api/admin/trade-sessions?view=${sessionFilter}`, { headers: h })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? "Load failed")
    setSessions(j.sessions ?? [])
    setUnregisteredCodes(j.unregisteredCodes ?? [])
    setStats(j.stats ?? null)
  }, [sessionFilter])

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
    setBusy(true)
    setMsg(null)
    setRegisteredOk(false)
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
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          status: registerStatus,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Register failed")
      setRegisteredOk(true)
      setMsg(`Code registered: ${j.code}`)
      setRegisterCode("")
      await loadSessions()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Register failed")
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
            <Button disabled={busy} onClick={() => void generateCodes()}>
              Generate trade code
            </Button>
            {unregisteredCodes.length > 0 ? (
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <p className="mb-2 font-medium">Unregistered suggestions</p>
                <div className="flex flex-wrap gap-2">
                  {unregisteredCodes.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className="rounded-md bg-background px-2 py-1 font-mono hover:ring-1 hover:ring-primary/40"
                      onClick={() => setRegisterCode(c.code)}
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
            <Input
              value={registerCode}
              onChange={(e) => setRegisterCode(e.target.value.toUpperCase())}
              placeholder="NXP-7A82-X91K"
              className="font-mono uppercase"
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
                  onClick={() => setSessionSlot(s)}
                  className={`flex-1 rounded-lg py-2 text-sm capitalize ${
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
            <Button disabled={busy || !registerCode.trim() || !sessionName.trim()} onClick={() => void registerSession()}>
              Register trade code
            </Button>
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
                        {s.status}
                      </span>
                    </div>
                    <p className="mt-1">{s.session_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSessionClock(s.start_at)} – {formatSessionClock(s.end_at)} · {s.session_slot}
                    </p>
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
