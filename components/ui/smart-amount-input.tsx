"use client"

import { useCallback, useEffect, useId, useRef, type InputHTMLAttributes } from "react"
import { formatAmountInputLive } from "@/lib/customer-amount-input-format"

type SmartAmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: string
  onValueChange: (formatted: string) => void
  locale: string
  currency: string
}

/**
 * Text amount field with live locale grouping while typing.
 * Parent stores formatted string; parse with parseCustomerLocalAmountInput on submit.
 */
export function SmartAmountInput({
  value,
  onValueChange,
  locale,
  currency,
  className,
  id: idProp,
  ...rest
}: SmartAmountInputProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const inputRef = useRef<HTMLInputElement>(null)

  const applyFormat = useCallback(
    (raw: string) => {
      onValueChange(formatAmountInputLive(raw, locale, currency))
    },
    [locale, currency, onValueChange],
  )

  useEffect(() => {
    if (!value.trim()) return
    const next = formatAmountInputLive(value, locale, currency)
    if (next !== value) onValueChange(next)
  }, [locale, currency])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      applyFormat(e.target.value)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (el && document.activeElement === el) {
          const end = el.value.length
          el.setSelectionRange(end, end)
        }
      })
    },
    [applyFormat],
  )

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={handleChange}
      className={className}
      {...rest}
    />
  )
}
