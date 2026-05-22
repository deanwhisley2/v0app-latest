#!/usr/bin/env bash
# Permanently remove Nexus Pro from the LEGACY VPS (default: vpsuser@67.159.52.40).
# Does NOT touch the current production host (173.214.164.179).
#
# Usage:
#   CONFIRM_DESTROY=YES bash scripts/vps-decommission-old-server.sh
#
# Env:
#   OLD_HOST=67.159.52.40   OLD_USER=vpsuser
#   PRODUCTION_HOST=173.214.164.179  (refused as OLD_HOST)
set -euo pipefail

OLD_HOST="${OLD_HOST:-67.159.52.40}"
OLD_USER="${OLD_USER:-vpsuser}"
PRODUCTION_HOST="${PRODUCTION_HOST:-173.214.164.179}"

if [[ "${CONFIRM_DESTROY:-}" != "YES" ]]; then
  echo "ERROR: Set CONFIRM_DESTROY=YES to wipe ${OLD_USER}@${OLD_HOST}"
  exit 1
fi

if [[ "${OLD_HOST}" == "${PRODUCTION_HOST}" ]]; then
  echo "ERROR: OLD_HOST matches production — aborting."
  exit 1
fi

SSH=(ssh -o BatchMode=yes "${OLD_USER}@${OLD_HOST}")

echo "==> DECOMMISSION legacy VPS ${OLD_USER}@${OLD_HOST}"
echo "    Production ${PRODUCTION_HOST} will NOT be modified."

"${SSH[@]}" bash -s <<'REMOTE'
set -euo pipefail
APP=/opt/nexus-pro
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG=/tmp/nexus-decommission-${STAMP}.log
exec > >(tee -a "$LOG") 2>&1

echo "==> stop PM2"
pm2 kill 2>/dev/null || true
pm2 delete all 2>/dev/null || true
rm -rf ~/.pm2
sudo -n env PATH="$PATH" pm2 unstartup systemd 2>/dev/null || true

echo "==> stop CompreFace + volumes"
if [[ -f "$APP/docker-compose.compreface.yml" ]]; then
  cd "$APP"
  sudo -n docker compose -f docker-compose.compreface.yml down -v --remove-orphans 2>/dev/null || true
fi
sudo -n docker ps -aq --filter name=nexus-pro 2>/dev/null | xargs -r sudo docker rm -f 2>/dev/null || true
sudo -n docker volume ls -q --filter name=nexus-pro 2>/dev/null | xargs -r sudo docker volume rm 2>/dev/null || true

echo "==> remove app tree (secrets included)"
if [[ -f "$APP/.env.local" ]]; then
  shred -u "$APP/.env.local" 2>/dev/null || rm -f "$APP/.env.local"
fi
sudo -n rm -rf "$APP"
sudo -n rm -rf /tmp/nexus-deploy.tgz /tmp/compreface-pg.tgz 2>/dev/null || true

echo "==> nginx: remove nexus site"
sudo -n rm -f /etc/nginx/sites-enabled/nexus-pro /etc/nginx/sites-available/nexus-pro 2>/dev/null || true
sudo -n nginx -t
sudo -n systemctl reload nginx 2>/dev/null || sudo -n systemctl stop nginx 2>/dev/null || true

echo "==> crontab: strip nexus lines"
if crontab -l 2>/dev/null | grep -q nexus; then
  crontab -l 2>/dev/null | grep -vi nexus | grep -vi compreface | crontab - 2>/dev/null || true
fi

echo "==> verify removal"
test ! -d "$APP" && echo "OK: $APP gone"
test ! -f /etc/nginx/sites-enabled/nexus-pro && echo "OK: nginx site gone"
pm2 list 2>/dev/null || echo "OK: pm2 empty"
sudo -n docker ps -a 2>/dev/null | grep -i nexus && echo "WARN: docker nexus containers remain" || echo "OK: no nexus docker"
echo "==> decommission log: $LOG"
REMOTE

echo "==> legacy VPS wiped. Update DNS if anything still points at ${OLD_HOST}."
echo "==> Remove ${OLD_HOST} from ~/.ssh/known_hosts if desired: ssh-keygen -R ${OLD_HOST}"
