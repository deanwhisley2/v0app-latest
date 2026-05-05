import { phase2Store } from "@/lib/expert/phase2-store"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")
  if (!sessionId) return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      let cursor = 0
      const push = () => {
        const messages = phase2Store.chats.get(sessionId) ?? []
        const next = messages.slice(cursor)
        cursor = messages.length
        for (const msg of next) {
          controller.enqueue(encoder.encode(`event: chat-message\ndata: ${JSON.stringify(msg)}\n\n`))
        }
      }
      push()
      const interval = setInterval(push, 1000)
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`)), 20_000)
      return () => {
        clearInterval(interval)
        clearInterval(heartbeat)
      }
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
