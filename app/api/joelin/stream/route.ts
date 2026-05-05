import { phase2Store } from "@/lib/expert/phase2-store"

export async function GET() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const emit = () => {
        const payload = {
          coins: phase2Store.joelin,
          lastUpdated: new Date().toISOString(),
          nextRefresh: new Date(Date.now() + 300_000).toISOString(),
        }
        controller.enqueue(encoder.encode(`event: joelin-update\ndata: ${JSON.stringify(payload)}\n\n`))
      }
      emit()
      const interval = setInterval(emit, 300_000)
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
