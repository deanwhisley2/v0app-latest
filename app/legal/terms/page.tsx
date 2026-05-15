import Link from "next/link"

export const metadata = {
  title: "Terms of Service | NEXUS PRO",
  description: "NEXUS PRO terms of service",
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-muted-foreground">
      <Link href="/dashboard" className="text-primary hover:underline">
        ← Back to app
      </Link>
      <h1 className="mt-6 text-2xl font-bold text-foreground">Terms of Service</h1>
      <p className="mt-2 text-xs">Effective May 3, 2026 · Version 1.0</p>
      <p className="mt-4">
        NEXUS PRO is operated by NEXUS CRYPTO INTELLIGENCE. By using the platform you agree to these terms. If you do
        not agree, do not use the service.
      </p>
      <h2 className="mt-6 text-lg font-semibold text-foreground">Services</h2>
      <p className="mt-2">
        We provide market data, analysis tools, notifications, container and copy-trade workflows, and optional
        third-party exchange connectivity. The platform does not custody your funds; assets remain with you and with
        connected exchanges under their terms.
      </p>
      <h2 className="mt-6 text-lg font-semibold text-foreground">Eligibility</h2>
      <p className="mt-2">
        You must be at least 18 (or the age of majority where you live) and not use the service from prohibited
        jurisdictions.
      </p>
      <h2 className="mt-6 text-lg font-semibold text-foreground">Risk</h2>
      <p className="mt-2">
        Digital assets are volatile. Past performance does not guarantee future results. In-app guidance is not
        financial, legal, or tax advice.
      </p>
      <p className="mt-8 text-xs">
        Full counsel-reviewed text: see your onboarding pack or contact{" "}
        <a href="mailto:esknexuspro@gmail.com" className="text-primary hover:underline">
          esknexuspro@gmail.com
        </a>
        .
      </p>
    </main>
  )
}
