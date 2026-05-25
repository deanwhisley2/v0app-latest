"use client"

import { useId, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
}: PasswordFieldProps) {
  const autoId = useId()
  const inputId = idProp ?? autoId
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          className={cn("min-h-12 pr-11 text-base sm:text-sm touch-manipulation", inputClassName)}
        />
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
      </div>
      {hint}
    </div>
  )
}
