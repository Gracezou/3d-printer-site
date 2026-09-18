#!/bin/sh
set -eu

pnpm exec tsx scripts/assert-local-test-database.ts

printf '\n==> prepare repeatable local demo baseline\n'
pnpm demo:seed

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
