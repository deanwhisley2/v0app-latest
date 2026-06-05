# Auth email delivery investigation

**Last updated:** 2026-06-05  
**Provider:** Brevo SMTP (`smtp-relay.brevo.com:587`) via `lib/server/smtp-mail.ts`

## Executive summary

SMTP, DNS, and resend/recovery paths are **healthy**. Remaining registration complaints are **primarily registration-flow behaviour**, not provider outage:

| Finding | Severity | Status |
|---------|----------|--------|
| Registration used email lookup instead of user id | High | **Fixed** — `issueEmailVerificationCodeForUser(userId)` |
| Registration swallowed SMTP failures (`deferred`, still `ok: true`) | High | **By design** — account created; UX + logging improved |
| `ambiguous` lookup miss treated as `sent: true` | High | **Fixed** |
| No durable register-send audit trail | Medium | **Fixed** — `auth_email_delivery_events` + `[auth-email]` JSON logs |
| Resend/recovery use same SMTP stack | — | **Confirmed** |
| Historical Resend errors in PM2 | Info | Pre-Brevo migration only |
| Users receive mail but think signup failed | Medium | UX copy updated |

## Unified email pipeline (all auth mail)

| Flow | Entry | Send function | SMTP |
|------|-------|---------------|------|
| Register verify | `attemptRegisterEmailVerification` | `sendTransactionalVerificationEmail` | Brevo |
| Resend verify | `POST /api/auth/send-verification` | same | Brevo |
| Magic login | `requestMagicLink` | `sendLoginCodeEmail` | Brevo |
| Password reset | `requestPasswordResetCode` | `sendPasswordResetCodeEmail` | Brevo |

**Not used for customer auth mail:** Supabase default templates (recovery route explicitly avoids them).

Codes: `public.email_verifications` (verify + reset). Magic: `public.magic_link_tokens`.

## Root cause: registration vs resend

### Before fix

1. `POST /api/auth/register` called `issueEmailVerificationCode(email)` which **paginates** `auth.admin.listUsers` to find the user.
2. On lookup miss, returned `{ ok: true, ambiguous: true }` — **no code stored, no email sent**.
3. `attemptRegisterEmailVerification` treated any `issued.ok` as **`sent: true`**.
4. On SMTP error, registration still returned `ok: true` with `emailVerificationDeferred: true` (account exists; user may think “email failed”).

### After fix

- Register path uses **`issueEmailVerificationCodeForUser(userId, email)`** immediately after `createUser`.
- Outcomes logged to **`auth_email_delivery_events`** + structured `console.info('[auth-email]', …)`.
- API returns `emailVerificationSent: true` when Brevo accepts; `emailVerificationDeferred: true` only on real send failure.
- Resend returns: *“Verification email sent. Please check your inbox. Delivery may take up to 2 minutes.”*

## Production evidence (2026-06-05)

- `GET /api/health/launch` → `brevo_smtp_configured: true`
- SMTP probe to `lutayacolline@gmail.com` → **accepted**
- 48h signup sample: **14** profiles, **11** real-email auth users, **7** `email_verifications` rows
- **4** users had **no verification row within 5 minutes** of signup (gap before register-path fix)
- PM2 `nexus-error.log`: legacy **Resend** sandbox error (historical); no recent Brevo `EAUTH` on register

### Example gap cases

| User | Auth email | Issue |
|------|------------|-------|
| yakubu igulu | kubatwork@gmail.com | No code row at signup |
| Angella atim | sandejohn312@gmail.com | No code row at signup |
| Gerald serwadda | llujjanaj2@gmail.com | Code row hours later (manual resend) |

## Monitoring

### Health endpoint

`GET /api/health/launch` → `auth_email_health`:

- `registrations_estimate` (profiles created, 24h)
- `verification_codes_issued` (`email_verifications` rows, 24h)
- `verification_completions_estimate` (`profiles.is_verified` updates, 24h)
- `delivery_events` / `register_send` — counts by `sent|deferred|failed|skipped` (after migration applied)

### Ops script

```bash
npx tsx scripts/auth-email-health-report.ts 48
```

### PM2

```bash
pm2 logs nexus --lines 300 | rg -i '\[auth-email\]|\[register\] verification|smtp|EAUTH'
```

### Brevo dashboard

Transactional → Logs — compare timestamp to `auth_email_delivery_events.created_at` / `[auth-email]` JSON lines.

## Environment

| Variable | Purpose |
|----------|---------|
| `BREVO_SMTP_USER` / `BREVO_SMTP_PASSWORD` | **Required** |
| `BREVO_SENDER_EMAIL` | Default `security@nexuspro.it.com` (Nexus Pro Security) |
| `TRANSACTIONAL_REPLY_TO_EMAIL` | Default `support@nexuspro.it.com` |
| `NEXT_PUBLIC_SITE_URL` | Auth redirects / metadata |

Audit: `npx tsx scripts/audit-auth-email-dns.ts`

## Supabase auth URLs

Customer verification is **app-owned** (6-digit code via Brevo), not Supabase magic-link email. Confirm:

- `NEXT_PUBLIC_SITE_URL` = `https://www.nexuspro.it.com` (or canonical production host)
- Supabase Auth → URL configuration matches production domain for any remaining OAuth/callback paths

## UX guidance

- **Success:** “Verification email sent. Please check your inbox. Delivery may take up to 2 minutes.”
- **Deferred (Brevo error only):** amber panel on `/auth/verify` + resend CTA
- **Do not** block registration on SMTP failure — account is created; user can resend

## Migration

`supabase/migrations/20260605194500_auth_email_delivery_events.sql` — apply via Supabase pipeline / MCP `apply_migration`.

## Rollback

Redeploy prior SHA; table is append-only audit — safe to leave in place.
