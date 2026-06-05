#!/usr/bin/env bash
# Deploy: optional copy .env.local from laptop → server, then on server: pull, build, PM2 (ecosystem.config.js).
set -euo pipefail

# Default: repository root (this file lives in scripts/). Override for nonstandard layouts.
_DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_ROOT="$(cd "${_DEPLOY_SCRIPT_DIR}/.." && pwd)"
APP_DIR="${APP_DIR:-${_REPO_ROOT}}"
APP_NAME="${APP_NAME:-nexus}"
ECOSYSTEM="${ECOSYSTEM:-ecosystem.config.js}"

# Canonical production VPS: ssh root@173.214.164.179 — app directory /opt/nexus-pro
# (Ignore stale IPs in old notes; deploy archive script defaults match this host.)
#
# ---------------------------------------------------------------------------
# Run from your LAPTOP with DEPLOY_FROM_LOCAL=1 to copy .env.local and deploy.
# Example:
#   REMOTE_HOST=173.214.164.179 REMOTE_USER=root REMOTE_APP_DIR=/opt/nexus-pro DEPLOY_FROM_LOCAL=1 ./scripts/deploy.sh
# Optional: LOCAL_ENV_FILE=.env.local
# ---------------------------------------------------------------------------
if [[ "${DEPLOY_FROM_LOCAL:-0}" == "1" ]]; then
  : "${REMOTE_HOST:?Set REMOTE_HOST}"
  : "${REMOTE_APP_DIR:?Set REMOTE_APP_DIR (server path, e.g. /opt/nexus-pro)}"
  REMOTE_USER="${REMOTE_USER:-vpsuser}"
  LOCAL_ENV="${LOCAL_ENV_FILE:-.env.local}"
  if [[ ! -f "${LOCAL_ENV}" ]]; then
    echo "ERROR: ${LOCAL_ENV} not found (create it with Brevo SMTP + Supabase keys)."
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

# Default: compiler-authoritative build (tsc + Next typecheck). Set STRICT_BUILD=0 to bypass only in emergencies.
STRICT_BUILD="${STRICT_BUILD:-1}"

ENV_LOCAL="${APP_DIR}/.env.local"
if [[ ! -f "${ENV_LOCAL}" ]]; then
  echo "ERROR: ${ENV_LOCAL} not found."
  echo "Create it on the server, or from your laptop run:"
  echo "  REMOTE_HOST=your.host REMOTE_APP_DIR=${APP_DIR} DEPLOY_FROM_LOCAL=1 ./scripts/deploy.sh"
  exit 1
fi

# Do not `source` .env.local here — unquoted spaces/special characters break bash and abort deploy.
# Next.js loads `.env.local` from APP_DIR during `npm run build` / `next start` (see Next env docs).
if [[ ! -r "${ENV_LOCAL}" ]]; then
  echo "ERROR: ${ENV_LOCAL} not readable."
  exit 1
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  echo "==> Git pull (main)"
  git fetch --all --prune
  git checkout main
  git pull origin main
else
  echo "==> No .git in ${APP_DIR} — skipping git pull (use rsync/CI copy or clone with .git for pull-based deploy)."
fi

echo "==> Clean previous Next.js build"
rm -rf .next

if compgen -G "b_*" > /dev/null; then
  echo "==> Remove stale extracted bundles (b_*)"
  rm -rf b_*
fi

echo "==> Dependencies"
npm ci

echo "==> Build (production) STRICT_BUILD=${STRICT_BUILD}"
if [[ "${STRICT_BUILD}" == "1" ]]; then
  echo "==> STRICT_BUILD=1: enforcing full TypeScript validation during build"
  NODE_ENV=production NEXT_IGNORE_BUILD_TS=0 npm run verify:ci
else
  echo "==> WARNING: STRICT_BUILD=0 — Next may skip type validation (legacy fallback)."
  NODE_ENV=production npm run build
fi

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

echo "==> PM2: remove legacy duplicate that also binds :3000 (avoids nexus EADDRINUSE crash loop)"
pm2 delete nexus-pro 2>/dev/null || true

echo "==> PM2: restart ${APP_NAME} with ${ECOSYSTEM}"
pm2 delete "${APP_NAME}" 2>/dev/null || true
pm2 start "${ECOSYSTEM_PATH}"
pm2 save

echo "==> Post-deploy verification"
if [[ -f "${APP_DIR}/.deploy-revision" ]]; then
  echo "==> .deploy-revision: $(cat "${APP_DIR}/.deploy-revision")"
else
  echo "==> .deploy-revision: (missing — not deployed via git-archive?)"
fi
if ls "${APP_DIR}"/b_* >/dev/null 2>&1; then
  echo "ERROR: stale b_* directories still present after deploy hygiene."
  ls -la "${APP_DIR}"/b_* 2>/dev/null || true
  exit 1
fi
echo "==> OK: no stale b_* bundle directories"
pm2 describe "${APP_NAME}" >/dev/null && echo "==> PM2: ${APP_NAME} process present"

echo "==> Deploy complete."
