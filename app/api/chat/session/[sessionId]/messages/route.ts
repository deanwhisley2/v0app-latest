import { NextRequest, NextResponse } from "next/server"
import { phase2Store } from "@/lib/expert/phase2-store"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const list = phase2Store.chats.get(sessionId) ?? []
  const { searchParams } = new URL(req.url)
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? "50")))
  const before = searchParams.get("before")
  const filtered = before ? list.filter((m) => new Date(m.timestamp).getTime() < new Date(before).getTime()) : list
  const messages = filtered.slice(Math.max(0, filtered.length - limit))
  const hasMore = filtered.length > messages.length
  return NextResponse.json({ messages, hasMore })
}
