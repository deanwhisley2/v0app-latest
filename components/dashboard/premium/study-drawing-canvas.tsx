"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowUpRight,
  Circle,
  Eraser,
  GitBranch,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type StudyDrawTool =
  | "select"
  | "brush"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text"
  | "fib"
  | "angle"
  | "emoji"
  | "eraser"

type Point = { x: number; y: number }

type StudyStroke =
  | { kind: "path"; points: Point[]; color: string; width: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string; width: number }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number; color: string; width: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; size: number }
  | { kind: "fib"; top: number; bottom: number; left: number; right: number; color: string; width: number }
  | { kind: "angle"; ax: number; ay: number; bx: number; by: number; cx: number; cy: number; color: string; width: number }
  | { kind: "emoji"; x: number; y: number; emoji: string; size: number }

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const
const EMOJI_PRESETS = ["📈", "📉", "🎯", "⚡", "🔥", "💎", "🧠", "✅", "❌", "👀", "💰", "🚀", "📌", "⭐", "🛡️"]

function drawStroke(ctx: CanvasRenderingContext2D, s: StudyStroke) {
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = "width" in s ? s.width : 2
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  switch (s.kind) {
    case "path": {
      if (s.points.length < 2) return
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
      break
    }
    case "line": {
      ctx.beginPath()
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2, s.y2)
      ctx.stroke()
      break
    }
    case "arrow": {
      ctx.beginPath()
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2, s.y2)
      ctx.stroke()
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
      const head = 10 + s.width * 2
      ctx.beginPath()
      ctx.moveTo(s.x2, s.y2)
      ctx.lineTo(s.x2 - head * Math.cos(ang - Math.PI / 6), s.y2 - head * Math.sin(ang - Math.PI / 6))
      ctx.moveTo(s.x2, s.y2)
      ctx.lineTo(s.x2 - head * Math.cos(ang + Math.PI / 6), s.y2 - head * Math.sin(ang + Math.PI / 6))
      ctx.stroke()
      break
    }
    case "rect": {
      ctx.strokeRect(s.x, s.y, s.w, s.h)
      break
    }
    case "ellipse": {
      const cx = s.x + s.w / 2
      const cy = s.y + s.h / 2
      const rx = Math.abs(s.w) / 2
      const ry = Math.abs(s.h) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case "text": {
      ctx.font = `${s.size}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillStyle = s.color
      ctx.fillText(s.text, s.x, s.y)
      break
    }
    case "fib": {
      const top = Math.min(s.top, s.bottom)
      const bot = Math.max(s.top, s.bottom)
      const range = Math.max(1, bot - top)
      ctx.setLineDash([4, 4])
      FIB_LEVELS.forEach((lv, i) => {
        const y = bot - range * lv
        ctx.beginPath()
        ctx.strokeStyle = i % 2 === 0 ? s.color : `${s.color}99`
        ctx.lineWidth = s.width
        ctx.moveTo(s.left, y)
        ctx.lineTo(s.right, y)
        ctx.stroke()
        ctx.fillStyle = "rgba(255,255,255,0.75)"
        ctx.font = "10px ui-monospace, monospace"
        ctx.fillText(`${(lv * 100).toFixed(1)}%`, s.left + 4, y - 3)
      })
      ctx.setLineDash([])
      break
    }
    case "angle": {
      ctx.beginPath()
      ctx.moveTo(s.ax, s.ay)
      ctx.lineTo(s.bx, s.by)
      ctx.lineTo(s.cx, s.cy)
      ctx.stroke()
      const a1 = Math.atan2(s.ay - s.by, s.ax - s.bx)
      const a2 = Math.atan2(s.cy - s.by, s.cx - s.bx)
      let delta = a2 - a1
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      const deg = (Math.abs(delta) * 180) / Math.PI
      ctx.font = "11px ui-monospace, monospace"
      ctx.fillStyle = "rgba(250,250,250,0.9)"
      ctx.fillText(`${deg.toFixed(1)}°`, s.bx + 8, s.by - 8)
      break
    }
    case "emoji": {
      ctx.font = `${s.size}px "Apple Color Emoji","Segoe UI Emoji",serif`
      ctx.textBaseline = "middle"
      ctx.fillText(s.emoji, s.x, s.y)
      break
    }
  }
}

function strokeHit(pt: Point, s: StudyStroke, tol: number): boolean {
  const near = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay) || 1
    const t = Math.max(0, Math.min(1, ((pt.x - ax) * (bx - ax) + (pt.y - ay) * (by - ay)) / (len * len)))
    const px = ax + t * (bx - ax)
    const py = ay + t * (by - ay)
    return Math.hypot(pt.x - px, pt.y - py) <= tol
  }

  switch (s.kind) {
    case "path":
      for (let i = 1; i < s.points.length; i++) {
        if (near(s.points[i - 1].x, s.points[i - 1].y, s.points[i].x, s.points[i].y)) return true
      }
      return false
    case "line":
    case "arrow":
      return near(s.x1, s.y1, s.x2, s.y2)
    case "rect":
    case "ellipse":
      return pt.x >= s.x - tol && pt.x <= s.x + s.w + tol && pt.y >= s.y - tol && pt.y <= s.y + s.h + tol
    case "text":
    case "emoji":
      return Math.hypot(pt.x - s.x, pt.y - s.y) < tol + (s.kind === "emoji" ? s.size : s.size * 4)
    case "fib":
      return pt.x >= s.left && pt.x <= s.right && pt.y >= Math.min(s.top, s.bottom) && pt.y <= Math.max(s.top, s.bottom)
    case "angle":
      return near(s.ax, s.ay, s.bx, s.by) || near(s.bx, s.by, s.cx, s.cy)
    default:
      return false
  }
}

type StudyDrawingCanvasProps = {
  className?: string
}

export function StudyDrawingCanvas({ className }: StudyDrawingCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<StudyDrawTool>("brush")
  const [color, setColor] = useState("#22d3ee")
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [strokes, setStrokes] = useState<StudyStroke[]>([])
  const [redo, setRedo] = useState<StudyStroke[]>([])
  const [draft, setDraft] = useState<StudyStroke | null>(null)
  const [emojiPick, setEmojiPick] = useState("📌")
  const anglePts = useRef<Point[]>([])
  const dragStart = useRef<Point | null>(null)

  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (w < 1 || h < 1) return
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    for (const s of strokes) drawStroke(ctx, s)
    if (draft) drawStroke(ctx, draft)
  }, [strokes, draft, dpr])

  useEffect(() => {
    paint()
  }, [paint])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => paint())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [paint])

  const pushStroke = (s: StudyStroke) => {
    setStrokes((prev) => [...prev, s])
    setRedo([])
  }

  const undo = () => {
    setStrokes((prev) => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      setRedo((r) => [...r, last])
      return prev.slice(0, -1)
    })
  }

  const redoFn = () => {
    setRedo((r) => {
      if (!r.length) return r
      const last = r[r.length - 1]
      setStrokes((s) => [...s, last])
      return r.slice(0, -1)
    })
  }

  const clientToLocal = (e: React.MouseEvent | MouseEvent): Point => {
    const wrap = wrapRef.current
    if (!wrap) return { x: 0, y: 0 }
    const r = wrap.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onDown = (e: React.MouseEvent) => {
    if (tool === "select") return
    const p = clientToLocal(e)

    if (tool === "eraser") {
      setStrokes((prev) => {
        const i = [...prev].reverse().findIndex((s) => strokeHit(p, s, 14))
        if (i < 0) return prev
        const ri = prev.length - 1 - i
        const removed = prev[ri]
        setRedo((r) => [...r, removed])
        return prev.filter((_, j) => j !== ri)
      })
      return
    }

    if (tool === "text") {
      const label = typeof window !== "undefined" ? window.prompt("Annotation text", "Note") : null
      if (label) pushStroke({ kind: "text", x: p.x, y: p.y, text: label.slice(0, 120), color, size: 14 + strokeWidth * 2 })
      return
    }

    if (tool === "emoji") {
      pushStroke({ kind: "emoji", x: p.x, y: p.y, emoji: emojiPick, size: 20 + strokeWidth * 4 })
      return
    }

    if (tool === "angle") {
      anglePts.current.push(p)
      if (anglePts.current.length >= 3) {
        const [a, b, c] = anglePts.current
        pushStroke({ kind: "angle", ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color, width: strokeWidth })
        anglePts.current = []
      }
      return
    }

    dragStart.current = p
    if (tool === "brush") {
      setDraft({ kind: "path", points: [p], color, width: strokeWidth })
    } else if (tool === "line" || tool === "arrow") {
      setDraft({ kind: tool === "arrow" ? "arrow" : "line", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width: strokeWidth })
    } else if (tool === "rect") {
      setDraft({ kind: "rect", x: p.x, y: p.y, w: 0, h: 0, color, width: strokeWidth })
    } else if (tool === "ellipse") {
      setDraft({ kind: "ellipse", x: p.x, y: p.y, w: 0, h: 0, color, width: strokeWidth })
    } else if (tool === "fib") {
      setDraft({ kind: "fib", top: p.y, bottom: p.y, left: p.x, right: p.x, color, width: Math.max(1, strokeWidth) })
    }
  }

  const onMove = (e: React.MouseEvent) => {
    if (!dragStart.current) {
      if (tool === "brush" && draft?.kind === "path") {
        const p = clientToLocal(e)
        const last = draft.points[draft.points.length - 1]
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return
        setDraft({ ...draft, points: [...draft.points, p] })
      }
      return
    }
    const p = clientToLocal(e)
    const s = dragStart.current

    if (tool === "brush" && draft?.kind === "path") {
      const last = draft.points[draft.points.length - 1]
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return
      setDraft({ ...draft, points: [...draft.points, p] })
      return
    }

    if (draft?.kind === "line" || draft?.kind === "arrow") {
      setDraft({ ...draft, x2: p.x, y2: p.y })
      return
    }
    if (draft?.kind === "rect" || draft?.kind === "ellipse") {
      setDraft({ ...draft, x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
      return
    }
    if (draft?.kind === "fib") {
      setDraft({
        ...draft,
        top: Math.min(s.y, p.y),
        bottom: Math.max(s.y, p.y),
        left: Math.min(s.x, p.x),
        right: Math.max(s.x, p.x),
      })
    }
  }

  const onUp = () => {
    dragStart.current = null
    if (draft) {
      if (draft.kind === "path" && draft.points.length > 1) pushStroke(draft)
      else if (draft.kind === "line" || draft.kind === "arrow") {
        if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 4) pushStroke(draft)
      } else if (draft.kind === "rect" || draft.kind === "ellipse") {
        if (draft.w > 3 && draft.h > 3) pushStroke(draft)
      } else if (draft.kind === "fib") {
        if (Math.abs(draft.bottom - draft.top) > 8 && draft.right - draft.left > 8) pushStroke(draft)
      }
      setDraft(null)
    }
  }

  const onLeave = () => {
    onUp()
  }

  const toolBtn = (id: StudyDrawTool, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      type="button"
      title={label}
      onClick={() => setTool(id)}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-zinc-300 transition-all duration-200",
        tool === id
          ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.15)]"
          : "border-white/[0.08] bg-black/40 hover:border-white/15 hover:bg-white/[0.06]"
      )}
    >
      {icon}
    </button>
  )

  return (
    <div ref={wrapRef} className={cn("absolute inset-0 z-[15]", className)}>
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 touch-none",
          tool === "select" ? "pointer-events-none cursor-default" : "cursor-crosshair"
        )}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
      />

      <div className="pointer-events-auto absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col gap-2 rounded-2xl border border-white/[0.1] bg-zinc-950/85 p-2 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center justify-center gap-1 border-b border-white/[0.06] pb-2 sm:border-b-0 sm:pb-0 sm:pr-2 sm:pl-1">
          {toolBtn("select", <MousePointer2 className="h-4 w-4" />, "Pan / no draw")}
          {toolBtn("brush", <Pencil className="h-4 w-4" />, "Brush")}
          {toolBtn("line", <Minus className="h-4 w-4" />, "Line")}
          {toolBtn("arrow", <ArrowUpRight className="h-4 w-4" />, "Arrow")}
          {toolBtn("rect", <Square className="h-4 w-4" />, "Rectangle")}
          {toolBtn("ellipse", <Circle className="h-4 w-4" />, "Ellipse")}
          {toolBtn("fib", <GitBranch className="h-4 w-4" />, "Fibonacci (drag zone)")}
          {toolBtn("angle", <span className="text-xs font-bold">∠</span>, "Angle (3 clicks)")}
          {toolBtn("text", <Type className="h-4 w-4" />, "Text")}
          {toolBtn("emoji", <span className="text-sm leading-none">😀</span>, "Emoji stamp")}
          {toolBtn("eraser", <Eraser className="h-4 w-4" />, "Erase stroke")}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/[0.06] pb-2 sm:border-b-0 sm:border-l sm:border-white/[0.06] sm:pb-0 sm:pl-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            <span className="hidden sm:inline">Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-10 cursor-pointer overflow-hidden rounded-md border border-white/10 bg-transparent p-0"
            />
          </label>
          <label className="flex min-w-[88px] flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Width
            <input
              type="range"
              min={1}
              max={12}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="h-1 w-full accent-cyan-500"
            />
          </label>
        </div>

        <div className="flex items-center justify-center gap-1 sm:border-l sm:border-white/[0.06] sm:pl-3">
          <button
            type="button"
            title="Undo"
            onClick={undo}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-black/40 text-zinc-300 transition-colors hover:bg-white/[0.06]"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Redo"
            onClick={redoFn}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-black/40 text-zinc-300 transition-colors hover:bg-white/[0.06]"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {tool === "emoji" && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1.5 text-lg leading-none transition-colors hover:bg-fuchsia-500/20 sm:ml-1"
              >
                {emojiPick}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto border-white/10 bg-zinc-950 p-2" align="center">
              <div className="grid grid-cols-5 gap-1">
                {EMOJI_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="rounded-md p-2 text-xl hover:bg-white/10"
                    onClick={() => setEmojiPick(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}
