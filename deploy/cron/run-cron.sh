#!/bin/sh
set -eu

cron_env_file="${CRON_ENV_FILE:-/etc/default/3d-printer-site-cron}"
if [ ! -r "$cron_env_file" ]; then
  echo "Cron environment file is not readable: $cron_env_file" >&2
  exit 1
fi

set -a
. "$cron_env_file"
set +a

: "${APP_BASE_URL:?APP_BASE_URL is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"

case "${1:-}" in
  release-expired|auto-complete|low-stock-alert) endpoint="$1" ;;
  *) echo "Unknown cron endpoint: ${1:-}" >&2; exit 2 ;;
esac

curl --fail --silent --show-error --max-time 55 \
  -H "Authorization: Bearer $CRON_SECRET" \
  "${APP_BASE_URL%/}/api/cron/$endpoint"
