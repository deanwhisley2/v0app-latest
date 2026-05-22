#!/usr/bin/env bash
# Restore server-only state onto a target VPS, then deploy app code.
#
# Prereqs on NEW server: Node 20+, npm, pm2, nginx, docker, certbot (see docs/SERVER_SETUP.md).
# DNS for nexuspro.it.com should point at REMOTE_HOST before certbot step (or use --dry-run first).
#
# Usage:
#   BACKUP_DIR=.vps-migration-backup/latest REMOTE_HOST=<new-ip> bash scripts/vps-migration-restore.sh
#
# Env:
#   BACKUP_DIR     — bundle from vps-migration-backup.sh (required)
#   REMOTE_HOST    — new VPS IP/hostname (required)
#   REMOTE_USER    — default vpsuser
#   REMOTE_APP_DIR — default /opt/nexus-pro
#   SKIP_DEPLOY=1  — only restore files/services, do not run deploy-vps-git-archive.sh
#   SKIP_CERTBOT=1 — skip HTTPS issuance (e.g. DNS not ready yet)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"

if [[ -z "${BACKUP_DIR}" ]]; then
  echo "ERROR: set BACKUP_DIR (e.g. ${ROOT}/.vps-migration-backup/latest)"
  exit 1
fi
if [[ -z "${REMOTE_HOST}" ]]; then
  echo "ERROR: set REMOTE_HOST to the new VPS IP/hostname"
  exit 1
fi
BACKUP_DIR="$(cd "${BACKUP_DIR}" && pwd)"

bash "${ROOT}/scripts/vps-migration-verify-backup.sh"

for req in app/.env.local nginx/nexus-pro.conf; do
  if [[ ! -f "${BACKUP_DIR}/${req}" ]]; then
    echo "ERROR: missing ${BACKUP_DIR}/${req} — run vps-migration-backup.sh first"
    exit 1
  fi
done

