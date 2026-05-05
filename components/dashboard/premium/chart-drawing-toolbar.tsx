"use client"

import { useState } from "react"
import {
  Activity,
  Crosshair,
  Eraser,
  GitBranch,
  Lock,
  Magnet,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Pencil,
  Ruler,
  Sparkles,
  Square,
  TrendingUp,
  Type,
  ZoomIn,
  ChevronDown,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type DrawingToolId =
  | "cursor"
  | "crosshair"
  | "magnet"
  | "trend"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "parallel"
  | "text"
  | "brush"
  | "ruler"
  | "zoom"
  | "erase"
  | "lock"

const TOOLS: { id: DrawingToolId; icon: typeof MousePointer2; label: string }[] = [
  { id: "cursor", icon: MousePointer2, label: "Select" },
  { id: "crosshair", icon: Crosshair, label: "Crosshair" },
  { id: "magnet", icon: Magnet, label: "Magnet mode" },
  { id: "trend", icon: TrendingUp, label: "Trend line" },
  { id: "hline", icon: Minus, label: "Horizontal line" },
  { id: "vline", icon: Minus, label: "Vertical / time marker" },
  { id: "rect", icon: Square, label: "Rectangle zone (H lines)" },
  { id: "fib", icon: GitBranch, label: "Fibonacci retracement" },
  { id: "parallel", icon: MoveHorizontal, label: "Parallel channel" },
  { id: "text", icon: Type, label: "Text label (price line)" },
  { id: "brush", icon: Pencil, label: "Freehand brush (coming soon)" },
  { id: "ruler", icon: Ruler, label: "Measure (2 clicks)" },
  { id: "zoom", icon: ZoomIn, label: "Fit content" },
  { id: "erase", icon: Eraser, label: "Clear drawings" },
  { id: "lock", icon: Lock, label: "Lock pan/zoom" },
]

type ChartDrawingToolbarProps = {
  activeTool: DrawingToolId
  onToolChange: (id: DrawingToolId) => void
  vertical?: boolean
}

export function ChartDrawingToolbar({
  activeTool,
  onToolChange,
  vertical = true,
}: ChartDrawingToolbarProps) {
  const [open, setOpen] = useState(false)
  const activeMeta = TOOLS.find((t) => t.id === activeTool) ?? TOOLS[0]
  const ActiveIcon = activeMeta.icon

  const pick = (id: DrawingToolId) => {
    onToolChange(id)
    setOpen(false)
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            "rounded-xl border border-white/[0.08] bg-[#0a0c10]/95 p-1 shadow-xl backdrop-blur-md",
            vertical ? "flex w-full flex-col items-stretch" : "inline-flex flex-row items-center"
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex shrink-0 items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white",
                vertical ? "h-auto min-h-[2.5rem] w-full flex-col py-2.5" : "h-9 min-w-[4.5rem] flex-row px-2.5"
              )}
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-label="Drawing tools"
            >
              <ActiveIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <ChevronDown className={cn("h-3 w-3 shrink-0 opacity-70", vertical && "mt-0.5")} />
            </button>
          </PopoverTrigger>
        </div>

        <PopoverContent
            side={vertical ? "right" : "bottom"}
            align="start"
            sideOffset={8}
            className="w-[min(100vw-2rem,340px)] border-white/[0.1] bg-[#0a0c10] p-2 shadow-2xl sm:w-[320px]"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Tools
            </p>
            <div className="grid grid-cols-3 gap-1">
              {TOOLS.map(({ id, icon: Icon, label }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => pick(id)}
                      className={cn(
                        "flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg transition-all",
                        activeTool === id
                          ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40"
                          : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                      )}
                      aria-pressed={activeTool === id}
                    >
                      <Icon className={cn("h-4 w-4", id === "vline" && "rotate-90")} strokeWidth={1.75} />
                      <span className="max-w-full truncate px-0.5 text-[9px] font-medium leading-tight text-center">
                        {label.split(" ")[0]}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                    {label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">More</p>
              <div className="grid grid-cols-2 gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-emerald-300"
                      aria-label="Indicators"
                    >
                      <Activity className="h-4 w-4" strokeWidth={1.75} />
                      <span className="text-[10px]">Indicators</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Indicators</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-amber-300"
                      aria-label="Layouts"
                    >
                      <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                      <span className="text-[10px]">Layouts</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Layouts & templates</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}
