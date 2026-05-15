#!/usr/bin/env bash
set -euo pipefail

# Sanity checks before deploy — extend with vault-specific assertions.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d "$ROOT/supabase/migrations" ]]; then
  echo "Missing supabase/migrations"; exit 1
fi

MIG_CT="$(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' 2>/dev/null | wc -l)"
if [[ "$MIG_CT" -lt 1 ]]; then
  echo "No migration SQL files found"; exit 1
fi

if ! npm run typecheck > /tmp/nexus-typecheck.log 2>&1; then
  cat /tmp/nexus-typecheck.log
  echo "npm run typecheck failed"; exit 1
fi

echo "Treasury CI guardrails: OK (${MIG_CT} migrations, typecheck clean)."
