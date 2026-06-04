/** Map slow Supabase Auth / proxy failures to clearer signup copy. */
export function friendlyRegisterAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("504") ||
    lower.includes("deadline exceeded")
  ) {
    return (
      "Registration took too long to finish. Wait one minute, then try again — " +
      "if you already received a verification email, open the verify page instead of registering again."
    )
  }
  return message
}

export function isAuthDuplicateSignupError(err: {
  message?: string | null
  code?: string | null
}): boolean {
  const raw = `${err.code ?? ""} ${err.message ?? ""}`.toLowerCase()
  if (raw.includes("user_already_exists")) return true
  if (raw.includes("already registered")) return true
  if (raw.includes("already been registered")) return true
  if (raw.includes("email address") && raw.includes("already")) return true
  if (raw.includes("duplicate")) return true
  return false
}
