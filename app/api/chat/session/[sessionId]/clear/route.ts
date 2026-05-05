import { NextResponse } from "next/server"
import { phase2Store } from "@/lib/expert/phase2-store"

export async function POST(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  phase2Store.chats.set(sessionId, [])
  return NextResponse.json({ cleared: true })
}
