import { getTurnstileSiteKey } from "@/lib/server/turnstile-site-key"
import { LoginForm } from "./login-form"

export default function LoginPage() {
  return <LoginForm turnstileSiteKey={getTurnstileSiteKey()} />
}
