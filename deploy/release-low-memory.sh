#!/usr/bin/env bash
set -Eeuo pipefail

deploy_dir="${DEPLOY_DIR:-/opt/3d-printer-site}"
compose_file="$deploy_dir/compose.yaml"
compose_override="$deploy_dir/compose.low-memory.yaml"
runtime_env="$deploy_dir/.env"
active_file="$deploy_dir/.active-release"
new_image="${1:-}"
health_url="${RELEASE_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
rollback_health_url="${RELEASE_ROLLBACK_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
health_attempts="${RELEASE_HEALTH_ATTEMPTS:-30}"
health_interval="${RELEASE_HEALTH_INTERVAL_SECONDS:-5}"
rollback_health_attempts="${RELEASE_ROLLBACK_HEALTH_ATTEMPTS:-30}"
rollback_health_interval="${RELEASE_ROLLBACK_HEALTH_INTERVAL_SECONDS:-5}"
project_name="3d-printer-site"

if [[ ! "$new_image" =~ ^ghcr\.io/[a-z0-9._/-]+:(stage-|production-)?sha-[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 ghcr.io/owner/image:[stage-|production-]sha-<git-sha>" >&2
  exit 2
fi

for probe_url in "$health_url" "$rollback_health_url"; do
  if [[ ! "$probe_url" =~ ^http://127\.0\.0\.1:3000/ ]]; then
    echo "Health URLs must use http://127.0.0.1:3000/." >&2
    exit 2
  fi
done

for attempts in "$health_attempts" "$rollback_health_attempts"; do
  if [[ ! "$attempts" =~ ^[1-9][0-9]*$ ]]; then
    echo "Health attempts must be positive integers." >&2
    exit 2
  fi
done
for interval in "$health_interval" "$rollback_health_interval"; do
  if [[ ! "$interval" =~ ^[0-9]+$ ]]; then
    echo "Health intervals must be non-negative integers." >&2
    exit 2
  fi
done

for required_file in "$compose_file" "$compose_override" "$runtime_env"; do
  if [[ ! -r "$required_file" ]]; then
    echo "Missing required file: $required_file" >&2
    exit 1
  fi
done

cd "$deploy_dir"

previous_image=""
if [[ -r "$active_file" ]]; then
  # shellcheck disable=SC1090
  source "$active_file"
  previous_image="${ACTIVE_IMAGE:-}"
fi

candidate_env="$(mktemp "$deploy_dir/.candidate.XXXXXX")"
previous_env="$(mktemp "$deploy_dir/.previous.XXXXXX")"
old_stopped="false"
rollback_started="false"

cleanup() {
  rm -f "$candidate_env" "$previous_env"
}

write_compose_env() {
  local target="$1"
  local image="$2"
  umask 077
  {
    printf 'APP_IMAGE=%s\n' "$image"
    printf 'APP_BIND_HOST=127.0.0.1\n'
    printf 'APP_BIND_PORT=3000\n'
  } >"$target"
}

compose_with_env() {
  local env_file="$1"
  shift
  docker compose \
    --project-name "$project_name" \
    --env-file "$env_file" \
    -f "$compose_file" \
    -f "$compose_override" \
    "$@"
}

wait_for_health() {
  local env_file="$1"
  local probe_url="$2"
  local attempts="$3"
  local interval="$4"
  local container_id=""
  local health="starting"

  container_id="$(compose_with_env "$env_file" ps -q web)"
  if [[ -z "$container_id" ]]; then
    echo "Application container was not created." >&2
    return 1
  fi

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
    if [[ "$health" == "healthy" ]] &&
      curl --fail --silent --show-error --max-time 10 "$probe_url" >/dev/null; then
      return 0
    fi
    if [[ "$health" == "unhealthy" ]]; then
      echo "Application container became unhealthy." >&2
      return 1
    fi
    sleep "$interval"
  done

  echo "Timed out waiting for application health check (last state: $health)." >&2
  return 1
}

write_active_release() {
  local image="$1"
  local previous="$2"
  umask 077
  {
    printf 'ACTIVE_MODE=stop-start\n'
    printf 'ACTIVE_SLOT=single\n'
    printf 'ACTIVE_PORT=3000\n'
    printf 'ACTIVE_IMAGE=%q\n' "$image"
    printf 'PREVIOUS_IMAGE=%q\n' "$previous"
  } >"$active_file"
}

rollback() {
  local original_status="$1"
  if [[ "$rollback_started" == "true" ]]; then
    return "$original_status"
  fi
  rollback_started="true"
  trap - ERR
  set +e

  echo "Release failed for $new_image." >&2
  compose_with_env "$candidate_env" logs --tail 80 web >&2

  if [[ "$old_stopped" == "true" && -n "$previous_image" ]]; then
    echo "Restoring previous image $previous_image." >&2
    compose_with_env "$candidate_env" down --remove-orphans >/dev/null 2>&1
    write_compose_env "$previous_env" "$previous_image"
    compose_with_env "$previous_env" up -d --no-build --remove-orphans web
    if wait_for_health \
      "$previous_env" \
      "$rollback_health_url" \
      "$rollback_health_attempts" \
      "$rollback_health_interval"; then
      write_active_release "$previous_image" ""
      echo "Rollback completed." >&2
    else
      echo "CRITICAL: previous image did not recover." >&2
    fi
  elif [[ "$old_stopped" == "true" ]]; then
    compose_with_env "$candidate_env" down --remove-orphans >/dev/null 2>&1
    echo "No previous image was recorded; application remains stopped." >&2
  else
    echo "Previous application was not stopped." >&2
  fi

  return 0
}

on_error() {
  local original_status="$?"
  if (( BASH_SUBSHELL > 0 )); then
    exit "$original_status"
  fi
  trap - ERR
  rollback "$original_status"
  exit "$original_status"
}

trap on_error ERR
trap cleanup EXIT

write_compose_env "$candidate_env" "$new_image"

# Pull first: a registry/network failure must not interrupt the active service.
compose_with_env "$candidate_env" pull web

if [[ -n "$(compose_with_env "$candidate_env" ps -q web)" ]]; then
  old_stopped="true"
  compose_with_env "$candidate_env" down --remove-orphans
fi

old_stopped="true"
stopped_at="$(date +%s%3N)"
compose_with_env "$candidate_env" up -d --no-build --remove-orphans web
wait_for_health "$candidate_env" "$health_url" "$health_attempts" "$health_interval"
healthy_at="$(date +%s%3N)"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
fi

write_active_release "$new_image" "$previous_image"
trap - ERR

downtime_ms=$((healthy_at - stopped_at))
printf 'Released %s in stop-start mode on 127.0.0.1:3000 (health wait %s ms).\n' \
  "$new_image" "$downtime_ms"
