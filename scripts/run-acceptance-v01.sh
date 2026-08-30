#!/bin/sh
set -eu

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

printf '\nAll v0.1 acceptance checks passed.\n'
