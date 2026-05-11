"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Headphones, MessageCircle, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"

const CHIPS: Array<{ label: string; prompt: string }> = [
  { label: "Appeal triage", prompt: "User appeals a funding or withdrawal outcome. Give me a triage checklist and a humane reply draft." },
  { label: "Investigation", prompt: "I need an investigation checklist for a disputed desk row before I approve or reject." },
  { label: "Humane reply", prompt: "Help me draft a calm, professional reply to a frustrated user while we verify their case." },
]

export function AdminSupportChatPanel() {
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>(() => [
    { role: "assistant", text: getNexusAssistantWelcome("admin_desk_support_chat", false) },
  ])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy])

  const send = useCallback(
    async (seed?: string) => {
      const prompt = (seed ?? input).trim()
      if (!prompt || busy) return
      setMessages((prev) => [...prev, { role: "user", text: prompt }])
      setInput("")
      setBusy(true)
      try {
        const reply = await requestNexusAssistantReply({
          userMessage: prompt,
          surface: "admin_desk_support_chat",
          isGuest: false,
          tradingUserLevel: 5,
        })
        setMessages((prev) => [...prev, { role: "assistant", text: reply }])
      } finally {
        setBusy(false)
      }
    },
    [busy, input]
  )

  return (
    <Card className="border-border bg-card p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Headphones className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">Human support desk</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft appeals responses, investigation checklists, and tone for outbound messages. This copilot does not see live
            account data — use the approval desk and ledger for facts.
          </p>
        </div>
      </div>

      <div className="mb-3 max-h-[min(360px,50vh)] space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[95%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="text-left">
            <div className="inline-flex items-center gap-1 rounded-xl bg-card px-3 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => void send(c.prompt)}
            disabled={busy}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste appeal text, case notes, or what you need drafted…"
          onKeyDown={(e) => {
            if (e.key === "Enter") void send()
          }}
          disabled={busy}
          className="min-w-0"
        />
        <Button type="button" size="icon" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MessageCircle className="h-3 w-3 shrink-0" />
        Redact PII where possible; verify every factual claim against internal tools before sending anything to a user.
      </p>
    </Card>
  )
}
