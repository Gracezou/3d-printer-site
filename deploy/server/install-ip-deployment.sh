#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/3d-printer-site}"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

for command_name in docker nginx sshd ufw fail2ban-client; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "Refusing SSH hardening: verify a root public key first." >&2
  exit 1
fi

install -d -m 0700 -o root -g root "$deploy_dir"
install -m 0600 -o root -g root "$source_dir/compose.yaml" "$deploy_dir/compose.yaml"
install -m 0700 -o root -g root "$source_dir/release.sh" "$deploy_dir/release.sh"
install -m 0644 -o root -g root "$source_dir/server/nginx-site.conf" /etc/nginx/sites-available/3d-printer-site.conf
if [[ ! -e /etc/nginx/conf.d/3d-printer-site-upstream.conf ]]; then
  install -m 0644 -o root -g root "$source_dir/server/nginx-upstream.conf" /etc/nginx/conf.d/3d-printer-site-upstream.conf
fi
install -m 0644 -o root -g root "$source_dir/server/sshd-hardening.conf" /etc/ssh/sshd_config.d/00-3d-printer-site-hardening.conf
install -d -m 0755 /etc/systemd/journald.conf.d /etc/docker
install -m 0644 -o root -g root "$source_dir/server/kernel-hardening.conf" /etc/sysctl.d/99-3d-printer-site-hardening.conf
install -m 0644 -o root -g root "$source_dir/server/journald-limits.conf" /etc/systemd/journald.conf.d/99-3d-printer-site-limits.conf
install -m 0644 -o root -g root "$source_dir/server/apt-periodic.conf" /etc/apt/apt.conf.d/52-3d-printer-site-periodic
install -m 0644 -o root -g root "$source_dir/server/fail2ban-sshd.local" /etc/fail2ban/jail.d/3d-printer-site-sshd.local
install -m 0644 -o root -g root "$source_dir/server/docker-daemon.json" /etc/docker/daemon.json
ln -sfn /etc/nginx/sites-available/3d-printer-site.conf /etc/nginx/sites-enabled/3d-printer-site.conf
rm -f /etc/nginx/sites-enabled/default

if [[ ! -e "$deploy_dir/.env" ]]; then
  install -m 0600 -o root -g root /dev/null "$deploy_dir/.env"
fi
chmod 0600 "$deploy_dir/.env"

sshd -t
dockerd --validate --config-file=/etc/docker/daemon.json
sysctl --system >/dev/null

systemctl daemon-reload
systemctl enable --now docker nginx fail2ban unattended-upgrades certbot.timer
systemctl restart systemd-journald docker fail2ban
systemctl disable --now ModemManager thermald udisks2 wpa_supplicant apport kdump-tools >/dev/null 2>&1 || true
systemctl mask --now multipathd.service multipathd.socket >/dev/null 2>&1 || true

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 5003/tcp comment '3d-printer-site temporary IP acceptance'
ufw --force enable

nginx -t
systemctl reload ssh

echo "Installed deployment files in $deploy_dir."
echo "Populate $deploy_dir/.env, then run $deploy_dir/release.sh with an immutable image tag."
