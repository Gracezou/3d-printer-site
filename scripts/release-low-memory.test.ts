import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = path.join(
  repoRoot,
  '.local',
  `low-memory-release-test-${process.pid}`,
);
const fakeBin = path.join(fixtureRoot, 'bin');
const releaseScript = path.join(repoRoot, 'deploy', 'release-low-memory.sh');
const previousImage =
  'ghcr.io/example/printer:stage-sha-1111111111111111111111111111111111111111';
const candidateImage =
  'ghcr.io/example/printer:stage-sha-2222222222222222222222222222222222222222';

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content, { mode: 0o755 });
  chmodSync(filePath, 0o755);
}

function prepareCase(name: string): string {
  const deployDir = path.join(fixtureRoot, name);
  mkdirSync(deployDir, { recursive: true });
  writeFileSync(path.join(deployDir, 'compose.yaml'), 'services: {}\n');
  writeFileSync(path.join(deployDir, 'compose.low-memory.yaml'), 'services: {}\n');
  writeFileSync(path.join(deployDir, '.env'), 'APP_ENV=staging\n');
  writeFileSync(
    path.join(deployDir, '.active-release'),
    `ACTIVE_IMAGE=${previousImage}\nACTIVE_SLOT=single\nACTIVE_PORT=3000\n`,
  );
  return deployDir;
}

function runFailure(mode: 'up-fail' | 'health-fail', deployDir: string) {
  const logPath = path.join(deployDir, 'docker.log');
  const statePath = path.join(deployDir, 'container-state');
  return spawnSync(releaseScript, [candidateImage], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      DEPLOY_DIR: deployDir,
      FAKE_DOCKER_LOG: logPath,
      FAKE_DOCKER_MODE: mode,
      FAKE_DOCKER_STATE: statePath,
      RELEASE_HEALTH_ATTEMPTS: '1',
      RELEASE_HEALTH_INTERVAL_SECONDS: '0',
      RELEASE_ROLLBACK_HEALTH_ATTEMPTS: '1',
      RELEASE_ROLLBACK_HEALTH_INTERVAL_SECONDS: '0',
    },
  });
}

describe.sequential('release-low-memory rollback', () => {
  beforeAll(() => {
    mkdirSync(fakeBin, { recursive: true });
    writeExecutable(
      path.join(fakeBin, 'docker'),
      `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ "\${1:-}" == "inspect" ]]; then
  state="$(cat "$FAKE_DOCKER_STATE")"
  if [[ "$FAKE_DOCKER_MODE" == "health-fail" && "$state" == "new" ]]; then
    printf 'unhealthy\\n'
  else
    printf 'healthy\\n'
  fi
  exit 0
fi
env_file=""
previous=""
for argument in "$@"; do
  if [[ "$previous" == "--env-file" ]]; then env_file="$argument"; fi
  previous="$argument"
done
if [[ " $* " == *" ps -q web "* ]]; then
  printf 'fake-container\\n'
  exit 0
fi
if [[ " $* " == *" up -d "* ]]; then
  image="$(awk -F= '$1 == "APP_IMAGE" { print $2 }' "$env_file")"
  if [[ "$image" == *"2222222222222222222222222222222222222222"* ]]; then
    printf 'new\\n' >"$FAKE_DOCKER_STATE"
    if [[ "$FAKE_DOCKER_MODE" == "up-fail" ]]; then exit 42; fi
  else
    printf 'old\\n' >"$FAKE_DOCKER_STATE"
  fi
fi
if [[ " $* " == *" logs --tail "* ]]; then
  printf 'fake diagnostic\\n' >&2
fi
exit 0
`,
    );
    writeExecutable(
      path.join(fakeBin, 'curl'),
      '#!/usr/bin/env bash\nexit 0\n',
    );
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('restores the previous image when candidate startup fails', () => {
    const deployDir = prepareCase('up-fail');
    const result = runFailure('up-fail', deployDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Rollback completed.');
    const dockerLog = readFileSync(path.join(deployDir, 'docker.log'), 'utf8');
    expect(dockerLog).toContain('down --remove-orphans');
    expect(dockerLog).toContain('up -d --no-build --remove-orphans web');
    expect(readFileSync(path.join(deployDir, '.active-release'), 'utf8')).toContain(
      `ACTIVE_IMAGE=${previousImage}`,
    );
  });

  it('restores the previous image when candidate health check fails', () => {
    const deployDir = prepareCase('health-fail');
    const result = runFailure('health-fail', deployDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Application container became unhealthy.');
    expect(result.stderr).toContain('Rollback completed.');
    expect(readFileSync(path.join(deployDir, 'container-state'), 'utf8')).toBe(
      'old\n',
    );
    expect(readFileSync(path.join(deployDir, '.active-release'), 'utf8')).toContain(
      `ACTIVE_IMAGE=${previousImage}`,
    );
  });
});
