#!/usr/bin/env bash
# Build a tarball from the current Git tree (tracked files only), upload to VPS, extract, run deploy.sh.
# Canonical production target: root@173.214.164.179 → REMOTE_APP_DIR=/opt/nexus-pro (defaults below).
# Must be run from a machine that has this repo as a git clone (with .git).
#
# Usage (from anywhere):
#   bash scripts/deploy-vps-git-archive.sh
#
# Optional env:
#   REMOTE_HOST=173.214.164.179 REMOTE_USER=root REMOTE_APP_DIR=/opt/nexus-pro
#   STRICT_BUILD=1 (default) runs npm run verify:ci on the server; STRICT_BUILD=0 legacy fallback only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ ! -d .git ]]; then
  echo "ERROR: ${ROOT} is not a git clone (no .git)."
  echo "Run this from your dev machine where you cloned the repo, e.g.:"
  echo "  cd /path/to/v0app_latest && bash scripts/deploy-vps-git-archive.sh"
  exit 1
fi

REMOTE_HOST="${REMOTE_HOST:-173.214.164.179}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
LEGACY_DECOMMISSIONED_HOST="${LEGACY_DECOMMISSIONED_HOST:-67.159.52.40}"

if [[ "${REMOTE_HOST}" == "${LEGACY_DECOMMISSIONED_HOST}" ]]; then
  echo "ERROR: REMOTE_HOST=${LEGACY_DECOMMISSIONED_HOST} is the decommissioned legacy VPS."
  echo "Use production: REMOTE_HOST=173.214.164.179 REMOTE_USER=root"
  exit 1
fi

REF="${DEPLOY_REF:-HEAD}"
COMMIT="$(git rev-parse "${REF}^{commit}")"
ARCHIVE="$(mktemp /tmp/nexus-deploy-XXXXXX.tgz)"

cleanup() { rm -f "${ARCHIVE}"; }
trap cleanup EXIT

echo "==> deploy commit: ${COMMIT} (ref ${REF})"
echo "==> git archive ${REF} → ${ARCHIVE}"
git archive --format=tar.gz -o "${ARCHIVE}" "${REF}"

SIZE="$(wc -c < "${ARCHIVE}" | tr -d ' ')"
if [[ "${SIZE}" -lt 1000 ]]; then
  echo "ERROR: archive is tiny (${SIZE} bytes) — git archive failed or tree is empty."
  exit 1
fi
echo "==> archive size: ${SIZE} bytes"

echo "==> scp → ${REMOTE_USER}@${REMOTE_HOST}:/tmp/nexus-deploy.tgz"
scp "${ARCHIVE}" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/nexus-deploy.tgz"

echo "==> extract + deploy on VPS"
ssh "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<EOF
set -euo pipefail
cd "${REMOTE_APP_DIR}"
tar xzf /tmp/nexus-deploy.tgz
rm -f /tmp/nexus-deploy.tgz
# Runtime proof of which tree was extracted (VPS has no .git here).
printf '%s\\n' "${COMMIT}" > .deploy-revision
chmod +x scripts/deploy.sh
export STRICT_BUILD="${STRICT_BUILD:-1}"
exec bash scripts/deploy.sh
EOF

echo "==> done."
