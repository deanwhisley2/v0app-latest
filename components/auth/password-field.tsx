"use client"

import { useId, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SECURE_PASSWORD_INPUT_PROPS } from "@/lib/security/secure-input"
import { NexusSecureShield } from "@/components/security/nexus-secure-shield"
import { cn } from "@/lib/utils"

type PasswordFieldProps = {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: "current-password" | "new-password"
  disabled?: boolean
  required?: boolean
  minLength?: number
  className?: string
  inputClassName?: string
  "aria-invalid"?: boolean
  hint?: React.ReactNode
  /** When true, password stays masked (no reveal toggle) for capture-safe auth. */
  captureHardened?: boolean
}

/** Password input with stable layout eye toggle — autofill/password-manager safe. */
export function PasswordField({
  id: idProp,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  required,
  minLength,
  className,
  inputClassName,
  "aria-invalid": ariaInvalid,
  hint,
  captureHardened = false,
}: PasswordFieldProps) {
  const autoId = useId()
  const inputId = idProp ?? autoId
  const [visible, setVisible] = useState(false)
  const canReveal = !captureHardened

  return (
    <NexusSecureShield className={cn("space-y-2", className)}>
      <Label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          type={canReveal && visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          className={cn(
            "min-h-12 text-base sm:text-sm touch-manipulation",
            canReveal ? "pr-11" : "",
            inputClassName,
          )}
          {...SECURE_PASSWORD_INPUT_PROPS}
          autoComplete={captureHardened ? "new-password" : autoComplete}
        />
        {canReveal ? (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            aria-controls={inputId}
            onClick={() => setVisible((v) => !v)}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground touch-manipulation disabled:opacity-50"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        ) : null}
      </div>
      {hint}
    </NexusSecureShield>
  )
}
