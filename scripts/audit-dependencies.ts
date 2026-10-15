import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const patchHash =
  '2962f685a3f13f9e5c4e32cac93783a84d9a60b6e4ee8993845d79d79fb7900b';
export const exceptionId = 'GHSA-vfj7-8cjw-p6xm';
const expiry = Date.parse('2026-11-15T00:00:00Z');
const allowedPaths = new Set([
  '.>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces',
  '.>eslint-config-next>eslint-import-resolver-typescript>globby>fast-glob>micromatch>braces',
  '.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint-import-resolver-typescript>globby>fast-glob>micromatch>braces',
]);
const severity = z.enum(['info', 'low', 'moderate', 'high', 'critical']);
const reportSchema = z.object({
  advisories: z.record(
    z.object({
      module_name: z.string(),
      github_advisory_id: z.string(),
      severity,
      findings: z
        .array(
          z.object({
            version: z.string(),
            paths: z.array(z.string()).min(1),
            dev: z.boolean(),
          }),
        )
        .min(1),
    }),
  ),
  metadata: z.object({
    vulnerabilities: z.object({
      info: z.number().int().nonnegative(),
      low: z.number().int().nonnegative(),
      moderate: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
      critical: z.number().int().nonnegative(),
    }),
  }),
});

export function checkReport(
  raw: unknown,
  target: string | undefined,
  verified: boolean,
  now = Date.now(),
) {
  if (typeof raw !== 'object' || raw === null || 'error' in raw)
    throw new Error('Audit response failed');
  const report = reportSchema.parse(raw);
  const all = Object.values(report.advisories);
  for (const level of severity.options) {
    if (
      all.filter((a) => a.severity === level).length !==
      report.metadata.vulnerabilities[level]
    ) {
      throw new Error('Audit summary mismatch');
    }
  }
  let exceptions = 0;
  for (const advisory of all) {
    if (advisory.severity !== 'high' && advisory.severity !== 'critical')
      continue;
    const allowed =
      target === 'stage' &&
      verified &&
      now < expiry &&
      advisory.github_advisory_id === exceptionId &&
      advisory.module_name === 'braces' &&
      advisory.severity === 'high' &&
      advisory.findings.every(
        (f) =>
          f.version === '3.0.3' &&
          f.dev === true &&
          f.paths.every((p) => allowedPaths.has(p)),
      );
    if (!allowed)
      throw new Error(
        `Unapproved vulnerability: ${advisory.github_advisory_id}`,
      );
    exceptions++;
  }
  return { exceptions, counts: report.metadata.vulnerabilities };
}

export function verifyPatch(patch: Buffer, workspace: string, lock: string) {
  if (
    createHash('sha256').update(patch).digest('hex') !== patchHash ||
    !workspace.includes('  braces@3.0.3: patches/braces@3.0.3.patch') ||
    !lock.includes(`  braces@3.0.3: ${patchHash}`) ||
    !lock.includes(`braces@3.0.3(patch_hash=${patchHash})`)
  ) {
    throw new Error('Approved patch/configuration hash mismatch');
  }
}

function main() {
  let verified = false;
  if (process.env.DEPLOY_ENVIRONMENT === 'stage') {
    verifyPatch(
      readFileSync('patches/braces@3.0.3.patch'),
      readFileSync('pnpm-workspace.yaml', 'utf8'),
      readFileSync('pnpm-lock.yaml', 'utf8'),
    );
    const tests = spawnSync(
      'pnpm',
      ['exec', 'vitest', 'run', 'scripts/braces-security.test.ts'],
      { stdio: 'inherit', timeout: 120000 },
    );
    if (tests.error || tests.status !== 0)
      throw new Error('Installed patch regression failed');
    verified = true;
  }
  const result = spawnSync(
    'pnpm',
    [
      'audit',
      '--registry',
      'https://registry.npmjs.org',
      '--json',
    ],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error || ![0, 1].includes(result.status ?? -1))
    throw new Error('Audit command failed');
  const outcome = checkReport(
    JSON.parse(result.stdout),
    process.env.DEPLOY_ENVIRONMENT,
    verified,
  );
  console.log('Dependency audit counts:', JSON.stringify(outcome.counts));
  if (outcome.exceptions)
    console.log(
      `Stage-only verified patch exception: ${exceptionId}; expires 2026-11-15 UTC. This is not a zero-vulnerability result.`,
    );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      'Dependency audit failed closed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    process.exitCode = 1;
  }
}
