import { Resend } from "resend"

export async function sendVerificationEmail(to: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    throw new Error("Missing RESEND_API_KEY or EMAIL_FROM")
  }

  const resend = new Resend(apiKey)

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Your Nexus Pro verification code",
    html: `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:480px;">
        <h2 style="margin:0 0 16px;">Verify your email</h2>
        <p style="margin:0 0 12px;color:#444;">Your Nexus Pro verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:0.2em;margin:0 0 16px;">${code}</p>
        <p style="margin:0;font-size:14px;color:#666;">This code expires in 15 minutes. If you did not register, ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    throw new Error(error.message || "Failed to send email")
  }
}
