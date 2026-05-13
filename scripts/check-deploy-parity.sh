#!/usr/bin/env bash
# Verify local HEAD, origin/main, and VPS /opt/nexus-pro/.deploy-revision match (full SHA).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

REMOTE_HOST="${REMOTE_HOST:-67.159.52.40}"
REMOTE_USER="${REMOTE_USER:-vpsuser}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"

echo "==> Deploy parity (Git ↔ origin/main ↔ VPS .deploy-revision)"

git fetch origin --quiet 2>/dev/null || {
  echo "WARN: git fetch origin failed — parity uses local refs only."
}

LOCAL="$(git rev-parse HEAD)"
ORIGIN="$(git rev-parse origin/main 2>/dev/null || echo MISSING)"

echo "    Local HEAD:     ${LOCAL}"
echo "    origin/main:    ${ORIGIN}"

if [[ "${ORIGIN}" == "MISSING" ]]; then
  echo "ERROR: Cannot resolve origin/main (add remote or fetch)."
  exit 1
fi

if [[ "${LOCAL}" != "${ORIGIN}" ]]; then
  echo "ERROR: Local HEAD differs from origin/main (pull/push or checkout)."
  exit 1
fi

if ! VPS_REV="$(ssh -o BatchMode=yes -o ConnectTimeout=15 "${REMOTE_USER}@${REMOTE_HOST}" "cat ${REMOTE_APP_DIR}/.deploy-revision 2>/dev/null || echo MISSING")"; then
  echo "ERROR: SSH to ${REMOTE_USER}@${REMOTE_HOST} failed."
  exit 1
fi

echo "    VPS revision:   ${VPS_REV}"

if [[ "${VPS_REV}" == "MISSING" ]]; then
  echo "ERROR: ${REMOTE_APP_DIR}/.deploy-revision missing (never deployed via git-archive?)."
  exit 1
fi

if [[ "${VPS_REV}" != "${ORIGIN}" ]]; then
  echo "ERROR: VPS deployment revision does not match origin/main."
  echo "       Deploy: bash scripts/deploy-vps-git-archive.sh"
  exit 1
fi

echo "OK: deployment revisions aligned."
exit 0
