"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

const PAGE = 40

export type VirtualMessageRow = {
  id: string
  sender_role: string
  body: string
  created_at: string
  is_system?: boolean
}

type VirtualMessageListProps<T extends VirtualMessageRow> = {
  messages: T[]
  loading?: boolean
  endRef?: React.RefObject<HTMLDivElement | null>
  renderMessage: (message: T) => React.ReactNode
  emptyLabel?: string
  className?: string
}

function VirtualMessageListInner<T extends VirtualMessageRow>({
  messages,
  loading,
  endRef,
  renderMessage,
  emptyLabel = "No messages yet.",
  className,
}: VirtualMessageListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(PAGE)

  const sorted = useMemo(
    () => [...messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [messages],
  )

  const hidden = Math.max(0, sorted.length - visibleCount)
  const visible = useMemo(() => sorted.slice(-visibleCount), [sorted, visibleCount])

  const loadEarlier = useCallback(() => {
    setVisibleCount((c) => Math.min(sorted.length, c + PAGE))
  }, [sorted.length])

  return (
    <div
      className={`nexus-chat-scroll flex min-h-[200px] flex-1 flex-col overflow-y-auto overscroll-contain ${className ?? ""}`}
      style={{ WebkitOverflowScrolling: "touch", willChange: "transform" }}
    >
      <div className="flex-1 space-y-3 p-3 touch-pan-y">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            {hidden > 0 ? (
              <button
                type="button"
                onClick={loadEarlier}
                className="mx-auto block rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground touch-manipulation hover:bg-muted/50"
              >
                Load earlier messages ({hidden})
              </button>
            ) : null}
            {visible.map((m) => (
              <div key={m.id}>{renderMessage(m)}</div>
            ))}
          </>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}

export const VirtualMessageList = memo(VirtualMessageListInner) as typeof VirtualMessageListInner
