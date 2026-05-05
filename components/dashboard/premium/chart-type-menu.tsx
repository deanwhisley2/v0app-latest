"use client"

import { Check, ChevronDown, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CHART_TYPE_GROUPS, type ChartTypeId, formatChartTypeIndicator } from "@/lib/chart-types"
import { cn } from "@/lib/utils"

type ChartTypeMenuProps = {
  value: ChartTypeId
  onChange: (id: ChartTypeId) => void
  lineBreakLines: number
  onLineBreakLinesChange: (n: number) => void
}

export function ChartTypeMenu({
  value,
  onChange,
  lineBreakLines,
  onLineBreakLinesChange,
}: ChartTypeMenuProps) {
  const label = formatChartTypeIndicator(value, { lineBreakLines })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 max-w-[220px] shrink-0 border-white/[0.12] bg-black/50 font-mono text-[11px] font-semibold text-cyan-100 hover:bg-white/[0.06] hover:text-cyan-50"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(92vw,320px)] border-white/[0.1] bg-[#0b0d12] p-0 text-zinc-200 shadow-2xl"
      >
        <ScrollArea className="max-h-[min(70vh,420px)]">
          <div className="p-2">
            {CHART_TYPE_GROUPS.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {group.label}
                </DropdownMenuLabel>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChange(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium transition-colors",
                        value === item.id
                          ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-500/30"
                          : "text-zinc-300 hover:bg-white/[0.05]"
                      )}
                    >
                      <Check
                        className={cn("h-3.5 w-3.5 shrink-0", value === item.id ? "opacity-100" : "opacity-0")}
                      />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <DropdownMenuSeparator className="my-2 bg-white/[0.08]" />
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/40 px-2 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Line break [n]
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    onLineBreakLinesChange(Math.max(2, lineBreakLines - 1))
                  }}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center font-mono text-xs text-cyan-200">{lineBreakLines}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    onLineBreakLinesChange(Math.min(10, lineBreakLines + 1))
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
