"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { NEXUS_AUTO_TRADE_PLAN_KEYS } from "@/lib/nexus-bot/plans"

export function AdminNexusBotPanel() {
  const [slot, setSlot] = useState<"morning" | "evening">("morning")
  const [code, setCode] = useState("")
  const [strategyTitle, setStrategyTitle] = useState("")
  const [confidence, setConfidence] = useState("High")
  const [durationHours, setDurationHours] = useState("12")
  const [grantUserId, setGrantUserId] = useState("")
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tokenHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error("Not signed in")
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
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
      setMsg(`Published ${slot} code ${j.code?.code ?? code}`)
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
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Publish signal code</h3>
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
        <input
          className="w-full rounded-md border border-border px-3 py-2 font-mono text-sm uppercase"
          placeholder="NXP-4728"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          placeholder="Strategy title"
          value={strategyTitle}
          onChange={(e) => setStrategyTitle(e.target.value)}
        />
        <input
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          placeholder="Confidence"
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
        />
        <input
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          placeholder="Duration hours"
          value={durationHours}
          onChange={(e) => setDurationHours(e.target.value)}
        />
        <Button disabled={busy} onClick={() => void publishSignal()}>
          Publish code
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Auto Trade grants</h3>
        <input
          className="w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
          placeholder="User UUID"
          value={grantUserId}
          onChange={(e) => setGrantUserId(e.target.value)}
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

      <Card className="p-4">
        <h3 className="mb-2 font-semibold">Legacy container migration</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Closes all active copy/fixed sessions and moves container liquid to Nexus Main (per user).
        </p>
        <Button variant="destructive" disabled={busy} onClick={() => void releaseAllLegacy()}>
          Release all legacy sessions
        </Button>
      </Card>
    </div>
  )
}
