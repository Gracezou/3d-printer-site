#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/3d-printer-site}"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install -d -m 0700 -o root -g root "$deploy_dir"
install -m 0600 -o root -g root "$source_dir/compose.yaml" "$deploy_dir/compose.yaml"
install -m 0700 -o root -g root "$source_dir/release.sh" "$deploy_dir/release.sh"

if [[ ! -e "$deploy_dir/.env" ]]; then
  install -m 0600 -o root -g root /dev/null "$deploy_dir/.env"
fi

ufw allow 5003/tcp comment '3d-printer-site temporary IP acceptance'

echo "Installed deployment files in $deploy_dir."
echo "Populate $deploy_dir/.env, then run $deploy_dir/release.sh with an immutable image tag."
