# VPS restore workflow (nexus / nexuspro.it.com)

## Goal

Restore Next.js app on VPS after crash; PM2 `nexus`, app dir **`/opt/nexus-pro`** (production: **`ssh vpsuser@67.159.52.40`**), nginx → `127.0.0.1:3000`.

## Session log

| Step | Action | Result / notes |
|------|--------|----------------|
| 1 | Deep diagnostic (paths, build, PM2, port, nginx) | `.next` OK (BUILD_ID + middleware-manifest). Port 3000: `next-server` listening. `curl` → **200**. PM2 **24 restarts** — old errors were **missing .next** during `next start` before build finished / after `rm -rf .next`. Out log shows **Ready**. Manual `next start` failed **EADDRINUSE** because PM2 already bound 3000 (expected). Nginx: `nexuspro.it.com` → `proxy_pass localhost:3000`, Certbot OK, `nginx -t` OK. |
| 2 | Cancel nested SSH + verify HTTPS + PM2 stability | _pending_ |

### Pitfall logged

- Do **not** SSH from **inside** the VPS **to the same host** (SSH-to-self). You are already on the server; use commands directly. Nested SSH triggers host-key prompts and is useless. Production SSH user/host: **`vpsuser@67.159.52.40`** (not any unrelated IP from old drafts).

### Step 1 command (minimal baseline)

On the VPS as `vpsuser` (or root if that is how you manage the box):

```bash
echo "=== paths ===" && ls -la /opt/nexus-pro/.env.local /opt/nexus-pro/ecosystem.config.js /opt/nexus-pro/package.json 2>&1
echo "=== pm2 ===" && pm2 list
echo "=== port 3000 ===" && ss -tlnp | grep -E ':3000\b' || echo "(nothing listening on 3000)"
```

### Step 2 command (2026-05-03)

See chat: abort nested SSH if prompted, then run the Step 2 block.

## Reference (repo)

- Deploy script: `scripts/deploy.sh`
- PM2: `ecosystem.config.js`
- Env template: `.env.local.example`
- Nginx example: `docs/nginx-nexus-pro.conf`
