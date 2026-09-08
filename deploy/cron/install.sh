#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/3d-printer-site}"
app_env_file="${APP_ENV_FILE:-$deploy_dir/.env}"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cron_env_file="/etc/default/3d-printer-site-cron"
cron_file="/etc/cron.d/3d-printer-site"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [[ ! -r "$app_env_file" ]]; then
  echo "Application environment file is not readable: $app_env_file" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$app_env_file"
}

app_base_url="$(read_env_value NEXT_PUBLIC_SITE_URL)"
cron_secret="$(read_env_value CRON_SECRET)"

if [[ ! "$app_base_url" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "NEXT_PUBLIC_SITE_URL must be an absolute HTTP(S) URL." >&2
  exit 1
fi
if [[ ${#cron_secret} -lt 32 || "$cron_secret" =~ [[:space:]] ]]; then
  echo "CRON_SECRET must contain at least 32 non-whitespace characters." >&2
  exit 1
fi

tmp_env="$(mktemp)"
tmp_cron="$(mktemp)"
trap 'rm -f "$tmp_env" "$tmp_cron"' EXIT
umask 077
printf 'APP_BASE_URL=%s\nCRON_SECRET=%s\n' "$app_base_url" "$cron_secret" > "$tmp_env"
sed "s|@DEPLOY_DIR@|$deploy_dir|g" "$source_dir/3d-printer-site.cron.example" > "$tmp_cron"

install -m 0700 -o root -g root "$source_dir/run-cron.sh" "$deploy_dir/run-cron.sh"
install -m 0600 -o root -g root "$tmp_env" "$cron_env_file"
install -m 0644 -o root -g root "$tmp_cron" "$cron_file"

systemctl enable --now cron
systemctl restart cron

echo "Installed 3d-printer-site cron jobs."
