import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkReport, exceptionId, verifyPatch } from './audit-dependencies';

const now = Date.parse('2026-10-15T00:00:00Z');
function fixture() {
  return {
    advisories: {
      '1': {
        module_name: 'braces',
        github_advisory_id: exceptionId,
        severity: 'high',
        findings: [
          {
            version: '3.0.3',
            dev: true,
            paths: [
              '.>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces',
            ],
          },
        ],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
    },
  };
}
describe('bounded Stage security exception', () => {
  it('accepts only verified Stage patch', () =>
    expect(checkReport(fixture(), 'stage', true, now).exceptions).toBe(1));
  it.each(['production', undefined, 'staging'])('rejects target %s', (target) =>
    expect(() => checkReport(fixture(), target, true, now)).toThrow(),
  );
  it('requires regression evidence and unexpired approval', () => {
    expect(() => checkReport(fixture(), 'stage', false, now)).toThrow();
    expect(() =>
      checkReport(fixture(), 'stage', true, Date.parse('2026-11-15T00:00:00Z')),
    ).toThrow();
  });
  it.each(['id', 'module', 'version', 'runtime', 'path', 'critical'])(
    'rejects changed %s',
    (field) => {
      const r = fixture();
      const a = r.advisories['1'];
      const f = a.findings[0]!;
      if (field === 'id') a.github_advisory_id = 'GHSA-other';
      if (field === 'module') a.module_name = 'other';
      if (field === 'version') f.version = '3.0.2';
      if (field === 'runtime') f.dev = false;
      if (field === 'path') f.paths.push('.>new-parent>braces');
      if (field === 'critical') {
        a.severity = 'critical';
        r.metadata.vulnerabilities.high = 0;
        r.metadata.vulnerabilities.critical = 1;
      }
      expect(() => checkReport(r, 'stage', true, now)).toThrow();
    },
  );
  it.each([
    {},
    { error: 'network' },
    { advisories: {} },
    { ...fixture(), metadata: { vulnerabilities: { high: 0 } } },
  ])('fails closed on invalid reports', (raw) =>
    expect(() => checkReport(raw, 'stage', true, now)).toThrow(),
  );
  it('checks patch bytes and lock/config wiring', () => {
    const patch = readFileSync('patches/braces@3.0.3.patch');
    const config = readFileSync('pnpm-workspace.yaml', 'utf8');
    const lock = readFileSync('pnpm-lock.yaml', 'utf8');
    expect(() => verifyPatch(patch, config, lock)).not.toThrow();
    expect(() =>
      verifyPatch(Buffer.concat([patch, Buffer.from('\n')]), config, lock),
    ).toThrow();
    expect(() => verifyPatch(patch, '', lock)).toThrow();
    expect(() => verifyPatch(patch, config, '')).toThrow();
  });
  it('rejects a valid-looking but inconsistent summary', () => {
    const report = fixture();
    report.metadata.vulnerabilities.high = 0;
    expect(() => checkReport(report, 'stage', true, now)).toThrow(
      'summary mismatch',
    );
  });
});
