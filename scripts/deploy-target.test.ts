import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixtureDir = path.join(
  repoRoot,
  '.local',
  `deploy-target-test-${process.pid}`,
);
const scriptPath = path.join(repoRoot, 'scripts', 'deploy-target.sh');

function runDeploy(
  args: string[],
  configPath: string,
): { status: number | null; output: string } {
  const result = spawnSync(scriptPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_TARGET_CONFIG: path.relative(repoRoot, configPath),
      DEPLOY_TARGET_TEST_MODE: '1',
    },
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function writePrivateFile(filePath: string, content: string): void {
  writeFileSync(filePath, content, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

describe.sequential('deploy-target', () => {
  beforeAll(() => {
    mkdirSync(fixtureDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('rejects a missing target config', () => {
    const result = runDeploy(
      ['stage', '--dry-run'],
      path.join(fixtureDir, 'missing.env'),
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain('部署目标配置不存在');
  });

  it('rejects an empty target config', () => {
    const configPath = path.join(fixtureDir, 'empty.env');
    writePrivateFile(configPath, '');
    const result = runDeploy(['stage', '--dry-run'], configPath);
    expect(result.status).toBe(1);
    expect(result.output).toContain('部署目标配置为空');
  });

  it('rejects target config permissions wider than 0600', () => {
    const configPath = path.join(fixtureDir, 'wide.env');
    writeFileSync(configPath, 'TARGET_NAME=stage\n', { mode: 0o644 });
    chmodSync(configPath, 0o644);
    const result = runDeploy(['stage', '--dry-run'], configPath);
    expect(result.status).toBe(1);
    expect(result.output).toContain('权限必须为 0600');
  });

  it('rejects production before loading config without Grace approval', () => {
    const result = runDeploy(
      ['production', '--dry-run'],
      path.join(fixtureDir, 'missing-production.env'),
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain('--i-have-grace-approval');
    expect(result.output).not.toContain('部署目标配置不存在');
  });

  it('completes a fake stage dry-run without leaking sensitive values', () => {
    const runtimePath = path.join(fixtureDir, 'runtime.env');
    const configPath = path.join(fixtureDir, 'stage.env');
    const sensitive = {
      host: 'sensitive-stage-host.invalid',
      password: 'fake-password-MUST-NOT-LEAK',
      keyPath: '/sensitive/private/key/path',
      site: 'https://sensitive-stage-site.invalid',
      databaseHost: 'sensitive-db-host.invalid',
      imageRepo: 'ghcr.io/sensitive-owner/sensitive-image',
    };
    writePrivateFile(
      runtimePath,
      'DATABASE_URL=postgresql://user:secret@sensitive-db-host.invalid/db\n',
    );
    writePrivateFile(
      configPath,
      [
        'TARGET_NAME=stage',
        `SSH_HOST=${sensitive.host}`,
        'SSH_PORT=22',
        'SSH_USER=deploy',
        'SSH_AUTH=password',
        `SSH_KEY_PATH=${sensitive.keyPath}`,
        `SSH_PASSWORD=${sensitive.password}`,
        'DEPLOY_DIR=/opt/3d-printer-site',
        'RELEASE_MODE=blue-green',
        `SITE_URL=${sensitive.site}`,
        `HEALTH_URL=${sensitive.site}/api/health`,
        `IMAGE_REPO=${sensitive.imageRepo}`,
        `APP_RUNTIME_ENV_FILE=${path.relative(repoRoot, runtimePath)}`,
        `DB_MIGRATION_HOST_CONFIRM=${sensitive.databaseHost}`,
        '',
      ].join('\n'),
    );

    const result = runDeploy(['stage', '--dry-run'], configPath);
    expect(result.status).toBe(0);
    expect(result.output).toContain('Dry-run 完成');
    expect(result.output).toContain('SSH 主机：已配置（默认脱敏）');
    for (const value of Object.values(sensitive)) {
      expect(result.output).not.toContain(value);
    }
    expect(result.output).not.toContain('postgresql://');
  });
});
