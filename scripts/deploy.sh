#!/usr/bin/env bash
# Deploy: optional copy .env.local from laptop → server, then on server: pull, build, PM2 (ecosystem.config.js).
set -euo pipefail

# Default paths differ per host; production vpsuser box uses /opt/nexus-pro (see scripts/ops-circle.sh).
APP_DIR="${APP_DIR:-/var/www/nexus}"
APP_NAME="${APP_NAME:-nexus}"
ECOSYSTEM="${ECOSYSTEM:-ecosystem.config.js}"

# ---------------------------------------------------------------------------
# Run from your LAPTOP with DEPLOY_FROM_LOCAL=1 to copy .env.local and deploy.
# Example:
#   REMOTE_HOST=173.214.164.179 REMOTE_APP_DIR=/var/www/nexus DEPLOY_FROM_LOCAL=1 ./scripts/deploy.sh
# Optional: REMOTE_USER=root  LOCAL_ENV_FILE=.env.local
# ---------------------------------------------------------------------------
if [[ "${DEPLOY_FROM_LOCAL:-0}" == "1" ]]; then
  : "${REMOTE_HOST:?Set REMOTE_HOST}"
  : "${REMOTE_APP_DIR:?Set REMOTE_APP_DIR (server path, e.g. /var/www/nexus)}"
  REMOTE_USER="${REMOTE_USER:-root}"
  LOCAL_ENV="${LOCAL_ENV_FILE:-.env.local}"
  if [[ ! -f "${LOCAL_ENV}" ]]; then
    echo "ERROR: ${LOCAL_ENV} not found (create it with Brevo + Supabase keys)."
    exit 1
  fi
  echo "==> Copy ${LOCAL_ENV} → ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/.env.local"
  scp "${LOCAL_ENV}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/.env.local"
  echo "==> Run remote deploy"
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "cd ${REMOTE_APP_DIR} && chmod +x scripts/deploy.sh && ./scripts/deploy.sh"
  exit 0
fi

# ---------------------------------------------------------------------------
# Server-side deploy (run on VPS in APP_DIR, or via ssh above)
# ---------------------------------------------------------------------------
echo "==> Deploy ${APP_NAME} → ${APP_DIR}"
cd "${APP_DIR}"

ENV_LOCAL="${APP_DIR}/.env.local"
if [[ ! -f "${ENV_LOCAL}" ]]; then
  echo "ERROR: ${ENV_LOCAL} not found."
  echo "Create it on the server, or from your laptop run:"
  echo "  REMOTE_HOST=your.host REMOTE_APP_DIR=${APP_DIR} DEPLOY_FROM_LOCAL=1 ./scripts/deploy.sh"
  exit 1
fi

echo "==> Sourcing .env.local"
set -a
# shellcheck disable=SC1090
source "${ENV_LOCAL}"
set +a

echo "==> Git pull (main)"
git fetch --all --prune
git checkout main
git pull origin main

echo "==> Clean previous Next.js build"
rm -rf .next

echo "==> Dependencies"
npm ci

echo "==> Build (production)"
NODE_ENV=production npm run build

echo "==> Verify build output"
if [[ ! -f .next/server/middleware-manifest.json ]]; then
  echo "ERROR: .next/server/middleware-manifest.json missing — aborting PM2."
  exit 1
fi

ECOSYSTEM_PATH="${APP_DIR}/${ECOSYSTEM}"
if [[ ! -f "${ECOSYSTEM_PATH}" ]]; then
  echo "ERROR: ${ECOSYSTEM_PATH} not found."
  exit 1
fi

echo "==> PM2: restart ${APP_NAME} with ${ECOSYSTEM}"
pm2 delete "${APP_NAME}" 2>/dev/null || true
pm2 start "${ECOSYSTEM_PATH}"
pm2 save

echo "==> Deploy complete."
