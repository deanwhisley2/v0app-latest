# Auth email delivery investigation

**Provider:** Brevo SMTP (`smtp-relay.brevo.com:587`) via nodemailer for all transactional auth mail.

## Flow

1. Register / resend → `issueEmailVerificationCode()` → `sendTransactionalVerificationEmail()` → Brevo SMTP
2. `POST /api/auth/send-verification` → same pipeline
3. Magic-link login → `sendLoginCodeEmail()` → Brevo SMTP
4. Password recovery → `sendPasswordResetCodeEmail()` → Brevo SMTP

Codes live in `public.email_verifications` (service role). Magic-link tokens in `public.magic_link_tokens`.

## Environment

| Variable | Purpose |
|----------|---------|
| `BREVO_SMTP_HOST` | Default `smtp-relay.brevo.com` |
| `BREVO_SMTP_PORT` | Default `587` |
| `BREVO_SMTP_USER` | **Required** — Brevo account login email |
| `BREVO_SMTP_PASSWORD` | **Required** — SMTP relay key (`xsmtpsib-…`) |
| `BREVO_SENDER_EMAIL` | Default `no-reply@nexuspro.it.com` |
| `BREVO_SENDER_NAME` | Default `Nexus Pro` |

Generic `SMTP_*` / `TRANSACTIONAL_FROM_*` aliases supported.

Runtime check: `GET /api/health/launch` → `optional_services.brevo_smtp_configured`.

Implementation: `lib/server/smtp-mail.ts`, `lib/server/transactional-email.ts`.

## DNS checklist (nexuspro.it.com)

| Record | Expected |
|--------|----------|
| SPF | `include:spf.brevo.com` on apex |
| DKIM | Brevo-provided selector(s) on `_domainkey` |
| DMARC | `_dmarc` TXT present |
| From alignment | `BREVO_SENDER_EMAIL` domain = apex |

Audit script: `npx tsx scripts/audit-auth-email-dns.ts`

Optional live send: `npx tsx scripts/audit-auth-email-dns.ts --send-test you@gmail.com`

SMTP verify only: `npm run brevo:smtp-check`

## Bounce / delivery debugging

- Brevo dashboard → **Transactional** → **Logs**
- PM2: `pm2 logs nexus --lines 200 | rg -i "smtp|send-verification|register|EAUTH|ECONNECTION"`

Do **not** send auth mail through app VPS Postfix.

## Ops: migrate VPS env from legacy Cyberpersons

```bash
# On VPS /opt/nexus-pro/.env.local
sed -i '/^CYBERPERSONS_/d' .env.local
# Set BREVO_SMTP_* (see SERVER_ENV_AFTER_PUSH.txt)
pm2 restart nexus
npm run brevo:smtp-check
```
