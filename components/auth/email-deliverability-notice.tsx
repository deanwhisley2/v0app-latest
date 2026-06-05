"use client"

import { VerificationDeliveryHint } from "@/components/auth/verification-delivery-hint"

export const EMAIL_DELIVERABILITY_HINT =
  "Verification emails usually arrive within 1 minute."

type Props = {
  className?: string
  collapsibleOnMobile?: boolean
  codeSentAt?: number | null
}

/** @deprecated Use VerificationDeliveryHint — kept for existing imports. */
export function EmailDeliverabilityNotice({ className, codeSentAt }: Props) {
  return <VerificationDeliveryHint className={className} codeSentAt={codeSentAt} />
}
