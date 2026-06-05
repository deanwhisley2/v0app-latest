function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function transactionalSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nexuspro.it.com").replace(/\/$/, "")
}

export type BrandedEmailContent = {
  subject: string
  preheader?: string
  headline: string
  greetingName: string
  bodyHtml: string
  bodyText: string
  cta?: { label: string; href: string }
  code?: string
  securityNote?: string
  purpose: string
}

export function buildBrandedTransactionalEmail(content: BrandedEmailContent): {
  subject: string
  html: string
  text: string
  purpose: string
} {
  const siteUrl = transactionalSiteUrl()
  const logoUrl = `${siteUrl}/brand/icons/icon-192.png`
  const safeName = escapeHtml(content.greetingName.trim() || "Valued Customer")
  const safeHeadline = escapeHtml(content.headline)
  const security =
    content.securityNote ??
    "If you did not request this message, you can safely ignore it. Nexus Pro will never ask you to share your code by phone or chat."
  const codeBlock = content.code
    ? `<div style="margin:24px 0;padding:20px;background:#f4f6fb;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Your secure code</p>
        <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a;">${escapeHtml(content.code)}</p>
      </div>`
    : ""
  const ctaBlock = content.cta
    ? `<p style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(content.cta.href)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:600;">
          ${escapeHtml(content.cta.label)}
        </a>
      </p>
      <p style="word-break:break-all;font-size:12px;color:#64748b;">If the button does not work, open: ${escapeHtml(content.cta.href)}</p>`
    : ""

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1e293b;background:#eef2f7;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader ?? content.headline)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;">
    <tr><td style="padding:0 0 16px;text-align:center;">
      <img src="${logoUrl}" alt="Nexus Pro" width="56" height="56" style="display:block;margin:0 auto 12px;border-radius:14px;" />
      <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">Nexus Pro</p>
      <p style="margin:6px 0 0;font-size:13px;color:#64748b;">Institutional trading platform</p>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #dbe3ef;border-radius:16px;padding:28px 24px;">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a;">${safeHeadline}</h1>
      <p style="margin:0 0 16px;">Hello <strong>${safeName}</strong>,</p>
      ${content.bodyHtml}
      ${codeBlock}
      ${ctaBlock}
      <p style="margin:20px 0 0;padding:14px 16px;background:#f8fafc;border-left:4px solid #2563eb;border-radius:8px;font-size:14px;color:#475569;">
        <strong>Security notice:</strong> ${escapeHtml(security)}
      </p>
    </td></tr>
    <tr><td style="padding:20px 8px 0;text-align:center;font-size:12px;color:#64748b;line-height:1.6;">
      <p style="margin:0 0 8px;"><a href="${siteUrl}" style="color:#2563eb;text-decoration:none;">${siteUrl.replace(/^https?:\/\//, "")}</a></p>
      <p style="margin:0;">Support: <a href="mailto:support@nexuspro.it.com" style="color:#2563eb;">support@nexuspro.it.com</a> · Security: <a href="mailto:security@nexuspro.it.com" style="color:#2563eb;">security@nexuspro.it.com</a></p>
      <p style="margin:12px 0 0;">© Nexus Pro · Secure • Fast • Reliable</p>
    </td></tr>
  </table>
</body></html>`

  const text = [
    "Nexus Pro",
    content.headline,
    "",
    `Hello ${content.greetingName.trim() || "Valued Customer"},`,
    "",
    content.bodyText,
    content.code ? `\nYour secure code: ${content.code}\n` : "",
    content.cta ? `\n${content.cta.label}: ${content.cta.href}\n` : "",
    "",
    `Security notice: ${security}`,
    "",
    siteUrl,
    "Support: support@nexuspro.it.com",
    "Security: security@nexuspro.it.com",
  ]
    .filter(Boolean)
    .join("\n")

  return { subject: content.subject, html, text, purpose: content.purpose }
}
