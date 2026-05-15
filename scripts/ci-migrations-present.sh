#!/usr/bin/env bash
set -euo pipefail
# Fast CI guardrail: migrations directory must exist and contain at least one SQL file.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d "$ROOT/supabase/migrations" ]]; then
  echo "Missing supabase/migrations"
  exit 1
fi

MIG_CT="$(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' -type f 2>/dev/null | wc -l)"
if [[ "$MIG_CT" -lt 1 ]]; then
  echo "No migration SQL files found under supabase/migrations"
  exit 1
fi

echo "Migration presence check: OK (${MIG_CT} SQL files)."
