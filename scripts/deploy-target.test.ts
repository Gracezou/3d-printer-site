import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertRemoteDatabaseIdentity,
  databaseIdentityFromUrl,
  databaseIdentityHash,
  hasNearbyRuntimeFilename,
  parseArgs,
  redactRemoteDiagnostic,
} from './deploy-target';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixtureDir = path.join(
  repoRoot,
  '.local',
  `deploy-target-test-${process.pid}`,
);
const scanRoot = path.join(fixtureDir, 'other-environments');
const scriptPath = path.join(repoRoot, 'scripts', 'deploy-target.sh');
const stageDatabaseUrl =
  'postgresql://postgres.stage_ref:secret@region.pooler.supabase.com:6543/postgres';
const otherDatabaseUrl =
  'postgresql://postgres.other_ref:secret@region.pooler.supabase.com:6543/postgres';

function runDeploy(
  args: string[],
  configPath: string,
  runtimePath?: string,
): { status: number | null; output: string } {
  const result = spawnSync(scriptPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_TARGET_CONFIG: path.relative(repoRoot, configPath),
      DEPLOY_TARGET_TEST_MODE: '1',
      DEPLOY_RUNTIME_ENV_OVERRIDE: runtimePath
        ? path.relative(repoRoot, runtimePath)
        : undefined,
      DEPLOY_RUNTIME_SCAN_ROOT: path.relative(repoRoot, scanRoot),
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

function writeRuntime(
  fileName = '.env.stage',
  appEnvironment = 'staging',
  databaseUrl = stageDatabaseUrl,
): string {
  const runtimePath = path.join(fixtureDir, fileName);
  writePrivateFile(
    runtimePath,
    `APP_ENV=${appEnvironment}\nDATABASE_URL=${databaseUrl}\n`,
  );
  return runtimePath;
}

function writeTargetConfig(
  fileName: string,
  overrides: Partial<Record<string, string>> = {},
): string {
  const configPath = path.join(fixtureDir, fileName);
  const values: Record<string, string> = {
    TARGET_NAME: 'stage',
    SSH_HOST: 'sensitive-stage-host.invalid',
    SSH_PORT: '22',
    SSH_USER: 'deploy',
    SSH_AUTH: 'password',
    SSH_KEY_PATH: '/sensitive/private/key/path',
    SSH_PASSWORD: 'fake-password-MUST-NOT-LEAK',
    DEPLOY_DIR: '/opt/3d-printer-site',
    RELEASE_MODE: 'blue-green',
    SITE_URL: 'https://sensitive-stage-site.invalid',
    HEALTH_URL: 'https://sensitive-stage-site.invalid/api/health',
    IMAGE_REPO: 'ghcr.io/sensitive-owner/sensitive-image',
    APP_RUNTIME_ENV_FILE: '.env.stage',
    DB_IDENTITY: databaseIdentityFromUrl(stageDatabaseUrl),
    ...overrides,
  };
  writePrivateFile(
    configPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );
  return configPath;
}

describe.sequential('deploy-target', () => {
  beforeAll(() => {
    mkdirSync(scanRoot, { recursive: true });
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

  it('rejects a database identity mismatch without logging either identity', () => {
    const runtimePath = writeRuntime();
    const configuredIdentity = databaseIdentityFromUrl(otherDatabaseUrl);
    const configPath = writeTargetConfig('identity-mismatch.env', {
      DB_IDENTITY: configuredIdentity,
    });
    const result = runDeploy(['stage', '--dry-run'], configPath, runtimePath);
    expect(result.status).toBe(1);
    expect(result.output).toContain('数据库身份与 DB_IDENTITY 不一致');
    expect(result.output).not.toContain(configuredIdentity);
    expect(result.output).not.toContain('stage_ref');
  });

  it('rejects runtime config names outside the target whitelist', () => {
    const runtimePath = writeRuntime();
    const configPath = writeTargetConfig('wrong-runtime-name.env', {
      APP_RUNTIME_ENV_FILE: '.env.dev',
    });
    const result = runDeploy(['stage', '--dry-run'], configPath, runtimePath);
    expect(result.status).toBe(1);
    expect(result.output).toContain('只允许 .env.stage');
  });

  it('detects a runtime filename with accidental surrounding whitespace', () => {
    writePrivateFile(path.join(fixtureDir, '.env.stage '), 'placeholder=true\n');
    expect(hasNearbyRuntimeFilename(fixtureDir, '.env.stage')).toBe(true);
    rmSync(path.join(fixtureDir, '.env.stage '));
  });

  it('rejects APP_ENV that does not match the target', () => {
    const runtimePath = writeRuntime('.env.stage', 'production');
    const configPath = writeTargetConfig('wrong-app-env.env');
    const result = runDeploy(['stage', '--dry-run'], configPath, runtimePath);
    expect(result.status).toBe(1);
    expect(result.output).toContain('APP_ENV 必须为 staging');
  });

  it('rejects a shared stage database without explicit acceptance', () => {
    const runtimePath = writeRuntime();
    writePrivateFile(
      path.join(scanRoot, '.env.dev'),
      `DATABASE_URL=${stageDatabaseUrl}\n`,
    );
    const configPath = writeTargetConfig('shared-rejected.env');
    const result = runDeploy(['stage', '--dry-run'], configPath, runtimePath);
    expect(result.status).toBe(1);
    expect(result.output).toContain('数据库互斥检查 dev：相同');
    expect(result.output).toContain('--accept-shared-database=dev');
    expect(result.output).not.toContain('stage_ref');
    rmSync(path.join(scanRoot, '.env.dev'));
  });

  it('allows and records an explicitly accepted shared stage database', () => {
    const runtimePath = writeRuntime();
    writePrivateFile(
      path.join(scanRoot, '.env.dev'),
      `DATABASE_URL=${stageDatabaseUrl}\n`,
    );
    const configPath = writeTargetConfig('shared-accepted.env');
    const result = runDeploy(
      ['stage', '--dry-run', '--accept-shared-database=dev'],
      configPath,
      runtimePath,
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('数据库互斥检查 dev：相同');
    expect(result.output).toContain('共享数据库例外：dev');
    expect(result.output).not.toContain('stage_ref');
    rmSync(path.join(scanRoot, '.env.dev'));
  });

  it('reports a different database without exposing either identity', () => {
    const runtimePath = writeRuntime();
    writePrivateFile(
      path.join(scanRoot, '.env.preprod'),
      `DATABASE_URL=${otherDatabaseUrl}\n`,
    );
    const configPath = writeTargetConfig('different-database.env');
    const result = runDeploy(['stage', '--dry-run'], configPath, runtimePath);
    expect(result.status).toBe(0);
    expect(result.output).toContain('数据库互斥检查 preprod：不同');
    expect(result.output).not.toContain('other_ref');
    rmSync(path.join(scanRoot, '.env.preprod'));
  });

  it('rejects password authentication for production', () => {
    const runtimePath = writeRuntime(
      '.env.production',
      'production',
      otherDatabaseUrl,
    );
    const configPath = writeTargetConfig('production-password.env', {
      TARGET_NAME: 'production',
      APP_RUNTIME_ENV_FILE: '.env.production',
      DB_IDENTITY: databaseIdentityFromUrl(otherDatabaseUrl),
    });
    const result = runDeploy(
      ['production', '--dry-run', '--i-have-grace-approval'],
      configPath,
      runtimePath,
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain('生产发布只允许 SSH 密钥认证');
  });

  it('requires a non-empty restore point identifier', () => {
    expect(() => parseArgs(['stage', '--restore-point='])).toThrow(
      /恢复点标识/,
    );
    expect(
      parseArgs(['stage', '--restore-point=pitr-20260919T0120']),
    ).toMatchObject({ restorePoint: 'pitr-20260919T0120' });
  });

  it('compares the remote database identity hash without exposing identity', () => {
    const identity = databaseIdentityFromUrl(stageDatabaseUrl);
    expect(() =>
      assertRemoteDatabaseIdentity(identity, databaseIdentityHash(identity)),
    ).not.toThrow();
    expect(() =>
      assertRemoteDatabaseIdentity(identity, '0'.repeat(64)),
    ).toThrow(/数据库身份不一致/);
  });

  it('completes a fake stage dry-run without leaking sensitive values', () => {
    const runtimePath = writeRuntime();
    const configPath = writeTargetConfig('stage.env');
    const result = runDeploy(
      ['stage', '--dry-run', '--restore-point=fake-restore-001'],
      configPath,
      runtimePath,
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Dry-run 完成');
    expect(result.output).toContain('恢复点：fake-restore-001');
    expect(result.output).toContain('SSH 主机：已配置（默认脱敏）');
    for (const value of [
      'sensitive-stage-host.invalid',
      'fake-password-MUST-NOT-LEAK',
      '/sensitive/private/key/path',
      'https://sensitive-stage-site.invalid',
      'ghcr.io/sensitive-owner/sensitive-image',
      'region.pooler.supabase.com',
      'stage_ref',
    ]) {
      expect(result.output).not.toContain(value);
    }
    expect(result.output).not.toContain('postgresql://');
  });

  it('redacts sensitive remote diagnostic lines and configured values', () => {
    const diagnostic = redactRemoteDiagnostic(
      'SSH_HOST=sensitive-stage-host.invalid\nrequest https://secret.invalid/path\nsafe line',
      ['sensitive-stage-host.invalid'],
    );
    expect(diagnostic).not.toContain('sensitive-stage-host.invalid');
    expect(diagnostic).not.toContain('secret.invalid');
    expect(diagnostic).toContain('safe line');
  });
});
