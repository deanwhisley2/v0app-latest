"use client"

import { useCallback, useState } from "react"
import { Copy, Link2, MessageCircle } from "lucide-react"
import {
  buildTradeSignalShareUrl,
  buildWhatsAppShareTemplate,
  formatTradeSignalSessionLabel,
} from "@/lib/nexus-bot/trade-signal-share"
import { Button } from "@/components/ui/button"

type TradeSignalShareActionsProps = {
  code: string
  sessionSlot: "morning" | "evening"
}

export function TradeSignalShareActions({ code, sessionSlot }: TradeSignalShareActionsProps) {
  const [msg, setMsg] = useState<string | null>(null)
  const shareUrl = buildTradeSignalShareUrl(code)
  const whatsappTemplate = buildWhatsAppShareTemplate({ code, sessionSlot })
  const sessionLabel = formatTradeSignalSessionLabel(sessionSlot)

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMsg(`${label} copied`)
      window.setTimeout(() => setMsg(null), 2500)
    } catch {
      setMsg("Copy failed — select and copy manually")
    }
  }, [])

  return (
    <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div>
        <p className="text-sm font-semibold text-primary">Share signal</p>
        <p className="text-xs text-muted-foreground">
          Distribute via WhatsApp using the canonical link and ready-made template.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] gap-2 touch-manipulation"
          onClick={() => void copyText(shareUrl, "Signal link")}
        >
          <Link2 className="h-4 w-4" aria-hidden />
          Copy signal link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] gap-2 touch-manipulation"
          onClick={() => void copyText(whatsappTemplate, "WhatsApp template")}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Copy WhatsApp template
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] gap-2 touch-manipulation"
          onClick={() => void copyText(code, "Trade code")}
        >
          <Copy className="h-4 w-4" aria-hidden />
          Copy code only
        </Button>
      </div>
      {msg ? <p className="text-xs font-medium text-success">{msg}</p> : null}
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background/80 p-3 text-xs text-muted-foreground">
        {whatsappTemplate}
      </pre>
      {sessionLabel ? (
        <p className="text-[11px] text-muted-foreground">
          Public page shows <span className="font-medium text-foreground">{sessionLabel}</span> · Signal Active
        </p>
      ) : null}
    </div>
  )
}
