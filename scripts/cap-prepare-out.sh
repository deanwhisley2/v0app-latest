#!/usr/bin/env bash
# Copy PWA shell assets into out/ before `npx cap sync android`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

mkdir -p out
cp -f public/manifest.webmanifest public/manifest.json public/sw.js out/ 2>/dev/null || true
mkdir -p out/brand/icons
cp -rf public/brand/icons/* out/brand/icons/ 2>/dev/null || true

echo "==> out/ ready for Capacitor sync ($(du -sh out | cut -f1))"
