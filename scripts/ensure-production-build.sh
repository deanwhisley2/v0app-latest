#!/usr/bin/env bash
# Run on the VPS from the app root (e.g. cd /var/www/nexus).
# Fixes corrupted/incomplete .next output before pm2 restart.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Cleaning old build"
rm -rf .next

echo "==> Installing deps (clean)"
npm ci

echo "==> Building Next.js"
NODE_ENV=production npm run build

echo "==> Verifying critical artifacts"
test -f .next/server/middleware-manifest.json || {
  echo "ERROR: middleware-manifest.json missing — build failed or wrong Next.js cwd."
  exit 1
}
test -d .next/server/app/auth/verify || {
  echo "WARN: app route chunk dir missing — check App Router paths."
}

echo "==> OK. Restart app (example): pm2 restart nexus"
