import Link from "next/link"

export const metadata = {
  title: "Service Agreement | NEXUS PRO",
  description: "NEXUS PRO service agreement",
}

const SERVICE_AGREEMENT_TEXT = `Service Agreement
Last Updated: 2023/05/26 23:35:43

[Insert the entire long Service Agreement text you provided here — from "The Site is a platform..." all the way to the end of the arbitration section]

Best regards,
NEXUS PRO CRYPTO INTELLIGENCE`

export default function ServiceAgreementPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-muted-foreground">
      <Link href="/dashboard" className="text-primary hover:underline">
        ← Back to app
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-foreground">Service Agreement</h1>
      <p className="mt-2 text-xs">Last Updated: 2023/05/26</p>

      <details open className="mt-6 rounded-xl border border-border/70 bg-card/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Agreement Text</summary>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
          {SERVICE_AGREEMENT_TEXT}
        </pre>
      </details>
    </main>
  )
}
