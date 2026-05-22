#!/usr/bin/env bash
# Pull server-only state from the production VPS into a local bundle (secrets included).
# Output: ${BACKUP_ROOT}/<timestamp>/ and ${BACKUP_ROOT}/latest → that folder.
#
# Usage:
#   bash scripts/vps-migration-backup.sh
#
# Env:
#   REMOTE_HOST=173.214.164.179  REMOTE_USER=root  REMOTE_APP_DIR=/opt/nexus-pro
#   BACKUP_ROOT=/path/to/.vps-migration-backup   (default: repo/.vps-migration-backup)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-173.214.164.179}"
REMOTE_USER="${REMOTE_USER:-root}"
LEGACY_DECOMMISSIONED_HOST="${LEGACY_DECOMMISSIONED_HOST:-67.159.52.40}"
[[ "${REMOTE_HOST}" == "${LEGACY_DECOMMISSIONED_HOST}" ]] && {
  echo "ERROR: REMOTE_HOST is decommissioned legacy VPS ${LEGACY_DECOMMISSIONED_HOST}"; exit 1; }
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
BACKUP_ROOT="${BACKUP_ROOT:-${ROOT}/.vps-migration-backup}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_ROOT}/${STAMP}"
SSH=(ssh -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")
SCP=(scp -o BatchMode=yes)

echo "==> VPS migration backup"
echo "    source: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}"
echo "    dest:   ${DEST}"

mkdir -p "${DEST}"/{app,pm2,nginx,certbot,docker,logs,crontab,systemd,meta}

printf '%s\n' "${REMOTE_USER}@${REMOTE_HOST}" > "${DEST}/meta/source.txt"
printf '%s\n' "${REMOTE_APP_DIR}" > "${DEST}/meta/remote_app_dir.txt"
printf '%s\n' "${STAMP}" > "${DEST}/meta/created_utc.txt"

echo "==> app secrets + deploy markers"
"${SCP[@]}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/.env.local" "${DEST}/app/.env.local"
for f in .deploy-revision ecosystem.config.js ecosystem.config.cjs docker-compose.compreface.yml; do
  "${SCP[@]}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/${f}" "${DEST}/app/${f}" 2>/dev/null || true
done

echo "==> PM2"
"${SCP[@]}" -r "${REMOTE_USER}@${REMOTE_HOST}:.pm2/dump.pm2" "${DEST}/pm2/dump.pm2" 2>/dev/null || true
"${SCP[@]}" -r "${REMOTE_USER}@${REMOTE_HOST}:.pm2/dump.pm2.bak" "${DEST}/pm2/dump.pm2.bak" 2>/dev/null || true
"${SSH[@]}" "test -d ${REMOTE_APP_DIR}/logs && cd ${REMOTE_APP_DIR}/logs && tar czf - ." > "${DEST}/logs/app-logs.tar.gz" 2>/dev/null || true

echo "==> nginx (requires passwordless sudo on VPS)"
"${SSH[@]}" "sudo -n cat /etc/nginx/sites-enabled/nexus-pro" > "${DEST}/nginx/nexus-pro.conf"
"${SSH[@]}" "sudo -n nginx -T 2>/dev/null | head -c 500000" > "${DEST}/nginx/nginx-T-head.txt" 2>/dev/null || true

echo "==> certbot inventory"
"${SSH[@]}" "sudo -n certbot certificates 2>/dev/null" > "${DEST}/certbot/certificates.txt" || true
"${SSH[@]}" "sudo -n ls -la /etc/letsencrypt/renewal/ 2>/dev/null" > "${DEST}/certbot/renewal-dir-ls.txt" || true

echo "==> crontab (all users we can read)"
for u in vpsuser root; do
  "${SSH[@]}" "sudo -n crontab -u ${u} -l 2>/dev/null" > "${DEST}/crontab/${u}.txt" 2>/dev/null || true
  if [[ ! -s "${DEST}/crontab/${u}.txt" ]]; then
    "${SSH[@]}" "crontab -l 2>/dev/null" > "${DEST}/crontab/${u}.txt" 2>/dev/null || true
  fi
  if [[ ! -s "${DEST}/crontab/${u}.txt" ]]; then
    echo "# (empty or crontab not installed for ${u})" > "${DEST}/crontab/${u}.txt"
  fi
done

echo "==> systemd PM2 startup"
"${SSH[@]}" "systemctl cat pm2-${REMOTE_USER} 2>/dev/null" > "${DEST}/systemd/pm2-vpsuser.service" 2>/dev/null || true
"${SSH[@]}" "systemctl is-enabled pm2-${REMOTE_USER} 2>/dev/null; systemctl status pm2-${REMOTE_USER} --no-pager 2>/dev/null | head -20" > "${DEST}/systemd/pm2-status.txt" 2>/dev/null || true

echo "==> CompreFace Postgres volume (docker)"
"${SSH[@]}" "sudo -n docker volume inspect nexus-pro_compreface-postgres-data --format '{{.Mountpoint}}' 2>/dev/null" > "${DEST}/docker/volume-mountpoint.txt" || true
"${SSH[@]}" "sudo -n docker run --rm -v nexus-pro_compreface-postgres-data:/data:ro alpine tar czf - -C /data ." > "${DEST}/docker/compreface-postgres-data.tgz"

echo "==> live health snapshot"
"${SSH[@]}" "curl -fsS https://nexuspro.it.com/api/health 2>/dev/null; echo; curl -fsS https://nexuspro.it.com/api/health/supabase 2>/dev/null; echo" > "${DEST}/meta/health-at-backup.txt" 2>/dev/null || true
"${SSH[@]}" "pm2 jlist 2>/dev/null | head -c 8000" > "${DEST}/meta/pm2-jlist-head.json" 2>/dev/null || true

echo "==> checksums"
(
  cd "${DEST}"
  find . -type f ! -name 'SHA256SUMS.txt' -print0 | sort -z | xargs -0 sha256sum
) > "${DEST}/meta/SHA256SUMS.txt"

ln -sfn "${STAMP}" "${BACKUP_ROOT}/latest"
cat > "${BACKUP_ROOT}/README.txt" <<EOF
VPS migration backups (CONTAINS SECRETS — never commit to git).

Latest bundle: ${BACKUP_ROOT}/latest/
Created: ${STAMP}
Source: ${REMOTE_USER}@${REMOTE_HOST}

Restore after DNS points at new server:
  BACKUP_DIR=${BACKUP_ROOT}/latest REMOTE_HOST=<new-ip> bash scripts/vps-migration-restore.sh

Re-deploy app code:
  REMOTE_HOST=<new-ip> bash scripts/deploy-vps-git-archive.sh
EOF

echo "==> done: ${DEST}"
echo "    latest → ${BACKUP_ROOT}/latest"
wc -c "${DEST}"/app/.env.local "${DEST}"/docker/compreface-postgres-data.tgz 2>/dev/null || true
