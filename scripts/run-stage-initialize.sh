#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

runtime_env='.env.stage'
if [[ ! -f "$runtime_env" ]]; then
  if [[ -f '.env.stage ' ]]; then
    runtime_env='.env.stage '
    printf '%s\n' '提示：检测到 stage 配置文件名末尾有空格；本次按精确文件名读取，请尽快由配置所有者修正。' >&2
  else
    printf '%s\n' '未找到 stage 运行配置；未执行数据库操作。' >&2
    exit 1
  fi
fi

action="${1:-}"
if [[ -z "$action" ]]; then
  printf '%s\n' 'Usage: scripts/run-stage-initialize.sh <preflight|migrate|seed|verify>' >&2
  exit 1
fi
shift

exec ./node_modules/.bin/dotenv -e "$runtime_env" --override --no-expand -- \
  ./node_modules/.bin/tsx scripts/stage-initialize.ts "$action" \
  --runtime-env="$runtime_env" "$@"
