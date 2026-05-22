#!/usr/bin/env bash
# Fix CompreFace on production: API must be reached via compreface-fe nginx (port 8000), not the Java container directly.
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-173.214.164.179}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
SSH=(ssh -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")

echo "==> CompreFace fix on ${REMOTE_HOST}"

"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
APP="${REMOTE_APP_DIR}"
ENV="\${APP}/.env.local"
cd "\$APP"

# Point app at nginx proxy (official CompreFace entry), not compreface-api:8000 on the host.
if grep -q '^COMPRE_FACE_API_URL=' "\$ENV"; then
  sed -i 's|^COMPRE_FACE_API_URL=.*|COMPRE_FACE_API_URL=http://127.0.0.1:8000|' "\$ENV"
else
  echo 'COMPRE_FACE_API_URL=http://127.0.0.1:8000' >> "\$ENV"
fi
chmod 600 "\$ENV"

docker compose -f docker-compose.compreface.yml down 2>/dev/null || true
docker compose -f docker-compose.compreface.yml up -d

echo "==> wait for stack"
for i in \$(seq 1 30); do
  KEY=\$(grep '^COMPRE_FACE_API_KEY=' "\$ENV" | tail -1 | cut -d= -f2-)
  if curl -fsS -m 5 "http://127.0.0.1:8000/api/v1/recognition/faces" -H "x-api-key: \${KEY}" >/dev/null 2>&1; then
    echo "CompreFace API OK on :8000"
    break
  fi
  sleep 3
done

pm2 restart nexus
pm2 save
REMOTE

echo "==> done"
