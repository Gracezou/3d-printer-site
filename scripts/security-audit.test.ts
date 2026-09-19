import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = path.join(
  repoRoot,
  '.local',
  `security-audit-test-${process.pid}`,
);
const fakeBin = path.join(fixtureRoot, 'bin');
const auditScript = path.join(repoRoot, 'scripts', 'security-audit.sh');
const fixtureScript = path.join(fixtureRoot, 'scripts', 'security-audit.sh');

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content, { mode: 0o755 });
  chmodSync(filePath, 0o755);
}

function runAudit() {
  return spawnSync(fixtureScript, [], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: fakeBin,
    },
  });
}

describe.sequential('security audit portability', () => {
  beforeAll(() => {
    mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
    mkdirSync(path.join(fixtureRoot, '.next', 'static'), { recursive: true });
    mkdirSync(path.join(fixtureRoot, 'src', 'app', 'api'), { recursive: true });
    mkdirSync(path.join(fixtureRoot, 'src', 'lib'), { recursive: true });
    mkdirSync(fakeBin, { recursive: true });

    copyFileSync(auditScript, fixtureScript);
    chmodSync(fixtureScript, 0o755);
    writeFileSync(path.join(fixtureRoot, '.next', 'static', 'app.js'), 'safe\n');
    writeFileSync(
      path.join(fixtureRoot, 'src', 'app', 'api', 'route.ts'),
      'export const GET = () => new Response();\n',
    );
    writeFileSync(
      path.join(fixtureRoot, 'src', 'lib', 'safe.ts'),
      'export const safe = true;\n',
    );

    symlinkSync('/bin/bash', path.join(fakeBin, 'bash'));
    symlinkSync('/usr/bin/dirname', path.join(fakeBin, 'dirname'));
    symlinkSync('/usr/bin/git', path.join(fakeBin, 'git'));
    symlinkSync('/usr/bin/grep', path.join(fakeBin, 'grep'));
    writeExecutable(path.join(fakeBin, 'pnpm'), '#!/bin/bash\nexit 0\n');

    for (const args of [
      ['init', '-q'],
      ['config', 'user.email', 'security-audit@example.invalid'],
      ['config', 'user.name', 'Security Audit Test'],
      ['add', '.'],
    ]) {
      const result = spawnSync('/usr/bin/git', args, {
        cwd: fixtureRoot,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(`fixture git command failed: ${result.stderr}`);
      }
    }
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('passes without ripgrep in PATH', () => {
    expect(readFileSync(auditScript, 'utf8')).not.toMatch(/\brg\b/u);
    const result = runAudit();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Security audit passed.');
  });

  it('fails closed when a scan command errors', () => {
    rmSync(path.join(fakeBin, 'grep'));
    writeExecutable(path.join(fakeBin, 'grep'), '#!/bin/bash\nexit 2\n');
    const result = runAudit();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('browser bundle scan command failed');
  });
});
