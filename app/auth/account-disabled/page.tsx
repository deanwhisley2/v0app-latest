import Link from "next/link"

export default function AccountDisabledPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-16 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold">Account unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This account has been administratively disabled. If you believe this is a mistake, contact support through an
          official channel. Passwords remain protected; admins cannot see your credentials.
        </p>
      </div>
      <Link
        href="/auth/login"
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
          Return to sign-in
      </Link>
    </div>
  )
}
