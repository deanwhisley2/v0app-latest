"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import Link from "next/link"

const UserSecuritySetupForm = dynamic(
  () => import("@/components/dashboard/user-security-setup-form").then((m) => m.UserSecuritySetupForm),
  { ssr: false },
)

const UserSecurityRecoverySummary = dynamic(
  () =>
    import("@/components/dashboard/user-security-recovery-summary").then((m) => m.UserSecurityRecoverySummary),
  { ssr: false },
)

type SessionItem = {
  id: string
  device_name: string
  browser_name: string
  status: string
  device_trust?: string
  ip_address?: string | null
  first_seen_at: string
  last_seen_at: string
  revoked_at?: string | null
  is_current: boolean
  is_online: boolean
}

/** Standalone Security & Recovery — only loads when user opens /dashboard/security manually. */
export function SecurityRecoveryScreen() {
  const { t } = useUserPreferences()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [profileKey, setProfileKey] = useState(0)

  const [sessionItems, setSessionItems] = useState<SessionItem[]>([])
  const [sessionsMessage, setSessionsMessage] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [antiPhishingCode, setAntiPhishingCode] = useState("")
  const [antiPhishingSaved, setAntiPhishingSaved] = useState<string | null>(null)
  const [antiPhishingMessage, setAntiPhishingMessage] = useState<string | null>(null)

  const refreshSetupState = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setNeedsSetup(null)
        return
      }
      const res = await fetch("/api/user/security-profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const j = (await res.json().catch(() => ({}))) as { profile?: { needsSetup?: boolean } }
      if (res.ok) {
        setNeedsSetup(Boolean(j.profile?.needsSetup))
      } else {
        setNeedsSetup(false)
      }
      setProfileKey((n) => n + 1)
    } catch {
      setNeedsSetup(false)
    }
  }, [])

  useEffect(() => {
    void refreshSetupState()
  }, [refreshSetupState])

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const code =
        typeof data.user?.user_metadata?.anti_phishing_code === "string"
          ? data.user.user_metadata.anti_phishing_code.trim()
          : ""
      setAntiPhishingSaved(code || null)
      setAntiPhishingCode(code)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadSessions = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const ssRes = await fetch("/api/user/sessions", {
          headers: { Authorization: `Bearer ${token}` },
        })
        const ssData = (await ssRes.json().catch(() => ({}))) as { items?: SessionItem[] }
        if (!cancelled && ssRes.ok) setSessionItems(ssData.items ?? [])
      } catch {
        /* ignore */
      }
    }
    void loadSessions()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveAntiPhishingCode() {
    setAntiPhishingMessage(null)
    const trimmed = antiPhishingCode.trim()
    if (trimmed.length < 4) {
      setAntiPhishingMessage("Use at least 4 characters.")
      return
    }
    try {
      const { error } = await supabase.auth.updateUser({
        data: { anti_phishing_code: trimmed },
      })
      if (error) throw error
      setAntiPhishingSaved(trimmed)
      setAntiPhishingMessage("Anti-phishing code saved. It will appear in emails from us.")
    } catch (e) {
      setAntiPhishingMessage(e instanceof Error ? e.message : "Could not save code")
    }
  }

  async function sessionAction(sessionId: string, action: "trust" | "block") {
    setSessionsMessage(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Please sign in again.")
      const res = await fetch("/api/user/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, action }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(out.error || "Could not update session")
      setSessionItems((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                device_trust: action === "trust" ? "trusted" : "blocked",
                status: action === "block" ? "revoked" : s.status,
                is_online: action === "block" ? false : s.is_online,
              }
            : s,
        ),
      )
      setSessionsMessage(action === "trust" ? "Device marked as trusted." : "Device blocked and session revoked.")
    } catch (e) {
      setSessionsMessage(e instanceof Error ? e.message : "Could not update session")
    }
  }

  async function changePassword() {
    setPasswordMessage(null)
    if (!currentPassword || !newPassword) {
      setPasswordMessage("Current password and new password are required.")
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Please sign in again.")
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(out.error || "Could not change password")
      setCurrentPassword("")
      setNewPassword("")
      setPasswordMessage(out.message || "Password changed.")
    } catch (e) {
      setPasswordMessage(e instanceof Error ? e.message : "Could not change password")
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-foreground">Deposit & withdrawal details</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage your payout details from Settings → Deposit & Withdraw. These details are required for Add Funds and Withdraw.
        </p>
        <div className="mt-4">
          <Button asChild className="touch-manipulation">
            <Link href="/dashboard?view=deposit-withdraw">Open Deposit & Withdraw</Link>
          </Button>
        </div>
      </Card>

      {needsSetup === null ? null : needsSetup ? null : (
        <UserSecurityRecoverySummary key={profileKey} appealCenterHref="/dashboard/security/appeals" />
      )}

      <Card className="border-border bg-card p-4 sm:p-6">
        <h3 className="mb-3 text-lg font-semibold">Anti-Phishing Code</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          A personal phrase you expect in genuine Nexus PRO emails.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={antiPhishingCode}
            onChange={(e) => setAntiPhishingCode(e.target.value)}
            placeholder="e.g. BlueRiver42"
            maxLength={32}
          />
          <Button size="sm" className="shrink-0" onClick={() => void saveAntiPhishingCode()}>
            {antiPhishingSaved ? "Update" : "Save"}
          </Button>
        </div>
        {antiPhishingSaved ? <p className="mt-2 text-xs text-success">Active: {antiPhishingSaved}</p> : null}
        {antiPhishingMessage ? <p className="mt-2 text-xs text-muted-foreground">{antiPhishingMessage}</p> : null}
      </Card>

      <Card className="border-border bg-card p-6">
        <h3 className="mb-2 text-lg font-semibold">{t("security.devices.title")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("security.devices.hint")}</p>
        <div className="max-h-[min(320px,45vh)] overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-2">
          <div className="space-y-2 pr-1">
            {sessionItems.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No devices recorded yet.</p>
            ) : (
              sessionItems.map((s) => (
                <div key={s.id} className="rounded-lg bg-background/80 px-3 py-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {s.device_name} · {s.browser_name}
                        {s.is_current ? (
                          <span className="ml-2 text-[10px] font-semibold text-primary">(this device)</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.is_online ? "Online" : "Offline"} · Last active{" "}
                        {new Date(s.last_seen_at).toLocaleString()}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {t("security.devices.ip")}: {s.ip_address?.trim() || "—"}
                      </p>
                      {s.device_trust === "trusted" ? (
                        <p className="mt-1 text-[10px] font-medium text-success">{t("security.devices.trusted")}</p>
                      ) : s.device_trust === "blocked" || s.status === "revoked" ? (
                        <p className="mt-1 text-[10px] font-medium text-destructive">{t("security.devices.blocked")}</p>
                      ) : null}
                    </div>
                    {!s.is_current && s.status === "active" ? (
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => void sessionAction(s.id, "trust")}>
                          {t("security.devices.trust")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => void sessionAction(s.id, "block")}
                        >
                          {t("security.devices.block")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {sessionsMessage ? <p className="mt-2 text-xs text-muted-foreground">{sessionsMessage}</p> : null}
      </Card>

      <Card className="border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-semibold">Change Password</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Enter your current password first. If unknown, use account recovery with your Nexus Security Code.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
          />
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 chars)"
          />
        </div>
        <Button className="mt-3" size="sm" onClick={() => void changePassword()}>
          Update password
        </Button>
        {passwordMessage ? <p className="mt-2 text-xs text-muted-foreground">{passwordMessage}</p> : null}
      </Card>
    </div>
  )
}
