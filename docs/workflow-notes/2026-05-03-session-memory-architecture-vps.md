# Session memory — 2026-05-03 (VPS, auth, architecture, clone)

## VPS / deploy (nexuspro.it.com)

- App dir: `/var/www/nexus`. PM2 app: **`nexus`**, `ecosystem.config.js` runs `npm start` → `next start` (port **3000**). Nginx proxies to `localhost:3000`; SSL via Certbot.
- **Failure mode fixed:** Orphan **`next-server`** held port **3000** while PM2 retried → **EADDRINUSE**, PM2 **errored**, high restart count; site could still work on the orphan. **Fix:** `pm2 delete nexus` → **`fuser -k 3000/tcp`** → `pm2 start ecosystem.config.js` → **`pm2 save`** → **`pm2 startup systemd`**.
- **Deploy order:** Never `rm -rf .next` while a process serves 3000 without stopping it first. Prefer `./scripts/deploy.sh` on server (git pull, `npm ci`, build, verify `middleware-manifest.json`, PM2 restart).
- **Do not** SSH from the VPS to itself for deploy scripts.

## Auth / data plane (codebase reality)

- App still uses **Supabase Auth** (`auth.users`, sessions) **and** Supabase Postgres for **`profiles`**, **`email_verifications`**, **`user_balances`**, **`bot_trade_records`** via JS client + service role.
- **Brevo SMTP** sends verification email; codes stored in **`public.email_verifications`**; **`profiles.is_verified`** updated on verify.
- Schema source of truth: `supabase/trading_platform_schema.sql`, `supabase/fix_profiles_registration.sql` (trigger `on_auth_user_created` → `profiles`).

## Architecture ideas discussed

- Target diagram: Next mostly stateless; Supabase SoT; optional **`pg_notify` + external LISTEN worker** (Postgres cannot call exchange HTTPS from triggers reliably). **Durable queue:** pending row + optional NOTIFY + worker **`FOR UPDATE SKIP LOCKED`** for scale and crash recovery.
- **RLS** for access rules, not trading logic. **Idempotency:** use **`external_ref`** unique partial index on `bot_trade_records`.
- **VPS (18 GB RAM, 8 cores, 256 GB):** Nginx caching static, optional Redis for rate limits/locks (not ledger), co-locate VPS / Supabase / exchange region; avoid second writable DB competing with Supabase.

## New experimental copy

- **Original (unchanged workflow):** `/home/whisley2/Downloads/v0app_latest`
- **Clone for “Nexus Pro 2” experiments:** `/home/whisley2/Downloads/Nexus-Pro-2` (created 2026-05-03 via `rsync`, excludes `node_modules` and `.next` — run `npm ci && npm run build` there).

## Registration / device issues (deferred)

- If “Registration failed” persists: server-side `curl` POST `/api/auth/register` + env non-empty checks; client uses `fetch` with `redirect: "follow"` to `/auth/verify`.
