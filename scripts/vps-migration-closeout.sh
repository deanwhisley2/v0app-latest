#!/usr/bin/env bash
# Post-migration hardening on production VPS (run from laptop with SSH to REMOTE_HOST).
#
# - Disables hostile * * * * * /var/www/deploy.sh (wrong path, restarts PM2 every minute)
# - Installs Nexus cron jobs (crypto verify, treasury reconcile, copy-trade + fixed-trade maturity)
# - Ensures CRON_SECRET + COMPRE_FACE_* in /opt/nexus-pro/.env.local
# - Archives legacy /root/apps/nexus-pro/v0app_latest
#
# Usage:
#   bash scripts/vps-migration-closeout.sh
#
# Env: REMOTE_HOST REMOTE_USER (see deploy-vps-git-archive.sh defaults)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-173.214.164.179}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
SSH=(ssh -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")

echo "==> closeout on ${REMOTE_USER}@${REMOTE_HOST}"
bash "${ROOT}/scripts/vps-production-sanitize-env.sh"

"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
APP="${REMOTE_APP_DIR}"
ENV="\${APP}/.env.local"

ensure_env() {
  local key="\$1" val="\$2"
  if grep -q "^\${key}=" "\$ENV" 2>/dev/null; then
    return 0
  fi
  echo "\${key}=\${val}" >> "\$ENV"
  echo "==> added \${key} to .env.local"
}

# --- CRON_SECRET ---
if ! grep -q '^CRON_SECRET=' "\$ENV" 2>/dev/null; then
  secret=\$(openssl rand -hex 32)
  ensure_env CRON_SECRET "\$secret"
  echo "==> generated CRON_SECRET"
else
  echo "==> CRON_SECRET already set"
fi

# --- CompreFace (from restored Postgres app row) ---
if ! grep -q '^COMPRE_FACE_API_URL=' "\$ENV" 2>/dev/null; then
  ensure_env COMPRE_FACE_API_URL "http://127.0.0.1:8000"
  ensure_env COMPRE_FACE_API_KEY "00000000-0000-0000-0000-000000000002"
  ensure_env COMPRE_FACE_VERIFY_THRESHOLD "0.82"
fi

chmod 600 "\$ENV"

# --- Disable wrong deploy cron ---
if [[ -f /var/www/deploy.sh ]]; then
  mv -f /var/www/deploy.sh /var/www/deploy.sh.disabled.\$(date +%Y%m%d) 2>/dev/null || true
  echo "==> disabled /var/www/deploy.sh"
fi

# --- Production crontab (preserve @reboot lines from provider) ---
CRON_TMP=\$(mktemp)
crontab -l 2>/dev/null | grep -v '/var/www/deploy.sh' | grep -v 'nexus-pro/scripts' > "\$CRON_TMP" || true
grep -q '@reboot' "\$CRON_TMP" || {
  echo '# provider reboot hooks' >> "\$CRON_TMP"
  echo '@reboot if [ -x /admin/firstbootkvm ]; then /admin/firstbootkvm yes; fi' >> "\$CRON_TMP"
  echo '@reboot netplan apply' >> "\$CRON_TMP"
}

if ! grep -q 'verify-crypto-deposits-cron' "\$CRON_TMP"; then
  SECRET=\$(grep '^CRON_SECRET=' "\$ENV" | cut -d= -f2-)
  cat >> "\$CRON_TMP" <<EOF

# Nexus Pro — production cron (do not use /var/www/deploy.sh)
*/3 * * * * CRON_SECRET=\${SECRET} APP_URL=https://nexuspro.it.com bash ${REMOTE_APP_DIR}/scripts/verify-crypto-deposits-cron.sh >> /var/log/nexus-crypto-cron.log 2>&1
*/15 * * * * CRON_SECRET=\${SECRET} APP_URL=https://nexuspro.it.com bash ${REMOTE_APP_DIR}/scripts/treasury-reconcile-cron.sh >> /var/log/nexus-treasury-cron.log 2>&1
*/5 * * * * curl -fsS -X POST https://nexuspro.it.com/api/cron/process-fixed-trade-maturity -H "x-cron-secret: \${SECRET}" -H "Content-Type: application/json" --max-time 120 >> /var/log/nexus-fixed-trade-cron.log 2>&1
*/10 * * * * curl -fsS -X POST https://nexuspro.it.com/api/cron/settle-expired-copy-trades -H "x-cron-secret: \${SECRET}" -H "Content-Type: application/json" --max-time 120 >> /var/log/nexus-copy-trade-cron.log 2>&1
EOF
fi

crontab "\$CRON_TMP"
rm -f "\$CRON_TMP"
echo "==> crontab installed"
crontab -l | grep -E 'nexus|deploy' | sed 's/x-cron-secret: [^ ]*/x-cron-secret: ***/; s/CRON_SECRET=[^ ]*/CRON_SECRET=***/' || true

# --- jq for treasury cron ---
command -v jq >/dev/null || apt-get update -qq && apt-get install -y -qq jq

# --- Archive legacy clone ---
LEGACY=/root/apps/nexus-pro/v0app_latest
if [[ -d "\$LEGACY" ]]; then
  ARCH=/root/archive/nexus-legacy-v0app_latest-\$(date +%Y%m%d)
  mkdir -p /root/archive
  mv "\$LEGACY" "\$ARCH"
  echo "==> archived legacy app to \$ARCH"
fi

# --- PM2 single process ---
pm2 delete nexus-auto-trader 2>/dev/null || true
cd "\$APP"
pm2 restart nexus || pm2 start ecosystem.config.js
pm2 save
echo "==> PM2 restarted"

# --- smoke ---
sleep 5
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "==> health OK"
CRON_SECRET=\$(grep ^CRON_SECRET= "\$ENV" | cut -d= -f2-)
curl -fsS -X POST http://127.0.0.1:3000/api/cron/verify-crypto-deposits \\
  -H "x-cron-secret: \$CRON_SECRET" -H "Content-Type: application/json" >/dev/null \\
  && echo "==> crypto cron endpoint OK" || echo "WARN: crypto cron endpoint failed"
REMOTE

echo "==> closeout complete"
