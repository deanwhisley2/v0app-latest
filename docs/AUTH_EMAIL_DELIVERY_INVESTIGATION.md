# Auth email delivery & registration fallback

**Last reviewed:** 2026-06-04  
**Production app:** https://www.nexuspro.it.com

## Executive summary

Nexus Pro **does not use Supabase Auth SMTP** for signup verification codes. Registration and resend flow through:

1. `POST /api/auth/register` → `issueEmailVerificationCode()` (Cyberpersons transactional API)
2. `POST /api/auth/send-verification` → same issuer
3. Codes stored in `public.email_verifications` (service role)
4. `POST /api/auth/verify-code` commits email to `profiles` only after valid code

Supabase `auth.signUp()` is **not** used for registration (avoids Supabase SMTP timeout). Users are created with `auth.admin.createUser()`.

## Supabase Auth configuration (dashboard checklist)

Verify in [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication**:

| Setting | Expected |
|--------|----------|
| Site URL | `https://www.nexuspro.it.com` or `https://nexuspro.it.com` (both should redirect consistently) |
| Redirect URLs | Include `https://www.nexuspro.it.com/**`, `https://nexuspro.it.com/**`, local dev if needed |
| Email confirmations | Secondary for this app; primary verify path is Cyberpersons + `verify-code` |
| Rate limits | Watch for 429 on repeated `send-verification` (app enforces 60s cooldown) |

**Note:** Misconfigured Site URL affects magic-link / recovery redirects, not Cyberpersons signup codes.

## Transactional email (production)

| Variable | Purpose |
|----------|---------|
| `CYBERPERSONS_EMAIL_API_KEY` | **Required** for verification send |
| `CYBERPERSONS_SENDER_EMAIL` | Default `no-reply@nexuspro.it.com` |
| `CYBERPERSONS_SENDER_NAME` | Default `Nexus Pro` |
| `NEXT_PUBLIC_SITE_URL` | Auth links / metadata |

Check runtime: `GET /api/health/launch` → `optional_services.cyberpersons_email_api_configured`.

### DNS (operator)

For `nexuspro.it.com` sender reputation:

- **SPF** — authorize Cyberpersons / sending host
- **DKIM** — sign outbound mail per provider docs
- **DMARC** — policy aligned with SPF/DKIM

Unverified sender domain returns API errors mapped to: *"Sender domain is not verified in Cyberpersons Email Delivery."*

## Common failure modes

| Symptom | Likely cause | App behavior |
|--------|--------------|--------------|
| Register succeeds, no email | Missing/invalid API key, domain not verified, provider reject | Register returns error if `issueEmailVerificationCode` fails; duplicate path re-sends |
| Email in spam | Provider filtering | UI shows Spam/Junk/Promotions notice + **Skip for now** |
| 429 on resend | 60s cooldown | Countdown on verify screen |
| Login blocked (legacy) | Removed — login allowed with unverified email | Dashboard shows non-blocking reminder |
| Unverified email in DB | Prevented — `profiles.email` null until code verified; pending in `user_metadata.pending_verification_email` |

## Registration paths

| Input | Auth email | Session at signup | Email verify |
|-------|------------|-------------------|--------------|
| Phone only | `p{digits}@accounts.nexuspro.it.com` | Yes → dashboard | N/A |
| Email (+ optional phone) | Real email | Yes if phone also provided | Code required for `profiles.email` |
| Email only | Real email | No — verify or skip → login | Optional via Settings later |

## UX safeguards (code)

- **Skip for now** on `/auth/verify` — session users → dashboard; others → login with `verify_later=1`
- **Register draft** — `localStorage` + session password restore (24h)
- **Pending verify** — `localStorage` `nexus_verification_pending_v1` (24h)
- **Email reminder banner** — dashboard, dismissible per session

## Log review (VPS)

```bash
pm2 logs nexus --lines 200 | rg -i "email_verifications|Cyberpersons|send-verification|register|502|429"
```

Look for: `email_verifications insert`, `Failed to send email`, `RESERVE_`, `register]`.

## Manual smoke test

1. Register with phone only → immediate dashboard.
2. Register with email + phone → verify screen → **Skip for now** → dashboard if session created.
3. Register email only → verify → **Skip for now** → login with password → dashboard + reminder banner.
4. Resend code → wait 60s between sends.
5. Verify code → `profiles.email` populated, reminder clears.

## Rollback

Redeploy prior SHA: `DEPLOY_REF=<sha> bash scripts/deploy-vps-git-archive.sh`
