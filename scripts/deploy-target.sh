#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"

if [[ -x "$repo_root/node_modules/.bin/tsx" ]]; then
  exec "$repo_root/node_modules/.bin/tsx" scripts/deploy-target.ts "$@"
fi

exec pnpm exec tsx scripts/deploy-target.ts "$@"
