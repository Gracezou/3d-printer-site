#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/3d-printer-site}"
compose_file="$deploy_dir/compose.yaml"
image_file="$deploy_dir/.image.env"
new_image="${1:-}"

if [[ ! "$new_image" =~ ^ghcr\.io/[a-z0-9._/-]+:sha-[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 ghcr.io/owner/image:sha-<git-sha>" >&2
  exit 2
fi

if [[ ! -r "$compose_file" || ! -r "$deploy_dir/.env" ]]; then
  echo "Missing $compose_file or $deploy_dir/.env" >&2
  exit 1
fi

old_image=""
if [[ -r "$image_file" ]]; then
  old_image="$(sed -n 's/^APP_IMAGE=//p' "$image_file")"
fi

write_image_file() {
  umask 077
  printf 'APP_IMAGE=%s\n' "$1" >"$image_file"
}

show_failure() {
  docker compose --env-file "$image_file" -f "$compose_file" logs --tail 80 web || true
}

rollback() {
  if [[ -z "$old_image" ]]; then
    echo "No previous image is available for rollback." >&2
    return
  fi

  echo "Rolling back to $old_image" >&2
  write_image_file "$old_image"
  docker compose --env-file "$image_file" -f "$compose_file" up -d --no-build web
}

trap 'show_failure; rollback' ERR

write_image_file "$new_image"
docker compose --env-file "$image_file" -f "$compose_file" pull web
docker compose --env-file "$image_file" -f "$compose_file" up -d --no-build --remove-orphans web

container_id="$(docker compose --env-file "$image_file" -f "$compose_file" ps -q web)"
for _ in {1..24}; do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  if [[ "$health" == "healthy" ]]; then
    curl --fail --silent --show-error --max-time 10 http://127.0.0.1:5003/api/health
    printf '\nReleased %s\n' "$new_image"
    trap - ERR
    exit 0
  fi
  if [[ "$health" == "unhealthy" ]]; then
    echo "Container became unhealthy." >&2
    exit 1
  fi
  sleep 5
done

echo "Timed out waiting for the container health check." >&2
exit 1
