#!/usr/bin/env bash
# Full production stack audit: Brevo SMTP → Supabase → app → cron → CompreFace → deploy path.
# Exit 0 only if all required checks pass.
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-173.214.164.179}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/nexus-pro}"
APP_URL="${APP_URL:-https://nexuspro.it.com}"
SSH=(ssh -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")

fail=0
pass() { echo "PASS $*"; }
fail_msg() { echo "FAIL $*"; fail=1; }

echo "==> audit ${APP_URL} @ ${REMOTE_HOST}"

# --- Public HTTP ---
for path in /api/health /api/health/supabase /api/health/launch /auth/login /dashboard; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "${APP_URL}${path}" || echo 000)
  if [[ "$code" =~ ^(200|307|308)$ ]]; then pass "HTTP $path $code"
  else fail_msg "HTTP $path $code"; fi
done

launch=$(curl -sS --max-time 20 "${APP_URL}/api/health/launch" || echo '{}')
echo "$launch" | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d.get('checks',{})
o=d.get('optional_services',{})
for k in ('next_public_supabase_url','supabase_service_role_configured','next_public_supabase_anon_configured','database_ping'):
    print('PASS launch.'+k if c.get(k) else 'FAIL launch.'+k)
for k in ('brevo_smtp_configured','transactional_email_configured','next_public_site_url'):
    print('PASS optional.'+k if o.get(k) else 'FAIL optional.'+k)
" | while read -r line; do
  [[ "$line" == PASS* ]] && pass "${line#PASS }" || fail_msg "${line#FAIL }"
done

# --- Remote server ---
"${SSH[@]}" bash -s <<REMOTE || fail=1
set -euo pipefail
APP="${REMOTE_APP_DIR}"
ENV="\$APP/.env.local"
fail=0

check() { if eval "\$2"; then echo "PASS \$1"; else echo "FAIL \$1"; fail=1; fi; }

check "app_dir" "[[ -f \$APP/.env.local && -f \$APP/.deploy-revision ]]"
check "pm2_nexus" "pm2 describe nexus 2>/dev/null | grep -q online"
check "pm2_cwd" "pm2 describe nexus 2>/dev/null | grep -q '${REMOTE_APP_DIR}'"
check "no_dev_local" "! grep -q '^NEXT_PUBLIC_DEV_LOCAL_ONLY=' \$ENV 2>/dev/null"
check "cron_installed" "crontab -l 2>/dev/null | grep -q verify-crypto-deposits-cron"
check "no_hostile_deploy_cron" "! crontab -l 2>/dev/null | grep -v '^#' | grep -q '/var/www/deploy.sh'"
check "nginx_ssl" "test -f /etc/letsencrypt/live/nexuspro.it.com/fullchain.pem"
check "compreface_containers" "docker ps --format '{{.Names}}' 2>/dev/null | grep -q compreface-api"
check "compreface_env" "grep -q '^COMPRE_FACE_API_URL=' \$ENV"
docker ps --format '{{.Names}}' 2>/dev/null | grep -q compreface-core && echo "PASS compreface_core" || { echo "FAIL compreface_core"; fail=1; }
KEY=\$(grep '^COMPRE_FACE_API_KEY=' "\$ENV" | tail -1 | cut -d= -f2-)
cf_code=\$(curl -sS -o /dev/null -w "%{http_code}" -m 15 "http://127.0.0.1:8000/api/v1/recognition/faces" -H "x-api-key: \$KEY" || echo 000)
check "compreface_http" "[[ \"\$cf_code\" == 200 ]]"

SECRET=\$(grep '^CRON_SECRET=' "\$ENV" | tail -1 | cut -d= -f2-)
for path in verify-crypto-deposits treasury-reconcile process-fixed-trade-maturity settle-expired-copy-trades; do
  code=\$(curl -sS -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:3000/api/cron/\$path" \\
    -H "x-cron-secret: \$SECRET" -H "Content-Type: application/json" --max-time 120 || echo 000)
  check "cron_\$path" "[[ \"\$code\" == 200 ]]"
done

BREVO_USER=\$(grep -E '^(BREVO_SMTP_USER|SMTP_USER)=' "\$ENV" | tail -1 | cut -d= -f2-)
BREVO_PASS=\$(grep -E '^(BREVO_SMTP_PASSWORD|SMTP_PASSWORD)=' "\$ENV" | tail -1 | cut -d= -f2-)
check "brevo_smtp_user_set" "[[ -n \"\$BREVO_USER\" ]]"
check "brevo_smtp_password_set" "[[ -n \"\$BREVO_PASS\" ]]"
launch_brevo=\$(curl -sS --max-time 15 "http://127.0.0.1:3000/api/health/launch" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('1' if d.get('optional_services',{}).get('brevo_smtp_configured') else '0')" 2>/dev/null || echo 0)
check "brevo_smtp_launch_flag" "[[ \"\$launch_brevo\" == 1 ]]"

exit \$fail
REMOTE

if [[ "$fail" -eq 0 ]]; then
  echo "==> ALL PASS"
else
  echo "==> AUDIT HAD FAILURES"
  exit 1
fi
