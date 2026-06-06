import { sendSmtpMail } from "@/lib/server/smtp-mail"
import { buildBrandedTransactionalEmail } from "@/lib/server/transactional-email-templates"

type CodeEmailKind = "login" | "password_reset"

function transactionalCodeBodies(code: string, fullName: string, kind: CodeEmailKind) {
  const copy =
    kind === "password_reset"
      ? {
          subject: "Your Nexus Pro password reset code",
          preheader: "Use this secure code to reset your Nexus Pro password.",
          headline: "Password reset code",
          action:
            "Enter this code on the password reset page to choose a new password. The code expires in 15 minutes.",
          tag: "password-reset" as const,
        }
      : {
          subject: "Your Nexus Pro sign-in code",
          preheader: "Use this secure code to sign in to Nexus Pro.",
          headline: "Sign-in verification code",
          action: "Enter this code on the login page to sign in securely. The code expires in 15 minutes.",
          tag: "login-code" as const,
        }

  return buildBrandedTransactionalEmail({
    subject: copy.subject,
    preheader: copy.preheader,
    headline: copy.headline,
    greetingName: fullName,
    bodyHtml: `<p style="margin:0 0 12px;">${copy.action}</p>`,
    bodyText: copy.action,
    code,
    purpose: copy.tag,
  })
}

async function sendTransactionalCodeEmail(
  to: string,
  code: string,
  fullName: string,
  kind: CodeEmailKind,
): Promise<{ messageId: string }> {
  const mail = transactionalCodeBodies(code, fullName, kind)
  return sendSmtpMail({ to, ...mail })
}

export async function sendLoginCodeEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<{ messageId: string }> {
  return sendTransactionalCodeEmail(to, code, fullName, "login")
}

export async function sendPasswordResetCodeEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<{ messageId: string }> {
  return sendTransactionalCodeEmail(to, code, fullName, "password_reset")
}
