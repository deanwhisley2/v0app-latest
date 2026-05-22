#!/usr/bin/env bash
# Sanitize /opt/nexus-pro/.env.local on production: dedupe keys, strip dev-only flags, rebuild.
# Run on laptop: bash scripts/vps-production-sanitize-env.sh
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-173.214.164.179}"
REMOTE_USER="${REMOTE_USER:-root}"
LEGACY_DECOMMISSIONED_HOST="${LEGACY_DECOMMISSIONED_HOST:-67.159.52.40}"
[[ "${REMOTE_HOST}" == "${LEGACY_DECOMMISSIONED_HOST}" ]] && {
  echo "ERROR: REMOTE_HOST is decommissioned legacy VPS ${LEGACY_DECOMMISSIONED_HOST}"; exit 1; }
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
SSH=(ssh -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")

echo "==> sanitize .env.local on ${REMOTE_HOST}"

"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
APP="${REMOTE_APP_DIR}"
ENV="\${APP}/.env.local"
BACKUP="\${ENV}.bak.\$(date +%Y%m%d%H%M%S)"
cp "\$ENV" "\$BACKUP"
echo "==> backup: \$BACKUP"

python3 <<'PY'
from pathlib import Path
import re

env_path = Path("${REMOTE_APP_DIR}/.env.local")
lines = env_path.read_text().splitlines()
order: list[str] = []
values: dict[str, str] = {}
comments: list[str] = []

for line in lines:
    s = line.strip()
    if not s or s.startswith("#"):
        comments.append(line)
        continue
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
    if not m:
        comments.append(line)
        continue
    key, val = m.group(1), m.group(2)
    if key not in order:
        order.append(key)
    values[key] = val

# Production must not ship dev bypass flags (NEXT_PUBLIC_* are baked at build time).
for dev_key in (
    "NEXT_PUBLIC_DEV_LOCAL_ONLY",
    "NEXT_PUBLIC_DEV_EXTRA_ORIGINS",
):
    if dev_key in values:
        del values[dev_key]
        order = [k for k in order if k != dev_key]
        print(f"removed {dev_key}")

out: list[str] = [
    "# Sanitized production .env.local — dev flags removed; duplicate keys collapsed (last wins).",
]
for key in order:
    out.append(f"{key}={values[key]}")
env_path.write_text("\n".join(out) + "\n")
print(f"keys: {len(order)}")
PY

chmod 600 "\$ENV"

echo "==> rebuild (NEXT_PUBLIC_* flags require new build)"
cd "\$APP"
NODE_ENV=production npm run build:strict
pm2 restart nexus
pm2 save
sleep 8
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "health OK"
REMOTE

echo "==> done"
