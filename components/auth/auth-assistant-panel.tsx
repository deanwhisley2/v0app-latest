"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bot, MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"
import type { NexusAssistantAuthStep } from "@/lib/nexus-assistant/types"

export type AuthAssistantChip = { label: string; prompt: string }

type Props = {
  authStep: NexusAssistantAuthStep
  /** Distinct panel id for pulse-once FAB hint */
  scope: string
  initialMessages: Array<{ role: "user" | "assistant"; text: string }>
  chips: AuthAssistantChip[]
  /** When true, panel opens on load (users can close with X). */
  defaultOpen?: boolean
  /** When true, FAB pulses briefly once per browser session (dashboard-style nudge). Off on auth by default. */
  fabHintPulse?: boolean
  appLanguage?: string
  fundingCountryCode?: string
}

export function AuthAssistantPanel({
  authStep,
  scope,
  initialMessages,
  chips,
  defaultOpen = false,
  fabHintPulse = false,
  appLanguage,
  fundingCountryCode,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState(initialMessages)
  const [fabPulse, setFabPulse] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy])

  useEffect(() => {
    if (!fabHintPulse) return
    try {
      const k = `nexus_auth_assistant_fab_hint_${scope}_v1`
      if (sessionStorage.getItem(k)) return
      setFabPulse(true)
      const t = window.setTimeout(() => {
        try {
          sessionStorage.setItem(k, "1")
        } catch {
          /* ignore */
        }
        setFabPulse(false)
      }, 10_000)
      return () => window.clearTimeout(t)
    } catch {
      return undefined
    }
  }, [scope, fabHintPulse])

  const ask = useCallback(
    async (seed?: string) => {
      const prompt = (seed ?? input).trim()
      if (!prompt || busy) return
      setMessages((prev) => [...prev, { role: "user", text: prompt }])
      setInput("")
      setBusy(true)
      try {
        const reply = await requestNexusAssistantReply({
          userMessage: prompt,
          surface: "auth_screen",
          authStep,
          isGuest: false,
          tradingUserLevel: 1,
          appLanguage,
          fundingCountryCode,
        })
        setMessages((prev) => [...prev, { role: "assistant", text: reply }])
      } finally {
        setBusy(false)
      }
    },
    [authStep, busy, input]
  )

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            fabPulse
              ? "fixed bottom-6 right-6 z-40 flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
              : "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
          }
          aria-label="Open Nexus assistant"
        >
          <Bot className="h-6 w-6" />
        </button>
      ) : null}

      {open ? (
        <div className="fixed bottom-6 right-6 z-50 flex max-h-[min(560px,calc(100vh-3rem))] w-[min(100vw-2rem,400px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Bot className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate font-semibold">Nexus assistant</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Ask about Nexus Pro, wallet rules &amp; getting started
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={`inline-block max-w-[92%] rounded-xl px-3 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="text-left">
                <div className="inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-2">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 border-t border-border p-3">
            <div className="mb-2 max-h-24 overflow-x-auto overflow-y-hidden">
              <div className="flex w-max flex-nowrap gap-2 pb-1">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => void ask(c.prompt)}
                    disabled={busy}
                    className="shrink-0 rounded-full border border-border bg-background/80 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Nexus…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void ask()
                }}
                disabled={busy}
                className="min-w-0"
              />
              <Button type="button" size="icon" onClick={() => void ask()} disabled={busy || !input.trim()} aria-label="Send">
                <MessageCircle className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Tips are informational; for account issues use verification email or official support channels when available.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
