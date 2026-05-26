"use client"

import { Loader2, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  operationalThreadCategoryLabel,
  operationalThreadStatusLabel,
  operationalThreadStatusTone,
  senderRoleLabel,
  STATUS_CHIP_CLASS,
  type StatusChipTone,
} from "@/lib/operational-support-institutional"
import { cn } from "@/lib/utils"
import { VirtualMessageList } from "@/components/dashboard/virtual-message-list"

export type SupportMessageRow = {
  id: string
  sender_role: string
  body: string
  created_at: string
  is_system?: boolean
  delivery_state?: string
}

export function SupportStatusChip({
  status,
  escalated,
  className,
}: {
  status: string
  escalated?: boolean
  className?: string
}) {
  const tone = operationalThreadStatusTone(status, escalated)
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STATUS_CHIP_CLASS[tone as StatusChipTone],
        className,
      )}
    >
      {operationalThreadStatusLabel(status, escalated)}
    </span>
  )
}

export function SupportThreadListItem({
  id,
  category,
  status,
  escalated,
  unread,
  selected,
  subtitle,
  onSelect,
}: {
  id: string
  category: string
  status: string
  escalated?: boolean
  unread?: boolean
  selected?: boolean
  subtitle?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border px-3 py-2.5 text-left transition-colors touch-manipulation",
        selected ? "border-primary/50 bg-primary/10" : "border-border/60 bg-card/40 hover:bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {operationalThreadCategoryLabel(category)}
          </p>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {unread ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SupportStatusChip status={status} escalated={escalated} />
        <span className="font-mono text-[9px] text-muted-foreground">{id.slice(0, 8)}</span>
      </div>
    </button>
  )
}

export function SupportMessageTimeline({
  messages,
  loading,
  endRef,
  perspective,
}: {
  messages: SupportMessageRow[]
  loading?: boolean
  endRef?: React.RefObject<HTMLDivElement | null>
  perspective: "user" | "admin"
}) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/10">
      <VirtualMessageList
        messages={messages}
        loading={loading}
        endRef={endRef}
        emptyLabel="No messages yet."
        className="max-h-[min(420px,52vh)]"
        renderMessage={(m) => {
          const isSystem = m.is_system || m.sender_role === "system"
          const isMine = perspective === "user" ? m.sender_role === "user" : m.sender_role === "admin"
          return (
            <div
              className={cn(
                "flex",
                isSystem ? "justify-center" : isMine ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  isSystem
                    ? "border border-dashed border-border/70 bg-muted/20 text-center text-xs text-muted-foreground"
                    : isMine
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card text-foreground ring-1 ring-border/80",
                )}
              >
                {!isSystem ? (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {senderRoleLabel(m.sender_role)}
                  </p>
                ) : null}
                <p className="mb-1 text-[9px] opacity-60">{new Date(m.created_at).toLocaleString()}</p>
                {m.body}
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}

export function SupportReplyBar({
  value,
  onChange,
  onSend,
  sending,
  disabled,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  sending?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <div className="sticky bottom-0 z-[1] border-t border-border/60 bg-card/95 p-2 backdrop-blur-sm safe-area-pb">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Write your message…"}
          disabled={disabled || sending}
          className="min-h-11 flex-1 text-base sm:text-sm touch-manipulation"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 shrink-0 touch-manipulation"
          onClick={onSend}
          disabled={disabled || sending || !value.trim()}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function SupportManualRefresh({ onRefresh, busy }: { onRefresh: () => void; busy?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 text-xs text-muted-foreground"
      onClick={onRefresh}
      disabled={busy}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      Refresh
    </Button>
  )
}
