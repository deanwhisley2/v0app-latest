import { NextResponse } from "next/server"
import { clearChatMessagesForSession } from "@/lib/expert/phase2-store"

export async function POST(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  await clearChatMessagesForSession(sessionId)
  return NextResponse.json({ cleared: true })
}