SSH=(ssh -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")
SCP=(scp -o BatchMode=yes)

echo "==> VPS migration restore"
echo "    backup: ${BACKUP_DIR}"
echo "    target: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}"

echo "==> ensure app directory"
"${SSH[@]}" "sudo mkdir -p ${REMOTE_APP_DIR} && sudo chown -R ${REMOTE_USER}:${REMOTE_USER} ${REMOTE_APP_DIR}"

echo "==> restore .env.local + ecosystem + compose"
"${SCP[@]}" "${BACKUP_DIR}/app/.env.local" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/.env.local"
chmod_remote=("${REMOTE_USER}@${REMOTE_HOST}")
for f in ecosystem.config.js ecosystem.config.cjs docker-compose.compreface.yml .deploy-revision; do
  if [[ -f "${BACKUP_DIR}/app/${f}" ]]; then
    "${SCP[@]}" "${BACKUP_DIR}/app/${f}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/${f}"
  fi
done
"${SSH[@]}" "chmod 600 ${REMOTE_APP_DIR}/.env.local"
if ! "${SSH[@]}" "grep -q '^NEXT_PUBLIC_SITE_URL=' ${REMOTE_APP_DIR}/.env.local"; then
  "${SSH[@]}" "echo 'NEXT_PUBLIC_SITE_URL=https://nexuspro.it.com' >> ${REMOTE_APP_DIR}/.env.local"
  echo "==> appended NEXT_PUBLIC_SITE_URL (required for auth redirects + mobile)"
fi

echo "==> restore nginx site"
"${SCP[@]}" "${BACKUP_DIR}/nginx/nexus-pro.conf" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/nexus-pro.conf"
"${SSH[@]}" "sudo cp /tmp/nexus-pro.conf /etc/nginx/sites-available/nexus-pro && sudo ln -sf /etc/nginx/sites-available/nexus-pro /etc/nginx/sites-enabled/nexus-pro && sudo nginx -t && sudo systemctl reload nginx"

if [[ "${SKIP_CERTBOT}" != "1" ]]; then
  echo "==> certbot (re-issue on new host — requires DNS → ${REMOTE_HOST})"
  if ! "${SSH[@]}" "sudo -n certbot certificates 2>/dev/null | grep -q nexuspro.it.com"; then
    "${SSH[@]}" "sudo -n certbot --nginx -d nexuspro.it.com -d www.nexuspro.it.com --non-interactive --agree-tos -m esknexuspro@gmail.com --redirect" \
      || echo "WARN: certbot failed — fix DNS/firewall then re-run certbot manually"
  else
    echo "==> certbot: existing nexuspro.it.com cert found, skipping"
  fi
else
  echo "==> SKIP_CERTBOT=1 — configure HTTPS manually when DNS is ready"
fi

echo "==> restore CompreFace volume + start stack"
if [[ -f "${BACKUP_DIR}/docker/compreface-postgres-data.tgz" ]]; then
  "${SCP[@]}" "${BACKUP_DIR}/docker/compreface-postgres-data.tgz" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/compreface-postgres-data.tgz"
  "${SSH[@]}" "REMOTE_APP_DIR=${REMOTE_APP_DIR} bash -s" <<'REMOTE'
set -euo pipefail
APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
cd "$APP_DIR"
if [[ ! -f docker-compose.compreface.yml ]]; then
  echo "WARN: docker-compose.compreface.yml missing — skip CompreFace"
  exit 0
fi
sudo docker compose -f docker-compose.compreface.yml down 2>/dev/null || true
VOL=nexus-pro_compreface-postgres-data
sudo docker volume rm "$VOL" 2>/dev/null || true
sudo docker volume create "$VOL"
sudo docker run --rm -v "$VOL":/data -v /tmp:/backup alpine sh -c 'cd /data && tar xzf /backup/compreface-postgres-data.tgz'
rm -f /tmp/compreface-postgres-data.tgz
sudo docker compose -f docker-compose.compreface.yml up -d
REMOTE
else
  echo "WARN: no CompreFace volume backup — selfie verification may re-enroll users"
fi

echo "==> restore crontab entries (if any non-comment lines)"
for u in vpsuser root; do
  f="${BACKUP_DIR}/crontab/${u}.txt"
  [[ -f "$f" ]] || continue
  if grep -qvE '^\s*#|^\s*$' "$f"; then
  "${SCP[@]}" "$f" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/cron-${u}.txt"
  "${SSH[@]}" "sudo -n crontab -u ${u} /tmp/cron-${u}.txt 2>/dev/null || crontab /tmp/cron-${u}.txt 2>/dev/null || echo WARN: could not install crontab for ${u}"
  fi
done

echo "==> PM2 startup unit (reference)"
if [[ -f "${BACKUP_DIR}/systemd/pm2-vpsuser.service" ]]; then
  "${SCP[@]}" "${BACKUP_DIR}/systemd/pm2-vpsuser.service" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/pm2-vpsuser.service.reference"
fi

if [[ "${SKIP_DEPLOY}" != "1" ]]; then
  echo "==> deploy application code (git archive → build → PM2)"
  REMOTE_HOST="${REMOTE_HOST}" REMOTE_USER="${REMOTE_USER}" REMOTE_APP_DIR="${REMOTE_APP_DIR}" \
    bash "${ROOT}/scripts/deploy-vps-git-archive.sh"
else
  echo "==> SKIP_DEPLOY=1 — start PM2 manually after code is on server"
  if [[ -f "${BACKUP_DIR}/pm2/dump.pm2" ]]; then
    "${SCP[@]}" "${BACKUP_DIR}/pm2/dump.pm2" "${REMOTE_USER}@${REMOTE_HOST}:.pm2/dump.pm2"
    "${SSH[@]}" "cd ${REMOTE_APP_DIR} && pm2 resurrect 2>/dev/null || (pm2 start ecosystem.config.js && pm2 save)" || true
  fi
fi

echo "==> restore app logs archive (optional)"
if [[ -f "${BACKUP_DIR}/logs/app-logs.tar.gz" ]]; then
  "${SCP[@]}" "${BACKUP_DIR}/logs/app-logs.tar.gz" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/app-logs.tar.gz"
  "${SSH[@]}" "mkdir -p ${REMOTE_APP_DIR}/logs && tar xzf /tmp/app-logs.tar.gz -C ${REMOTE_APP_DIR}/logs && rm -f /tmp/app-logs.tar.gz" || true
fi

echo "==> post-restore verification"
APP_URL="$(grep -E '^NEXT_PUBLIC_SITE_URL=' "${BACKUP_DIR}/app/.env.local" | head -1 | cut -d= -f2- | tr -d '\"'"'"' | tr -d ' ' || echo 'https://nexuspro.it.com')"
"${SSH[@]}" "curl -fsS ${APP_URL}/api/health && echo && pm2 list" || echo "WARN: health check failed — wait for build or fix DNS/TLS"

echo "==> restore complete. Verify:"
echo "    curl -fsS ${APP_URL}/api/health"
echo "    curl -fsS ${APP_URL}/api/health/supabase"
echo "    curl -fsS ${APP_URL}/api/health/launch"
