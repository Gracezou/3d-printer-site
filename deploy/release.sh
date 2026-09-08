#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/3d-printer-site}"
compose_file="$deploy_dir/compose.yaml"
runtime_env="$deploy_dir/.env"
active_file="$deploy_dir/.active-release"
upstream_file="${NGINX_UPSTREAM_FILE:-/etc/nginx/conf.d/3d-printer-site-upstream.conf}"
new_image="${1:-}"

if [[ ! "$new_image" =~ ^ghcr\.io/[a-z0-9._/-]+:sha-[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 ghcr.io/owner/image:sha-<git-sha>" >&2
  exit 2
fi

for required_file in "$compose_file" "$runtime_env" "$upstream_file"; do
  if [[ ! -r "$required_file" ]]; then
    echo "Missing required file: $required_file" >&2
    exit 1
  fi
done

active_slot=""
active_port=""
active_image=""
if [[ -r "$active_file" ]]; then
  # shellcheck disable=SC1090
  source "$active_file"
  active_slot="${ACTIVE_SLOT:-}"
  active_port="${ACTIVE_PORT:-}"
  active_image="${ACTIVE_IMAGE:-}"
fi

if [[ "$active_slot" == "blue" ]]; then
  candidate_slot="green"
  candidate_port="3001"
else
  candidate_slot="blue"
  candidate_port="3000"
fi

candidate_project="3d-printer-site-$candidate_slot"
candidate_env="$(mktemp "$deploy_dir/.candidate.XXXXXX")"
upstream_backup="$(mktemp "$deploy_dir/.upstream.XXXXXX")"
upstream_changed="false"

cleanup() {
  rm -f "$candidate_env" "$upstream_backup"
}

write_candidate_env() {
  umask 077
  {
    printf 'APP_IMAGE=%s\n' "$new_image"
    printf 'APP_BIND_HOST=127.0.0.1\n'
    printf 'APP_BIND_PORT=%s\n' "$candidate_port"
  } >"$candidate_env"
}

stop_candidate() {
  docker compose \
    --project-name "$candidate_project" \
    --env-file "$candidate_env" \
    -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
}

show_candidate_logs() {
  docker compose \
    --project-name "$candidate_project" \
    --env-file "$candidate_env" \
    -f "$compose_file" logs --tail 80 web || true
}

restore_upstream() {
  if [[ "$upstream_changed" == "true" && -s "$upstream_backup" ]]; then
    install -m 0644 "$upstream_backup" "$upstream_file"
    nginx -t && systemctl reload nginx || true
  fi
}

on_error() {
  echo "Release failed; active release remains ${active_image:-unchanged}." >&2
  show_candidate_logs
  restore_upstream
  stop_candidate
}
trap on_error ERR
trap cleanup EXIT

write_candidate_env
cp "$upstream_file" "$upstream_backup"

docker compose \
  --project-name "$candidate_project" \
  --env-file "$candidate_env" \
  -f "$compose_file" pull web
docker compose \
  --project-name "$candidate_project" \
  --env-file "$candidate_env" \
  -f "$compose_file" up -d --no-build --remove-orphans web

container_id="$(docker compose \
  --project-name "$candidate_project" \
  --env-file "$candidate_env" \
  -f "$compose_file" ps -q web)"

health="starting"
for _ in {1..30}; do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  if [[ "$health" == "healthy" ]]; then
    curl --fail --silent --show-error --max-time 10 \
      "http://127.0.0.1:$candidate_port/api/health" >/dev/null
    break
  fi
  if [[ "$health" == "unhealthy" ]]; then
    echo "Candidate container became unhealthy." >&2
    false
  fi
  sleep 5
done

if [[ "$health" != "healthy" ]]; then
  echo "Timed out waiting for candidate health check." >&2
  false
fi

upstream_temp="$(mktemp "$deploy_dir/.nginx-upstream.XXXXXX")"
printf 'upstream printer_site_app {\n  server 127.0.0.1:%s;\n  keepalive 32;\n}\n' \
  "$candidate_port" >"$upstream_temp"
install -m 0644 "$upstream_temp" "$upstream_file"
upstream_changed="true"
rm -f "$upstream_temp"
nginx -t
systemctl reload nginx

umask 077
{
  printf 'ACTIVE_SLOT=%q\n' "$candidate_slot"
  printf 'ACTIVE_PORT=%q\n' "$candidate_port"
  printf 'ACTIVE_IMAGE=%q\n' "$new_image"
} >"$active_file"

if [[ -n "$active_slot" && "$active_slot" != "$candidate_slot" ]]; then
  old_project="3d-printer-site-$active_slot"
  old_env="$(mktemp "$deploy_dir/.previous.XXXXXX")"
  {
    printf 'APP_IMAGE=%s\n' "$active_image"
    printf 'APP_BIND_HOST=127.0.0.1\n'
    printf 'APP_BIND_PORT=%s\n' "$active_port"
  } >"$old_env"
  docker compose \
    --project-name "$old_project" \
    --env-file "$old_env" \
    -f "$compose_file" down --remove-orphans || \
    echo "Warning: old slot $active_slot could not be stopped." >&2
  rm -f "$old_env"
fi

trap - ERR
printf 'Released %s on slot %s (127.0.0.1:%s).\n' \
  "$new_image" "$candidate_slot" "$candidate_port"
