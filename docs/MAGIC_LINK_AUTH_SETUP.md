# Magic-link login (Brevo SMTP)

Nexus Pro uses **Brevo SMTP** (nodemailer) and **Postgres token storage** — no Auth0, Clerk, or similar. Supabase Auth still issues the browser session after the link is verified (same cookie model as password login).

## Flow

1. User enters email on `/auth/login` → **Email link** tab.
2. `POST /api/auth/request-magic-link` stores a 6-digit code and sends it via Brevo SMTP.
3. User enters code on `/auth/magic` (or linked from email).
4. `POST /api/auth/verify-magic-link` validates code → Supabase session cookie.

Registration verification and password recovery use the same Brevo SMTP relay.

## Environment (VPS `.env.local`)

```bash
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your-brevo-login@email.com
BREVO_SMTP_PASSWORD=xsmtpsib-...   # Brevo → SMTP & API → SMTP keys
BREVO_SENDER_EMAIL=security@nexuspro.it.com
BREVO_SENDER_NAME=Nexus Pro Security
TRANSACTIONAL_REPLY_TO_EMAIL=support@nexuspro.it.com
```

Generic `SMTP_*` aliases are supported as fallback.

## DNS (Brevo)

On `nexuspro.it.com`:

- SPF: `v=spf1 include:spf.brevo.com ~all`
- DKIM: records from Brevo → Senders & IP → Domains → Authenticate
- DMARC: `_dmarc` TXT (e.g. `v=DMARC1; p=none; rua=mailto:...`)

Audit: `npx tsx scripts/audit-auth-email-dns.ts`

## Verify without sending mail

```bash
npm run brevo:smtp-check
```

## Supabase Auth dashboard SMTP (optional)

For Supabase-native password reset emails, set **Auth → SMTP** to the same Brevo relay (`smtp-relay.brevo.com:587`). App-owned flows do not depend on that setting.

## Health

`GET /api/health/launch` → `optional_services.brevo_smtp_configured`

## Security

- Revoke old provider keys when rotating.
- Never commit `.env.local` or paste SMTP keys into git.
