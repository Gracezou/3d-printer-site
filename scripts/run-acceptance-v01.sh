#!/bin/sh
set -eu

if [ "${ALLOW_REMOTE_TEST_DATABASE+x}" = x ]; then
  printf '%s\n' '验收入口禁止远程放行：请取消设置 ALLOW_REMOTE_TEST_DATABASE' >&2
  exit 1
fi

pnpm exec tsx scripts/assert-local-test-database.ts

run() {
  printf '\n==> %s\n' "$1"
  pnpm "$1"
}

run test:availability
run test:inventory
run test:cron
run test:payments
run test:order-create
run test:order-concurrency
run test:pricing
run test:order-preview
run test:customer-orders
run test:admin-orders
run test:production
run test:admin-access
run test:model-requests
run test:devices

printf '\nAll acceptance checks passed.\n'
