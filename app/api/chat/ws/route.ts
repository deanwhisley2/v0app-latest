import { listChatMessagesForSession, phase2Store } from "@/lib/expert/phase2-store"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")
  if (!sessionId) return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400 })

  await listChatMessagesForSession(sessionId)

  const encoder = new TextEncoder()
  let intervalId: ReturnType<typeof setInterval> | undefined
  let heartbeatId: ReturnType<typeof setInterval> | undefined

  const cleanup = () => {
    if (intervalId !== undefined) {
      clearInterval(intervalId)
      intervalId = undefined
    }
    if (heartbeatId !== undefined) {
      clearInterval(heartbeatId)
      heartbeatId = undefined
    }
  }

  req.signal.addEventListener("abort", cleanup)

  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return
        try {
          controller.enqueue(chunk)
        } catch {
          closed = true
          cleanup()
        }
      }

      let cursor = 0
      const push = () => {
        const messages = phase2Store.chats.get(sessionId) ?? []
        const next = messages.slice(cursor)
        cursor = messages.length
        for (const msg of next) {
          safeEnqueue(encoder.encode(`event: chat-message\ndata: ${JSON.stringify(msg)}\n\n`))
        }
      }
      push()
      intervalId = setInterval(push, 1000)
      heartbeatId = setInterval(() => {
        safeEnqueue(encoder.encode(`event: ping\ndata: {}\n\n`))
      }, 20_000)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
