#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexus-pro}"
APP_NAME="${APP_NAME:-nexus-pro}"

echo "Deploying ${APP_NAME} in ${APP_DIR}"
cd "${APP_DIR}"

echo "Fetching latest code..."
git fetch --all --prune
git checkout main
git pull origin main

echo "Installing dependencies..."
npm ci

echo "Building Next.js app..."
npm run build

echo "Restarting PM2 app..."
pm2 startOrReload ecosystem.config.cjs --only "${APP_NAME}" --update-env
pm2 save

echo "Deployment complete."
