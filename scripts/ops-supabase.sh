#!/usr/bin/env bash
set -euo pipefail

# Supabase CLI helper for safe terminal workflow from Cursor/local shell.
# Requires: Supabase CLI on PATH, ~/.local/bin/supabase, or devDependency in this repo (see run_supabase).
#
# Optional env vars:
#   SUPABASE_PROJECT_REF=xxxxxxxxxxxx
#   SUPABASE_DB_PASSWORD=...
#
# Usage examples:
#   bash scripts/ops-supabase.sh status
#   bash scripts/ops-supabase.sh login
#   bash scripts/ops-supabase.sh link
#   bash scripts/ops-supabase.sh pull
#   bash scripts/ops-supabase.sh new add_profiles_column
#   bash scripts/ops-supabase.sh dry-run
#   bash scripts/ops-supabase.sh push

cmd="${1:-status}"
arg="${2:-}"

require_project_ref() {
  if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
    echo "Set SUPABASE_PROJECT_REF first (export SUPABASE_PROJECT_REF=...)."
    exit 1
  fi
}

run_supabase() {
  local script_dir root_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root_dir="$(cd "${script_dir}/.." && pwd)"
  # Prefer pinned CLI from this repo when present.
  if [[ -x "${root_dir}/node_modules/.bin/supabase" ]]; then
    "${root_dir}/node_modules/.bin/supabase" "$@"
    return
  fi
  if command -v supabase >/dev/null 2>&1; then
    supabase "$@"
    return
  fi
  if command -v npx >/dev/null 2>&1 && [[ -f "${root_dir}/package.json" ]]; then
    (cd "${root_dir}" && npx --no-install supabase "$@")
    return
  fi
  if [[ -x "$HOME/.local/bin/supabase" ]]; then
    "$HOME/.local/bin/supabase" "$@"
    return
  fi
  echo "Supabase CLI not found."
  echo "From the repo root run: npm install (installs devDependency supabase)."
  echo "Or install globally / into ~/.local/bin with the official binary and retry:"
  echo "  ARCH=\$(uname -m)"
  echo "  case \"\$ARCH\" in x86_64) ASSET=supabase_linux_amd64.tar.gz ;; aarch64|arm64) ASSET=supabase_linux_arm64.tar.gz ;; *) exit 1 ;; esac"
  echo "  URL=\$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | python3 -c \"import sys,json; d=json.load(sys.stdin); print(next(a['browser_download_url'] for a in d['assets'] if a['name']==\\\"'\$ASSET'\\\"))\")"
  echo "  mkdir -p \$HOME/.local/bin && curl -fL \"\$URL\" -o /tmp/supabase_cli.tar.gz && tar -xzf /tmp/supabase_cli.tar.gz -C \$HOME/.local/bin supabase && chmod +x \$HOME/.local/bin/supabase"
  exit 1
}

case "$cmd" in
  status)
    echo "=== Supabase CLI version ==="
    run_supabase --version
    echo
    echo "=== Linked project (if any) ==="
    run_supabase status || true
    ;;

  login)
    echo "Starting Supabase login flow..."
    run_supabase login
    ;;

  link)
    require_project_ref
    if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
      run_supabase link --project-ref "${SUPABASE_PROJECT_REF}" --password "${SUPABASE_DB_PASSWORD}"
    else
      run_supabase link --project-ref "${SUPABASE_PROJECT_REF}"
    fi
    ;;

  pull)
    echo "Pulling remote schema into local migration..."
    run_supabase db pull
    ;;

  new)
    if [[ -z "$arg" ]]; then
      echo "Usage: bash scripts/ops-supabase.sh new <migration_name>"
      exit 1
    fi
    run_supabase migration new "$arg"
    ;;

  reset)
    echo "Resetting local DB and replaying local migrations..."
    run_supabase db reset
    ;;

  dry-run)
    echo "Previewing remote migration changes..."
    run_supabase db push --dry-run
    ;;

  push)
    echo "Applying local migrations to linked remote..."
    run_supabase db push
    ;;

  schema-probe)
    # Lightweight REST check using .env.local keys (does not modify DB).
    if [[ ! -f ".env.local" ]]; then
      echo ".env.local missing in repo root."
      exit 1
    fi
    supa_url="$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- || true)"
    srk="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- || true)"
    if [[ -z "$supa_url" || -z "$srk" ]]; then
      echo "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local."
      exit 1
    fi
    curl -sS "$supa_url/rest/v1/profiles?select=id,nexus_exchange_balances_snapshot,operational_workspace&limit=1" \
      -H "apikey: $srk" \
      -H "Authorization: Bearer $srk"
    echo
    ;;

  *)
    echo "Unknown command: $cmd"
    echo "Valid: status | login | link | pull | new | reset | dry-run | push | schema-probe"
    exit 1
    ;;
esac
