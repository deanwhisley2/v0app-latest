import type { CSSProperties, InputHTMLAttributes } from "react"

export const NEXUS_SECURE_SHIELD_CLASS = "nexus-secure-shield"
export const NEXUS_SENSITIVE_MASK_CLASS = "nexus-sensitive-mask"

type SecureInputProps = InputHTMLAttributes<HTMLInputElement> & {
  "data-private": "true"
}

/** Shared attrs for PIN and credential inputs. */
export const SECURE_PIN_INPUT_PROPS: SecureInputProps = {
  type: "password",
  autoComplete: "new-password",
  "data-private": "true",
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
}

/** Transaction / confirmation reference fields (masked during capture). */
export const SECURE_TX_REF_INPUT_PROPS: SecureInputProps = {
  type: "password",
  autoComplete: "new-password",
  "data-private": "true",
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
}

/** Login / account password fields. */
export const SECURE_PASSWORD_INPUT_PROPS: SecureInputProps = {
  type: "password",
  autoComplete: "new-password",
  "data-private": "true",
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
}

export const SECURE_SHIELD_CONTAINER_PROPS = {
  className: NEXUS_SECURE_SHIELD_CLASS,
  "data-private": "true" as const,
  style: { isolation: "isolate" } satisfies CSSProperties,
}
