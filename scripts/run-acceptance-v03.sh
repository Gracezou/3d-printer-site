#!/bin/sh
set -eu

if [ "${ALLOW_REMOTE_TEST_DATABASE+x}" = x ]; then
  printf '%s\n' '验收入口禁止远程放行：请取消设置 ALLOW_REMOTE_TEST_DATABASE' >&2
  exit 1
fi

pnpm exec tsx scripts/assert-local-test-database.ts

credential_file=".local/acceptance-admin-credentials.$$"
trap 'rm -f "$credential_file"' EXIT HUP INT TERM

printf '\n==> seed required system roles and admin fixture\n'
pnpm exec tsx scripts/seed.ts --credential-file="$credential_file"

printf '\n==> prepare repeatable local demo baseline\n'
pnpm exec tsx scripts/demo-data.ts seed --credential-file="$credential_file"

printf '\n==> v0.1 acceptance baseline\n'
./scripts/run-acceptance-v01.sh

run() {
  printf '\n==> %s\n' "$1"
  pnpm "$1"
}

printf '\n==> v0.3 refund and after-sales acceptance\n'
run test:refunds
run test:refund-items
run test:return-requests

printf '\nAll v0.3 acceptance checks passed.\n'
