import Link from "next/link"
import { Smartphone } from "lucide-react"

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Smartphone className="h-10 w-10 text-primary" aria-hidden />
      <h1 className="text-lg font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Nexus Pro needs a connection for trading and wallet actions. Reconnect and try again.
      </p>
      <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Retry
      </Link>
    </main>
  )
}
