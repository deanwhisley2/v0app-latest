#!/usr/bin/env bash
# When the repo is `supabase link`ed, compares local migration history vs remote.
# Without linkage, prints instructions and exits 2 (unknown parity).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

echo "==> Supabase migration parity (CLI)"

if [[ ! -f "${ROOT}/.supabase/project-ref" ]]; then
  echo "WARN: No .supabase/project-ref — project not linked in this clone."
  echo "      Run from a trusted machine:"
  echo "        cd ${ROOT}"
  echo "        npx supabase login"
  echo "        npx supabase link --project-ref <YOUR_PROJECT_REF>"
  echo "      Then re-run: bash scripts/check-supabase-parity.sh"
  exit 2
fi

echo "    Project ref: $(cat "${ROOT}/.supabase/project-ref")"
exec npx supabase migration list
