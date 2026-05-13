import { getTurnstileSiteKey } from "@/lib/server/turnstile-site-key"
import { RegisterForm } from "./register-form"

export default function RegisterPage() {
  return <RegisterForm turnstileSiteKey={getTurnstileSiteKey()} />
}
