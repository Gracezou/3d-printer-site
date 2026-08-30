#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "Security audit failed: $1" >&2
  exit 1
}

echo "[1/5] Checking tracked environment and key files"
tracked_sensitive="$({ git ls-files | rg '(^|/)(\.env($|\.)|.*\.(pem|key|p12|pfx)$)' || true; } | rg -v '(^|/)\.env\.example$' || true)"
if [[ -n "$tracked_sensitive" ]]; then
  echo "$tracked_sensitive" >&2
  fail "sensitive environment or key file is tracked"
fi

echo "[2/5] Scanning tracked application files for private credentials"
credential_hits="$(git grep -nE -- '-----BEGIN (RSA )?PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[^#[:space:]]|ALIPAY_PRIVATE_KEY[[:space:]]*=[[:space:]]*[^#[:space:]]' -- ':!docs/**' ':!.env.example' ':!scripts/security-audit.sh' || true)"
if [[ -n "$credential_hits" ]]; then
  echo "$credential_hits" >&2
  fail "possible private credential found"
fi

echo "[3/5] Checking production browser bundles"
if [[ ! -d .next/static ]]; then
  fail ".next/static is missing; run a production build before this audit"
fi
if rg -l 'SERVICE_ROLE|-----BEGIN (RSA )?PRIVATE KEY-----|ALIPAY_PRIVATE_KEY' .next/static >/dev/null; then
  fail "server-only credential name or private key found in browser bundle"
fi

echo "[4/5] Checking API body parsing and Supabase client boundaries"
if rg -n 'request\.json\(' src/app/api >/dev/null; then
  fail "API route bypasses the shared Zod JSON parser"
fi
unexpected_supabase_imports="$(rg -l "from ['\"]@supabase/" src | rg -v '^src/lib/(auth/supabase-server|storage)\.ts$' || true)"
if [[ -n "$unexpected_supabase_imports" ]]; then
  echo "$unexpected_supabase_imports" >&2
  fail "Supabase client imported outside approved server adapters"
fi

echo "[5/5] Auditing dependencies (high severity threshold)"
pnpm audit --audit-level high --registry https://registry.npmjs.org

echo "Security audit passed."
