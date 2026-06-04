# Magic link authentication (passwordless login)

Nexus Pro uses **your own SMTP** (Cyberpersons / nodemailer) and **Postgres token storage** — no Auth0, Clerk, or similar. Supabase Auth still issues the browser session after the link is verified (same cookie model as password login).

## Flow

1. User enters email on **Login → Email link** (or `POST /api/auth/request-magic-link`).
2. Server stores **SHA-256 hash** of a random token in `public.auth_magic_link_tokens` and emails a link:  
   `https://www.nexuspro.it.com/auth/magic?token=…`
3. User opens the link; `/auth/magic` calls `POST /api/auth/verify-magic-link`.
4. Server validates the token, marks it consumed, creates a Supabase session via admin `generateLink` + `verifyOtp`, and sets auth cookies.

## Database

Migration: `supabase/migrations/20260703230000_auth_magic_link_tokens_v1.sql`

| Column        | Purpose                                      |
|---------------|----------------------------------------------|
| `token_hash`  | SHA-256 of raw token (never store raw token) |
| `user_id`     | `auth.users.id`                              |
| `expires_at`  | Default 15 minutes                           |
| `consumed_at` | Set on successful verify (single-use)        |

RLS enabled, **no** client policies — only `service_role` (API routes).

Apply on remote: Supabase MCP `apply_migration` or `supabase db push`.

## API endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/auth/request-magic-link` | `{ "email": "user@example.com" }` | `{ ok, message }` (same message if email unknown) |
| `POST` | `/api/auth/verify-magic-link` | `{ "token": "<from email URL>" }` | `{ ok, userId }` + Set-Cookie session |

Rate limit: 120 seconds between sends per account.

## Environment variables

Add to `.env.local` (local) and `/opt/nexus-pro/.env.local` (VPS). **Do not commit passwords.**

```bash
# Required for magic-link login
SMTP_HOST=mail.cyberpersons.com
SMTP_PORT=587
SMTP_USER=smtp_3671703833b3c8c2
SMTP_PASSWORD=<your SMTP password>
SMTP_FROM_EMAIL=noreply@nexuspro.it.com
SMTP_FROM_NAME=Nexus Pro

NEXT_PUBLIC_SITE_URL=https://www.nexuspro.it.com
```

Aliases supported: `CYBERPERSONS_SMTP_HOST`, `CYBERPERSONS_SMTP_PORT`, `CYBERPERSONS_SMTP_USER`, `CYBERPERSONS_SMTP_PASSWORD`.

Still required (session issuance): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Registration **6-digit codes** can keep using `CYBERPERSONS_EMAIL_API_KEY` (REST) separately from SMTP magic links.

## Supabase Auth dashboard (optional)

For Supabase-native password reset emails, set **Auth → SMTP** to the same Cyberpersons host (`mail.cyberpersons.com:587`). Magic-link **login** does not depend on that setting.

## Production checklist

1. Apply migration `auth_magic_link_tokens_v1`.
2. Set SMTP env vars on VPS; `pm2 restart nexus`.
3. `curl -sS https://nexuspro.it.com/api/health/launch` → `optional_services.smtp_magic_link_configured: true`.
4. Request a link for a **registered, verified** account; open email; confirm redirect to `/dashboard`.
5. Revoke old Brevo keys if any remain.

## Code map

| File | Role |
|------|------|
| `lib/server/smtp-mail.ts` | nodemailer transport |
| `lib/server/magic-link-auth.ts` | Token issue/verify + session |
| `app/api/auth/request-magic-link/route.ts` | Request endpoint |
| `app/api/auth/verify-magic-link/route.ts` | Verify endpoint |
| `app/auth/magic/page.tsx` | Link landing page |
| `app/auth/login/login-form.tsx` | “Email link” tab |

## Security notes

- Anti-enumeration: unknown emails get the same success message.
- Tokens are single-use and short-lived.
- `profiles.is_verified === false` blocks sign-in (same as password login).
- Device login policy runs after verify when a session exists.

## Rollback

Redeploy prior app SHA; table can remain unused. To drop: `DROP TABLE public.auth_magic_link_tokens;` (only when no longer needed).
