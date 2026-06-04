import { redirect } from "next/navigation"

/** Legacy magic-link URLs — login now uses 6-digit codes on /auth/login. */
export default function MagicLinkLegacyPage() {
  redirect("/auth/login")
}
