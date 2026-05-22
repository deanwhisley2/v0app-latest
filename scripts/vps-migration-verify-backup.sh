#!/usr/bin/env bash
# Verify a migration backup bundle before restore.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.vps-migration-backup/latest}"
BACKUP_DIR="$(cd "${BACKUP_DIR}" && pwd)"

fail=0
check() {
  if [[ -f "${BACKUP_DIR}/$1" ]] && [[ -s "${BACKUP_DIR}/$1" ]]; then
    echo "OK  $1"
  else
    echo "FAIL $1"
    fail=1
  fi
}

echo "==> verify backup: ${BACKUP_DIR}"
check app/.env.local
check nginx/nexus-pro.conf
check docker/compreface-postgres-data.tgz
if [[ -f "${BACKUP_DIR}/app/ecosystem.config.js" ]]; then
  check app/ecosystem.config.js
elif [[ -f "${BACKUP_DIR}/app/ecosystem.config.cjs" ]]; then
  check app/ecosystem.config.cjs
else
  echo "FAIL app/ecosystem.config.js|.cjs"
  fail=1
fi
check pm2/dump.pm2
check meta/SHA256SUMS.txt

if [[ -f "${BACKUP_DIR}/meta/SHA256SUMS.txt" ]]; then
  ( cd "${BACKUP_DIR}" && sha256sum -c meta/SHA256SUMS.txt >/dev/null 2>&1 ) && echo "OK  checksums" || { echo "FAIL checksums"; fail=1; }
fi

if [[ "${fail}" -eq 0 ]]; then
  echo "==> PASS — safe to restore"
  exit 0
fi
echo "==> FAIL — re-run: bash scripts/vps-migration-backup.sh"
exit 1
