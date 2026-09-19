#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "Security audit failed: $1" >&2
  exit 1
}

echo "[1/5] Checking tracked environment and key files"
tracked_files="$(git ls-files)" || fail "unable to enumerate tracked files"
tracked_sensitive=""
while IFS= read -r tracked_file; do
  if [[ "$tracked_file" =~ (^|/)\.env($|\.) || "$tracked_file" =~ \.(pem|key|p12|pfx)$ ]]; then
    if [[ "$tracked_file" =~ (^|/)\.env(\.[^/]*)?\.example$ ]]; then
      continue
    fi
    tracked_sensitive+="${tracked_sensitive:+$'\n'}$tracked_file"
  fi
done <<<"$tracked_files"
if [[ -n "$tracked_sensitive" ]]; then
  echo "$tracked_sensitive" >&2
  fail "sensitive environment or key file is tracked"
fi

echo "[2/5] Scanning tracked application files for private credentials"
if credential_hits="$(git grep -lE -- '-----BEGIN (RSA )?PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[^#[:space:]]|ALIPAY_PRIVATE_KEY[[:space:]]*=[[:space:]]*[^#[:space:]]' -- ':!docs/**' ':!.env.example' ':!scripts/security-audit.sh' 2>/dev/null)"; then
  echo "$credential_hits" >&2
  fail "possible private credential found"
else
  search_status=$?
  if [[ "$search_status" -ne 1 ]]; then
    fail "tracked credential scan command failed"
  fi
fi

echo "[3/5] Checking production browser bundles"
if [[ ! -d .next/static ]]; then
  fail ".next/static is missing; run a production build before this audit"
fi
if bundle_hits="$(grep -R -l -E 'SERVICE_ROLE|-----BEGIN (RSA )?PRIVATE KEY-----|ALIPAY_PRIVATE_KEY' .next/static 2>/dev/null)"; then
  echo "$bundle_hits" >&2
  fail "server-only credential name or private key found in browser bundle"
else
  search_status=$?
  if [[ "$search_status" -ne 1 ]]; then
    fail "browser bundle scan command failed"
  fi
fi

echo "[4/5] Checking API body parsing and Supabase client boundaries"
if api_body_hits="$(grep -R -l -E 'request\.json\(' src/app/api 2>/dev/null)"; then
  echo "$api_body_hits" >&2
  fail "API route bypasses the shared Zod JSON parser"
else
  search_status=$?
  if [[ "$search_status" -ne 1 ]]; then
    fail "API body parser scan command failed"
  fi
fi
supabase_imports=""
if supabase_imports="$(grep -R -l -E "from ['\"]@supabase/" src 2>/dev/null)"; then
  :
else
  search_status=$?
  if [[ "$search_status" -ne 1 ]]; then
    fail "Supabase import boundary scan command failed"
  fi
fi
unexpected_supabase_imports=""
while IFS= read -r import_path; do
  [[ -z "$import_path" ]] && continue
  case "$import_path" in
    src/lib/auth/supabase-server.ts | src/lib/storage.ts) ;;
    *)
      unexpected_supabase_imports+="${unexpected_supabase_imports:+$'\n'}$import_path"
      ;;
  esac
done <<<"$supabase_imports"
if [[ -n "$unexpected_supabase_imports" ]]; then
  echo "$unexpected_supabase_imports" >&2
  fail "Supabase client imported outside approved server adapters"
fi

echo "[5/5] Auditing dependencies (high severity threshold)"
pnpm audit --audit-level high --registry https://registry.npmjs.org

echo "Security audit passed."
