import Link from "next/link"

export const metadata = {
  title: "Privacy Policy | NEXUS PRO",
  description: "NEXUS PRO privacy policy",
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-muted-foreground">
      <Link href="/dashboard" className="text-primary hover:underline">
        ← Back to app
      </Link>
      <h1 className="mt-6 text-2xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-xs">Effective May 3, 2026</p>
      <p className="mt-4">
        NEXUS CRYPTO INTELLIGENCE (&quot;we&quot;) respects your privacy. This policy describes how we collect, use,
        and protect information when you use NEXUS PRO.
      </p>
      <h2 className="mt-6 text-lg font-semibold text-foreground">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Account details (email, profile, preferences)</li>
        <li>Security data you provide (e.g. recovery selfie, device sessions)</li>
        <li>Funding and balance activity needed to operate the product</li>
        <li>Exchange API credentials you choose to connect (stored encrypted)</li>
      </ul>
      <h2 className="mt-6 text-lg font-semibold text-foreground">How we use it</h2>
      <p className="mt-2">
        To run the app, prevent fraud, send service emails (e.g. verification), and improve reliability. We do not sell
        your personal data.
      </p>
      <h2 className="mt-6 text-lg font-semibold text-foreground">Your choices</h2>
      <p className="mt-2">
        You may update preferences in Settings, revoke exchange connections, and contact us to request access or
        deletion where applicable law allows.
      </p>
      <p className="mt-8 text-xs">
        Questions:{" "}
        <a href="mailto:esknexuspro@gmail.com" className="text-primary hover:underline">
          esknexuspro@gmail.com
        </a>
      </p>
    </main>
  )
}
