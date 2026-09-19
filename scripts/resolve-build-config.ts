import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type BuildEnvironment = 'stage' | 'production';

export interface BuildConfig {
  environment: BuildEnvironment;
  NEXT_PUBLIC_SITE_URL: string;
  NEXT_PUBLIC_ICP_LICENSE: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

const publicBuildKeys = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_ICP_LICENSE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;
const allowedKeys = new Set(['environment', ...publicBuildKeys]);

export function parseBuildConfig(
  raw: string | undefined,
  expectedEnvironment: BuildEnvironment,
): BuildConfig {
  if (!raw) throw new Error('BUILD_CONFIG 未配置');
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error('BUILD_CONFIG 不是有效 JSON');
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('BUILD_CONFIG 必须是 JSON 对象');
  }

  const values = candidate as Record<string, unknown>;
  const unknownKeys = Object.keys(values).filter(
    (key) => !allowedKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error('BUILD_CONFIG 包含未知字段');
  }
  if (values.environment !== expectedEnvironment) {
    throw new Error('BUILD_CONFIG environment 与构建目标不一致');
  }

  for (const key of publicBuildKeys) {
    const value = values[key];
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      /[\r\n\0]/u.test(value)
    ) {
      throw new Error(`BUILD_CONFIG ${key} 必须是非空单行字符串`);
    }
  }
  return values as unknown as BuildConfig;
}

export function githubEnvironmentLines(config: BuildConfig): string {
  return publicBuildKeys.map((key) => `${key}=${config[key]}\n`).join('');
}

function main(): void {
  const expectedEnvironment = process.argv[2];
  if (expectedEnvironment !== 'stage' && expectedEnvironment !== 'production') {
    throw new Error('构建目标必须是 stage 或 production');
  }
  const githubEnvironmentFile = process.env.GITHUB_ENV;
  if (!githubEnvironmentFile) throw new Error('GITHUB_ENV 未配置');
  const config = parseBuildConfig(
    process.env.BUILD_CONFIG,
    expectedEnvironment,
  );
  appendFileSync(githubEnvironmentFile, githubEnvironmentLines(config), {
    encoding: 'utf8',
  });
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知配置错误';
    process.stderr.write(`构建配置校验失败：${message}\n`);
    process.exitCode = 1;
  }
}
