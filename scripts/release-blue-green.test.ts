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
  `blue-green-release-test-${process.pid}`,
);
const fakeBin = path.join(fixtureRoot, 'bin');
const releaseScript = path.join(repoRoot, 'deploy', 'release.sh');
const previousImage =
  'ghcr.io/example/printer:stage-sha-1111111111111111111111111111111111111111';
const candidateImage =
  'ghcr.io/example/printer:stage-sha-2222222222222222222222222222222222222222';

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content, { mode: 0o755 });
  chmodSync(filePath, 0o755);
}

describe('release blue-green rollback', () => {
  beforeAll(() => {
    mkdirSync(fakeBin, { recursive: true });
    writeExecutable(
      path.join(fakeBin, 'docker'),
      `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ "\${1:-}" == "inspect" ]]; then
  exit 43
fi
if [[ " $* " == *" ps -q web "* ]]; then
  printf 'fake-container\n'
fi
if [[ " $* " == *" logs --tail "* ]]; then
  printf 'fake diagnostic\n' >&2
fi
exit 0
`,
    );
    writeExecutable(path.join(fakeBin, 'curl'), '#!/usr/bin/env bash\nexit 0\n');
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('runs rollback only once when docker inspect fails in a subshell', () => {
    const deployDir = path.join(fixtureRoot, 'inspect-fail');
    const upstreamFile = path.join(deployDir, 'upstream.conf');
    const dockerLog = path.join(deployDir, 'docker.log');
    mkdirSync(deployDir, { recursive: true });
    writeFileSync(path.join(deployDir, 'compose.yaml'), 'services: {}\n');
    writeFileSync(path.join(deployDir, '.env'), 'APP_ENV=staging\n');
    writeFileSync(upstreamFile, 'upstream existing {}\n');
    writeFileSync(
      path.join(deployDir, '.active-release'),
      `ACTIVE_IMAGE=${previousImage}\nACTIVE_SLOT=blue\nACTIVE_PORT=3000\n`,
    );

    const result = spawnSync(releaseScript, [candidateImage], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:/usr/bin:/bin`,
        DEPLOY_DIR: deployDir,
        NGINX_UPSTREAM_FILE: upstreamFile,
        FAKE_DOCKER_LOG: dockerLog,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr.match(/Release failed;/gu)).toHaveLength(1);
    const log = readFileSync(dockerLog, 'utf8');
    expect(log.match(/down --remove-orphans/gu)).toHaveLength(1);
    expect(readFileSync(path.join(deployDir, '.active-release'), 'utf8')).toContain(
      `ACTIVE_IMAGE=${previousImage}`,
    );
  });
});
