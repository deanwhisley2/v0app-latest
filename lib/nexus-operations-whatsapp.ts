import { COMPANY_CONTACT } from "@/lib/i18n/company-messages"

const AUTO_TRADE_REQUEST_TEMPLATE =
  "Hello Nexus Pro Operations. I am interested in unlocking Auto Trade Mode on my account. Please advise on the requirements, eligibility, and available automated trading plans."

export function buildOperationsWhatsAppHref(params: {
  userId: string
  email?: string | null
}): string {
  const lines = [
    AUTO_TRADE_REQUEST_TEMPLATE,
    "",
    `Nexus user ID: ${params.userId}`,
    `Account email: ${(params.email ?? "").trim() || "not on file"}`,
  ]
  const text = encodeURIComponent(lines.join("\n"))
  const base = COMPANY_CONTACT.whatsappHref
  return base.includes("?") ? `${base}&text=${text}` : `${base}?text=${text}`
}
