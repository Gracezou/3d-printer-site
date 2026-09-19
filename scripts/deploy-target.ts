import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

type Target = 'stage' | 'production';

type Options = {
  target: Target;
  dryRun: boolean;
  restorePoint: string | null;
  acceptedSharedDatabases: Set<string>;
  graceApproval: boolean;
  quietHost: boolean;
};

type TargetConfig = {
  TARGET_NAME: Target;
  SSH_HOST: string;
  SSH_PORT: string;
  SSH_USER: string;
  SSH_AUTH: 'key' | 'password';
  SSH_KEY_PATH: string;
  SSH_PASSWORD: string;
  DEPLOY_DIR: string;
  RELEASE_MODE: 'blue-green' | 'low-memory';
  SITE_URL: string;
  HEALTH_URL: string;
  IMAGE_REPO: string;
  APP_RUNTIME_ENV_FILE: string;
  DB_IDENTITY: string;
};

type LoadedTarget = {
  config: TargetConfig;
  databaseIdentity: string;
  databaseClusterKey: string;
  databaseHostname: string;
  diagnosticSensitiveValues: string[];
};

type DatabaseTarget = {
  hostname: string;
  port: string;
  database: string;
  username: string;
};

type GitContext = {
  branch: string;
  sha: string;
  upstreamSha: string | null;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetKeys = [
  'TARGET_NAME',
  'SSH_HOST',
  'SSH_PORT',
  'SSH_USER',
  'SSH_AUTH',
  'SSH_KEY_PATH',
  'SSH_PASSWORD',
  'DEPLOY_DIR',
  'RELEASE_MODE',
  'SITE_URL',
  'HEALTH_URL',
  'IMAGE_REPO',
  'APP_RUNTIME_ENV_FILE',
  'DB_IDENTITY',
] as const;
const sharedDatabaseNames = new Set(['dev', 'production', 'preprod']);

function fail(message: string): never {
  throw new Error(message);
}

export function parseArgs(argv: string[]): Options {
  const [targetValue, ...flags] = argv;
  if (targetValue !== 'stage' && targetValue !== 'production') {
    fail(
      'Usage: scripts/deploy-target.sh <stage|production> [--dry-run] [--restore-point=<id>] [--accept-shared-database=<name>] [--i-have-grace-approval] [--quiet-host]',
    );
  }

  const exactFlags = new Set([
    '--dry-run',
    '--i-have-grace-approval',
    '--quiet-host',
  ]);
  const unknown = flags.find(
    (flag) =>
      !exactFlags.has(flag) &&
      !flag.startsWith('--restore-point=') &&
      !flag.startsWith('--accept-shared-database='),
  );
  if (unknown) fail(`Unknown option: ${unknown}`);

  const restoreFlags = flags.filter((flag) =>
    flag.startsWith('--restore-point='),
  );
  if (restoreFlags.length > 1) fail('--restore-point 只能提供一次');
  const restorePoint = restoreFlags[0]?.slice('--restore-point='.length) ?? null;
  if (restorePoint !== null && !/^[A-Za-z0-9._:@+-]{1,128}$/u.test(restorePoint)) {
    fail('--restore-point 必须是非空且不含空白的恢复点标识');
  }

  const acceptedSharedDatabases = new Set(
    flags
      .filter((flag) => flag.startsWith('--accept-shared-database='))
      .map((flag) => flag.slice('--accept-shared-database='.length)),
  );
  for (const name of acceptedSharedDatabases) {
    if (!sharedDatabaseNames.has(name)) {
      fail('--accept-shared-database 只接受 dev、production 或 preprod');
    }
  }

  return {
    target: targetValue,
    dryRun: flags.includes('--dry-run'),
    restorePoint,
    acceptedSharedDatabases,
    graceApproval: flags.includes('--i-have-grace-approval'),
    quietHost: flags.includes('--quiet-host'),
  };
}

function parseDatabaseTarget(databaseUrl: string): DatabaseTarget {
  let candidate: URL;
  try {
    candidate = new URL(databaseUrl);
  } catch {
    fail('DATABASE_URL 格式无效');
  }
  if (!['postgres:', 'postgresql:'].includes(candidate.protocol)) {
    fail('DATABASE_URL 必须使用 PostgreSQL 协议');
  }
  const forbiddenTargetParameters = new Set([
    'host',
    'hostaddr',
    'port',
    'dbname',
    'user',
  ]);
  for (const key of candidate.searchParams.keys()) {
    if (forbiddenTargetParameters.has(key.toLowerCase())) {
      fail(`DATABASE_URL 不得使用 ${key} 查询参数改写连接目标`);
    }
  }

  let database: string;
  let username: string;
  let hostname: string;
  try {
    database = decodeURIComponent(candidate.pathname.slice(1));
    username = decodeURIComponent(candidate.username);
    hostname = decodeURIComponent(candidate.hostname).toLowerCase();
  } catch {
    fail('DATABASE_URL 包含无效的 URL 编码');
  }
  if (hostname.includes(',')) {
    fail('DATABASE_URL 不得包含多个主机');
  }
  if (
    !hostname ||
    !database ||
    !username ||
    database.includes('/')
  ) {
    fail('DATABASE_URL 缺少主机、数据库名或用户名');
  }
  return {
    hostname,
    port: candidate.port || '5432',
    database,
    username,
  };
}

export function databaseIdentityFromUrl(databaseUrl: string): string {
  const target = parseDatabaseTarget(databaseUrl);
  return `${target.hostname}:${target.port}/${encodeURIComponent(target.database)}?user=${encodeURIComponent(target.username)}`;
}

export function databaseClusterKeyFromUrl(databaseUrl: string): string {
  const target = parseDatabaseTarget(databaseUrl);
  const directSupabase = /^db\.([a-z0-9_-]+)\.supabase\.co$/iu.exec(
    target.hostname,
  );
  if (directSupabase) return `supabase:${directSupabase[1]!.toLowerCase()}`;

  // Supabase pooler routing uses <role>.<project-ref>. Custom database roles
  // are valid here, so the project ref must not be tied to the postgres role.
  const poolerUser = /^[^.]+\.([a-z0-9_-]+)$/iu.exec(target.username);
  if (
    target.hostname.endsWith('.pooler.supabase.com') &&
    poolerUser
  ) {
    return `supabase:${poolerUser[1]!.toLowerCase()}`;
  }

  return `postgres:${target.hostname}/${encodeURIComponent(target.database)}`;
}

export function databaseIdentityHash(identity: string): string {
  return createHash('sha256').update(identity).digest('hex');
}

export function assertRemoteDatabaseIdentity(
  localIdentity: string,
  remoteHash: string,
): void {
  if (!/^[0-9a-f]{64}$/u.test(remoteHash)) {
    fail('服务器数据库身份校验未返回有效哈希');
  }
  if (databaseIdentityHash(localIdentity) !== remoteHash) {
    fail('本地迁移配置与服务器运行配置的数据库身份不一致');
  }
}

export function parseEnvText(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const [index, originalLine] of text.split(/\r?\n/u).entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) fail(`Invalid target config syntax on line ${index + 1}`);
    const key = match[1]!;
    let value = match[2]!;
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function assertPrivateFile(filePath: string, label: string): void {
  let metadata;
  try {
    metadata = lstatSync(filePath);
  } catch {
    fail(`${label}不存在`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(`${label}必须是普通文件且不能是符号链接`);
  }
  if (metadata.size === 0) fail(`${label}为空`);
  const permissions = metadata.mode & 0o777;
  if (permissions !== 0o600) fail(`${label}权限必须为 0600`);
}

function resolveRepositoryFile(value: string, label: string): string {
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`${label}必须位于代码仓内`);
  }
  return resolved;
}

export function hasNearbyRuntimeFilename(
  directory: string,
  expectedName: string,
): boolean {
  return readdirSync(directory).some(
    (candidate) => candidate !== expectedName && candidate.trim() === expectedName,
  );
}

function validateUrl(value: string, label: string): URL {
  try {
    const candidate = new URL(value);
    if (!['http:', 'https:'].includes(candidate.protocol)) throw new Error();
    return candidate;
  } catch {
    fail(`${label}必须是 http/https URL`);
  }
}

export function loadTargetConfig(
  target: Target,
  filePath: string,
  dryRun: boolean,
  runtimeOverride?: string,
): LoadedTarget {
  assertPrivateFile(filePath, '部署目标配置');
  const raw = parseEnvText(readFileSync(filePath, 'utf8'));
  const unknownKeys = Object.keys(raw).filter(
    (key) => !targetKeys.includes(key as (typeof targetKeys)[number]),
  );
  if (unknownKeys.length > 0) {
    fail(`部署目标配置包含未知键：${unknownKeys.join(', ')}`);
  }
  for (const key of targetKeys) {
    if (!(key in raw)) fail(`部署目标配置缺少键：${key}`);
  }

  const config = raw as TargetConfig;
  if (config.TARGET_NAME !== target) fail('TARGET_NAME 与命令行目标不一致');
  if (!/^[A-Za-z0-9.-]+$/u.test(config.SSH_HOST)) fail('SSH_HOST 格式无效');
  const port = Number(config.SSH_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    fail('SSH_PORT 必须是 1-65535 的整数');
  }
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(config.SSH_USER)) {
    fail('SSH_USER 格式无效');
  }
  if (config.SSH_AUTH !== 'key' && config.SSH_AUTH !== 'password') {
    fail('SSH_AUTH 必须是 key 或 password');
  }
  if (
    !config.DEPLOY_DIR.startsWith('/') ||
    !/^\/[A-Za-z0-9._/-]+$/u.test(config.DEPLOY_DIR) ||
    config.DEPLOY_DIR.split('/').includes('..')
  ) {
    fail('DEPLOY_DIR 必须是无空格、无 .. 的绝对路径');
  }
  if (!['blue-green', 'low-memory'].includes(config.RELEASE_MODE)) {
    fail('RELEASE_MODE 必须是 blue-green 或 low-memory');
  }
  const siteUrl = validateUrl(config.SITE_URL, 'SITE_URL');
  const healthUrl = validateUrl(config.HEALTH_URL, 'HEALTH_URL');
  if (siteUrl.hostname !== healthUrl.hostname) {
    fail('SITE_URL 与 HEALTH_URL 必须使用同一主机');
  }
  if (!/^ghcr\.io\/[a-z0-9._/-]+$/u.test(config.IMAGE_REPO)) {
    fail('IMAGE_REPO 必须是无标签的 ghcr.io 镜像仓库');
  }
  if (!config.DB_IDENTITY || /\s/u.test(config.DB_IDENTITY)) {
    fail('DB_IDENTITY 不能为空或包含空白');
  }

  const expectedRuntimeFile =
    target === 'stage' ? '.env.stage' : '.env.production';
  if (config.APP_RUNTIME_ENV_FILE !== expectedRuntimeFile) {
    fail(`APP_RUNTIME_ENV_FILE 只允许 ${expectedRuntimeFile}`);
  }
  let runtimeEnv = resolveRepositoryFile(
    expectedRuntimeFile,
    'APP_RUNTIME_ENV_FILE',
  );
  if (runtimeOverride) {
    if (!dryRun) fail('DEPLOY_RUNTIME_ENV_OVERRIDE 仅允许 dry-run 使用');
    const resolvedOverride = resolveRepositoryFile(
      runtimeOverride,
      'DEPLOY_RUNTIME_ENV_OVERRIDE',
    );
    const relativeOverride = path.relative(repoRoot, resolvedOverride);
    if (
      !relativeOverride.startsWith(`.local${path.sep}`) ||
      path.basename(resolvedOverride) !== expectedRuntimeFile
    ) {
      fail(`dry-run 运行配置必须位于 .local/ 且文件名为 ${expectedRuntimeFile}`);
    }
    runtimeEnv = resolvedOverride;
  } else {
    try {
      lstatSync(runtimeEnv);
    } catch {
      if (hasNearbyRuntimeFilename(repoRoot, expectedRuntimeFile)) {
        fail(
          `应用运行配置不存在；检测到名称近似的文件，请检查 ${expectedRuntimeFile} 文件名是否含首尾空格`,
        );
      }
    }
  }
  assertPrivateFile(runtimeEnv, '应用运行配置');
  const runtimeValues = parseEnvText(readFileSync(runtimeEnv, 'utf8'));
  if (!runtimeValues.DATABASE_URL) {
    fail('应用运行配置缺少 DATABASE_URL');
  }
  const expectedAppEnvironment =
    target === 'stage' ? 'staging' : 'production';
  if (runtimeValues.APP_ENV !== expectedAppEnvironment) {
    fail(`应用运行配置 APP_ENV 必须为 ${expectedAppEnvironment}`);
  }
  const databaseIdentity = databaseIdentityFromUrl(runtimeValues.DATABASE_URL);
  if (databaseIdentity !== config.DB_IDENTITY) {
    fail('DATABASE_URL 的数据库身份与 DB_IDENTITY 不一致');
  }
  const databaseClusterKey = databaseClusterKeyFromUrl(
    runtimeValues.DATABASE_URL,
  );
  const databaseTarget = parseDatabaseTarget(runtimeValues.DATABASE_URL);
  for (const reservedKey of [
    'ALLOW_REMOTE_DATABASE_MIGRATION',
    'CONFIRM_REMOTE_DATABASE_HOST',
  ]) {
    if (reservedKey in runtimeValues) {
      fail(`应用运行配置不得设置发布脚本保留键：${reservedKey}`);
    }
  }
  config.APP_RUNTIME_ENV_FILE = runtimeEnv;

  if (target === 'production' && config.SSH_AUTH !== 'key') {
    fail('生产发布只允许 SSH 密钥认证');
  }
  if (config.SSH_AUTH === 'key') {
    if (!config.SSH_KEY_PATH) fail('SSH_AUTH=key 时必须填写 SSH_KEY_PATH');
    if (!dryRun || target === 'production') {
      assertPrivateFile(config.SSH_KEY_PATH, 'SSH 私钥');
    }
    if (target === 'production') {
      assertProductionPrivateKeyProtected(config.SSH_KEY_PATH);
    }
  } else {
    if (!config.SSH_PASSWORD) fail('SSH_AUTH=password 时必须填写 SSH_PASSWORD');
    if (!dryRun && !commandExists('sshpass')) {
      fail('密码认证需要本机安装 sshpass；推荐改用 SSH 密钥');
    }
  }

  return {
    config,
    databaseIdentity,
    databaseClusterKey,
    databaseHostname: databaseTarget.hostname,
    diagnosticSensitiveValues: [
      databaseTarget.hostname,
      ...Object.values(runtimeValues).filter((value) => value.length >= 8),
    ],
  };
}

function run(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; input?: string } = {},
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  return result.error === undefined;
}

export function assertProductionPrivateKeyProtected(filePath: string): void {
  const probe = spawnSync(
    'ssh-keygen',
    ['-y', '-P', '', '-f', filePath],
    { cwd: repoRoot, stdio: 'ignore' },
  );
  if (probe.error) fail('无法执行 ssh-keygen 检查生产私钥口令');
  if (probe.status === 0) {
    fail('生产私钥必须设置口令，禁止使用空口令私钥');
  }
}

function gitOutput(args: string[]): string {
  const result = run('git', args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0) fail('Git 前置检查失败');
  return result.stdout.trim();
}

function inspectGitContext(testMode: boolean): GitContext {
  if (testMode) {
    return {
      branch: 'release-v0.3.0',
      sha: '0123456789abcdef0123456789abcdef01234567',
      upstreamSha: null,
    };
  }
  if (gitOutput(['status', '--porcelain'])) fail('工作区不干净，拒绝发布');
  const branch = gitOutput(['branch', '--show-current']);
  if (!branch) fail('当前处于 detached HEAD，拒绝发布');
  const sha = gitOutput(['rev-parse', 'HEAD']);
  const upstream = run('git', ['rev-parse', '--verify', '@{upstream}']);
  return {
    branch,
    sha,
    upstreamSha: upstream.status === 0 ? upstream.stdout.trim() : null,
  };
}

function targetConfigPath(options: Options): string {
  const override = process.env.DEPLOY_TARGET_CONFIG;
  if (!override) {
    return path.join(repoRoot, 'deploy', 'targets', `${options.target}.env`);
  }
  if (!options.dryRun) {
    fail('DEPLOY_TARGET_CONFIG 仅允许 dry-run 使用');
  }
  const resolved = resolveRepositoryFile(override, 'DEPLOY_TARGET_CONFIG');
  const relative = path.relative(repoRoot, resolved);
  if (!relative.startsWith(`.local${path.sep}`)) {
    fail('测试配置必须位于 .local/');
  }
  return resolved;
}

function sharedDatabaseScanRoot(options: Options): string {
  const override = process.env.DEPLOY_RUNTIME_SCAN_ROOT;
  if (!override) return repoRoot;
  if (!options.dryRun) {
    fail('DEPLOY_RUNTIME_SCAN_ROOT 仅允许 dry-run 使用');
  }
  const resolved = resolveRepositoryFile(override, 'DEPLOY_RUNTIME_SCAN_ROOT');
  const relative = path.relative(repoRoot, resolved);
  if (!relative.startsWith(`.local${path.sep}`)) {
    fail('dry-run 对照配置目录必须位于 .local/');
  }
  return resolved;
}

function checkDatabaseIsolation(
  target: Target,
  targetClusterKey: string,
  acceptedNames: Set<string>,
  scanRoot: string,
): string[] {
  const acceptedMatches: string[] = [];
  const candidates =
    target === 'stage'
      ? [
          { name: 'dev', file: '.env.dev' },
          { name: 'production', file: '.env.production' },
          { name: 'preprod', file: '.env.preprod' },
        ]
      : [
          { name: 'dev', file: '.env.dev' },
          { name: 'stage', file: '.env.stage' },
          { name: 'preprod', file: '.env.preprod' },
        ];

  for (const candidate of candidates) {
    const candidatePath = path.join(scanRoot, candidate.file);
    try {
      lstatSync(candidatePath);
    } catch {
      continue;
    }
    assertPrivateFile(candidatePath, `对照运行配置 ${candidate.file}`);
    const values = parseEnvText(readFileSync(candidatePath, 'utf8'));
    if (!values.DATABASE_URL) {
      fail(`对照运行配置 ${candidate.file} 缺少 DATABASE_URL`);
    }
    const matches =
      databaseClusterKeyFromUrl(values.DATABASE_URL) === targetClusterKey;
    process.stdout.write(
      `数据库互斥检查 ${candidate.name}：${matches ? '相同' : '不同'}\n`,
    );
    if (!matches) continue;
    if (target === 'production') {
      fail(`Production 与 ${candidate.name} 共用数据库；生产目标禁止共用数据库`);
    }
    if (!acceptedNames.has(candidate.name)) {
      fail(
        `Stage 与 ${candidate.name} 共用数据库；需 Grace 明确接受后传入 --accept-shared-database=${candidate.name}`,
      );
    }
    acceptedMatches.push(candidate.name);
  }

  const unusedAcceptances = [...acceptedNames].filter(
    (name) => !acceptedMatches.includes(name),
  );
  if (unusedAcceptances.length > 0) {
    fail('共享数据库接受参数与实际身份比较结果不一致');
  }
  return acceptedMatches;
}

export function checkStageDatabaseIsolation(
  stageClusterKey: string,
  acceptedNames: Set<string>,
  scanRoot: string,
): string[] {
  return checkDatabaseIsolation(
    'stage',
    stageClusterKey,
    acceptedNames,
    scanRoot,
  );
}

export function checkProductionDatabaseIsolation(
  productionClusterKey: string,
  scanRoot: string,
): void {
  checkDatabaseIsolation('production', productionClusterKey, new Set(), scanRoot);
}

function sshArgs(config: TargetConfig, command: string): {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  const common = [
    '-o',
    'StrictHostKeyChecking=yes',
    ...(config.SSH_AUTH === 'key'
      ? ['-o', 'IdentitiesOnly=yes']
      : []),
    '-o',
    `BatchMode=${config.SSH_AUTH === 'key' ? 'yes' : 'no'}`,
    '-p',
    config.SSH_PORT,
    `${config.SSH_USER}@${config.SSH_HOST}`,
    command,
  ];
  if (config.SSH_AUTH === 'key') {
    return {
      executable: 'ssh',
      args: ['-i', config.SSH_KEY_PATH, ...common],
      env: process.env,
    };
  }
  return {
    executable: 'sshpass',
    args: ['-e', 'ssh', ...common],
    env: { ...process.env, SSHPASS: config.SSH_PASSWORD },
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function verifyRemoteDatabaseIdentity(
  config: TargetConfig,
  localIdentity: string,
  image: string,
  diagnosticSensitiveValues: string[],
): Promise<void> {
  const identityProgram = [
    "const { createHash } = require('node:crypto');",
    'try {',
    'const candidate = new URL(process.env.DATABASE_URL);',
    "if (!['postgres:', 'postgresql:'].includes(candidate.protocol)) process.exit(2);",
    "const forbidden = new Set(['host','hostaddr','port','dbname','user']);",
    'for (const key of candidate.searchParams.keys()) if (forbidden.has(key.toLowerCase())) process.exit(2);',
    "const database = decodeURIComponent(candidate.pathname.slice(1));",
    'const username = decodeURIComponent(candidate.username);',
    'const hostname = decodeURIComponent(candidate.hostname).toLowerCase();',
    "if (!hostname || hostname.includes(',') || !database || !username || database.includes('/')) process.exit(2);",
    "const port = candidate.port || '5432';",
    'const identity = `${hostname}:${port}/${encodeURIComponent(database)}?user=${encodeURIComponent(username)}`;',
    "process.stdout.write(createHash('sha256').update(identity).digest('hex') + '\\n');",
    '} catch { process.exit(2); }',
  ].join('');
  const command = [
    `cd ${config.DEPLOY_DIR}`,
    `docker pull ${image} >/dev/null`,
    `APP_IMAGE=${shellQuote(image)} docker compose --env-file .env -f compose.yaml run --rm --no-deps --entrypoint node web -e ${shellQuote(identityProgram)}`,
  ].join(' && ');
  const result = await runRemote(config, command);
  if (result.status !== 0) {
    writeRemoteDiagnostics(config, result, diagnosticSensitiveValues);
    fail('无法核对服务器运行配置的数据库身份');
  }
  const hash = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => /^[0-9a-f]{64}$/u.test(line));
  assertRemoteDatabaseIdentity(localIdentity, hash ?? '');
}

async function readPreviousImageTag(
  config: TargetConfig,
  diagnosticSensitiveValues: string[],
): Promise<string | null> {
  const command = `cd ${config.DEPLOY_DIR} && . ./.active-release && printf '%s\\n' "\${PREVIOUS_IMAGE:-}"`;
  const result = await runRemote(config, command);
  if (result.status !== 0) {
    writeRemoteDiagnostics(config, result, diagnosticSensitiveValues);
    fail('无法读取服务器上一发布镜像');
  }
  const image = result.stdout.trim().split(/\r?\n/u).at(-1) ?? '';
  if (!image) return null;
  if (
    !/^ghcr\.io\/[a-z0-9._/-]+:(?:stage-|production-)?sha-[0-9a-f]{7,40}$/u.test(
      image,
    )
  ) {
    fail('服务器上一发布镜像记录格式无效');
  }
  return image.slice(image.lastIndexOf(':') + 1);
}

type RemoteResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export function redactRemoteDiagnostic(
  text: string,
  sensitiveValues: string[],
): string {
  let redacted = text;
  const literalValues = [
    ...new Set(sensitiveValues.filter((candidate) => candidate.length >= 4)),
  ].sort((left, right) => right.length - left.length);
  for (const value of literalValues) {
    redacted = redacted.split(value).join('[REDACTED]');
  }
  redacted = redacted.replace(
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?(?:-----END(?: [A-Z0-9]+)* PRIVATE KEY-----|$)/giu,
    '[REDACTED_PEM_PRIVATE_KEY]',
  );
  redacted = redacted.replace(
    /\b(?:postgres(?:ql)?|https?|ssh):\/\/\S+/giu,
    '[REDACTED_URL]',
  );
  redacted = redacted.replace(
    /\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/gu,
    '[REDACTED_JWT]',
  );
  redacted = redacted.replace(
    /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/_=-])/gu,
    '[REDACTED_BASE64]',
  );
  return redacted
    .split(/\r?\n/u)
    .map((line) =>
      /(?:DATABASE_URL|PASSWORD|PRIVATE_KEY|SECRET|TOKEN|SERVICE_ROLE|ADMIN_JWT|ALIPAY_|SUPABASE_|SSH_|\b[A-Z0-9_]*(?:KEY|SECRET|PASSWORD|TOKEN)[A-Z0-9_]*\s*=)/iu.test(
        line,
      )
        ? '[REDACTED sensitive diagnostic line]'
        : line,
    )
    .join('\n');
}

export function shouldSuggestSessionPooler(
  diagnostic: string,
  databaseHostname: string,
): boolean {
  return (
    /\bENOTFOUND\b/u.test(diagnostic) &&
    /^db\.[a-z0-9_-]+\.supabase\.co$/iu.test(databaseHostname)
  );
}

function appendTail(current: string, chunk: string): string {
  const combined = `${current}${chunk}`;
  const lines = combined.split(/\r?\n/u).slice(-40).join('\n');
  return lines.slice(-128 * 1024);
}

async function runRemote(
  config: TargetConfig,
  command: string,
): Promise<RemoteResult> {
  const invocation = sshArgs(config, command);
  return await new Promise<RemoteResult>((resolve) => {
    const child = spawn(invocation.executable, invocation.args, {
      cwd: repoRoot,
      env: invocation.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendTail(stdout, chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendTail(stderr, chunk.toString('utf8'));
    });
    child.on('error', () => resolve({ status: 1, stdout, stderr }));
    child.on('close', (code) =>
      resolve({ status: code ?? 1, stdout, stderr }),
    );
  });
}

function writeRemoteDiagnostics(
  config: TargetConfig,
  result: RemoteResult,
  additionalSensitiveValues: string[] = [],
): void {
  const sensitiveValues = [
    config.SSH_HOST,
    config.SSH_KEY_PATH,
    config.SSH_PASSWORD,
    config.DEPLOY_DIR,
    config.SITE_URL,
    config.HEALTH_URL,
    config.IMAGE_REPO,
    config.APP_RUNTIME_ENV_FILE,
    config.DB_IDENTITY,
    ...additionalSensitiveValues,
  ];
  const diagnostic = redactRemoteDiagnostic(
    `${result.stdout}\n${result.stderr}`,
    sensitiveValues,
  )
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(-20)
    .join('\n');
  if (diagnostic) {
    process.stderr.write(`远端诊断（已脱敏，最后 20 行）：\n${diagnostic}\n`);
  }
}

async function promptFor(expected: string, prompt: string): Promise<void> {
  if (!process.stdin.isTTY) fail('该确认必须在交互终端中完成');
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await readline.question(prompt);
    if (answer !== expected) fail('交互确认不匹配，已取消');
  } finally {
    readline.close();
  }
}

function waitForImageWorkflow(
  branch: string,
  sha: string,
  target: Target,
): void {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const result = run('gh', [
      'run',
      'list',
      '--workflow',
      'release-image.yml',
      '--branch',
      branch,
      '--commit',
      sha,
      '--limit',
      '20',
      '--json',
      'status,conclusion,displayTitle',
    ]);
    if (result.status !== 0) fail('无法查询镜像构建流水线');
    const runs = JSON.parse(result.stdout) as Array<{
      status: string;
      conclusion: string | null;
      displayTitle: string;
    }>;
    const workflow = runs.find((run) =>
      run.displayTitle.includes(`[${target}]`),
    );
    if (workflow?.status === 'completed') {
      if (workflow.conclusion !== 'success') fail('镜像构建流水线未成功');
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
  }
  fail('等待镜像构建超时');
}

function checkPendingMigrations(
  config: TargetConfig,
  databaseHostname: string,
): boolean {
  const result = run(
    'pnpm',
    [
      'exec',
      'dotenv',
      '-e',
      config.APP_RUNTIME_ENV_FILE,
      '--override',
      '--',
      'tsx',
      'scripts/check-pending-migrations.ts',
    ],
    {
      env: {
        ...process.env,
        ALLOW_REMOTE_DATABASE_MIGRATION: 'true',
        CONFIRM_REMOTE_DATABASE_HOST: databaseHostname,
      },
    },
  );
  if (result.status !== 0) {
    if (
      shouldSuggestSessionPooler(
        `${result.stdout}\n${result.stderr}`,
        databaseHostname,
      )
    ) {
      fail(
        '无法解析 Supabase 直连数据库主机；请改用 Session pooler 连接串（端口 5432）',
      );
    }
    fail('无法安全检查目标库迁移状态');
  }
  const state = result.stdout.trim();
  if (state !== 'pending' && state !== 'current') {
    fail('迁移状态检查返回了未知结果');
  }
  return state === 'pending';
}

function runMigrations(
  config: TargetConfig,
  databaseHostname: string,
): void {
  const result = run(
    'pnpm',
    [
      'exec',
      'dotenv',
      '-e',
      config.APP_RUNTIME_ENV_FILE,
      '--override',
      '--',
      'pnpm',
      'db:migrate',
    ],
    {
      env: {
        ...process.env,
        ALLOW_REMOTE_DATABASE_MIGRATION: 'true',
        CONFIRM_REMOTE_DATABASE_HOST: databaseHostname,
      },
    },
  );
  if (result.status !== 0) {
    if (
      shouldSuggestSessionPooler(
        `${result.stdout}\n${result.stderr}`,
        databaseHostname,
      )
    ) {
      fail(
        '无法解析 Supabase 直连数据库主机；请改用 Session pooler 连接串（端口 5432）',
      );
    }
    fail('数据库迁移失败；目标详情已从日志省略');
  }
}

async function verifyDeployment(config: TargetConfig, sha: string): Promise<void> {
  const health = await fetch(config.HEALTH_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!health.ok) fail('健康检查未返回成功状态');
  const payload = (await health.json()) as { version?: unknown };
  if (typeof payload.version !== 'string' || !payload.version.includes(sha)) {
    fail('健康检查版本号与本次提交不一致');
  }

  const homepage = await fetch(config.SITE_URL, {
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (homepage.status !== 200) fail('首页未返回 HTTP 200');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.target === 'production' && !options.graceApproval) {
    fail('生产发布默认禁止；必须传入 --i-have-grace-approval');
  }

  const testMode =
    options.dryRun && process.env.DEPLOY_TARGET_TEST_MODE === '1';
  if (
    options.target === 'production' &&
    options.acceptedSharedDatabases.size > 0
  ) {
    fail('--accept-shared-database 只适用于 stage');
  }
  const configPath = targetConfigPath(options);
  const loaded = loadTargetConfig(
    options.target,
    configPath,
    options.dryRun,
    process.env.DEPLOY_RUNTIME_ENV_OVERRIDE,
  );
  const { config } = loaded;
  const isolationScanRoot = sharedDatabaseScanRoot(options);
  const acceptedSharedDatabases =
    options.target === 'stage'
      ? checkStageDatabaseIsolation(
          loaded.databaseClusterKey,
          options.acceptedSharedDatabases,
          isolationScanRoot,
        )
      : [];
  if (options.target === 'production') {
    checkProductionDatabaseIsolation(
      loaded.databaseClusterKey,
      isolationScanRoot,
    );
  }
  const git = inspectGitContext(testMode);
  if (!/^release-v\d+\.\d+\.\d+$/u.test(git.branch)) {
    fail('只能从 release-v<major>.<minor>.<patch> 分支发布');
  }
  const imageTag = `${options.target}-sha-${git.sha}`;
  const image = `${config.IMAGE_REPO}:${imageTag}`;

  if (options.target === 'production') {
    const expectedDomain = new URL(config.SITE_URL).hostname;
    await promptFor(
      expectedDomain,
      '请输入目标站点域名以确认本次生产发布：',
    );
  }

  process.stdout.write(`部署计划：${options.target}\n`);
  if (!options.quietHost) {
    process.stdout.write('SSH 主机：已配置（默认脱敏）\n');
  }
  process.stdout.write(`分支：${git.branch}\n`);
  process.stdout.write(`提交：${git.sha}\n`);
  process.stdout.write(`镜像标签：${imageTag}\n`);
  if (options.restorePoint) {
    process.stdout.write(`恢复点：${options.restorePoint}\n`);
  }
  if (acceptedSharedDatabases.length > 0) {
    process.stdout.write(
      `共享数据库例外：${acceptedSharedDatabases.join(',')}\n`,
    );
  }
  process.stdout.write('计划：确认推送状态 → 等待 CI → 检查迁移 → 发布 → 健康检查\n');

  if (options.dryRun) {
    process.stdout.write('Dry-run 完成：未推送、未连接数据库、未连接服务器、未发布。\n');
    return;
  }

  for (const command of ['gh', 'docker', 'pnpm', 'ssh']) {
    if (!commandExists(command)) fail(`缺少发布依赖：${command}`);
  }

  if (options.target === 'stage' && git.upstreamSha !== git.sha) {
    const push = run('git', [
      'push',
      '--set-upstream',
      'origin',
      `HEAD:refs/heads/${git.branch}`,
    ]);
    if (push.status !== 0) fail('Stage 分支自动推送失败');
  }
  if (options.target === 'production' && git.upstreamSha !== git.sha) {
    fail('生产发布不允许自动推送；当前提交必须已存在于上游分支');
  }

  waitForImageWorkflow(git.branch, git.sha, options.target);
  const manifest = run('docker', ['manifest', 'inspect', image]);
  if (manifest.status !== 0) fail('不可变镜像标签不存在或当前账号无权读取');

  await verifyRemoteDatabaseIdentity(
    config,
    loaded.databaseIdentity,
    image,
    loaded.diagnosticSensitiveValues,
  );
  const pendingMigrations = checkPendingMigrations(
    config,
    loaded.databaseHostname,
  );
  if (pendingMigrations) {
    if (!options.restorePoint) {
      fail('存在待执行迁移；必须传入 --restore-point=<id> 记录恢复点');
    }
    if (options.target === 'production') {
      await promptFor(
        'BACKUP-READY',
        '确认生产库已有可用备份或恢复点，请输入 BACKUP-READY：',
      );
    }
    runMigrations(config, loaded.databaseHostname);
  }

  const releaseScript =
    config.RELEASE_MODE === 'blue-green'
      ? 'release.sh'
      : 'release-low-memory.sh';
  const remoteCommand = `cd ${config.DEPLOY_DIR} && ./${releaseScript} ${image}`;
  const release = await runRemote(config, remoteCommand);
  if (release.status !== 0) {
    writeRemoteDiagnostics(
      config,
      release,
      loaded.diagnosticSensitiveValues,
    );
    fail('服务器发布失败；远端发布脚本已负责自动回滚');
  }

  const previousImageTag = await readPreviousImageTag(
    config,
    loaded.diagnosticSensitiveValues,
  );
  try {
    await verifyDeployment(config, git.sha);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : '公网验证失败';
    const rollback = previousImageTag
      ? `；服务器已切换，请手动回滚到 ${previousImageTag}`
      : '；服务器已切换但未记录上一镜像，请立即人工处理';
    fail(`${reason}${rollback}`);
  }
  process.stdout.write('发布结果：成功\n');
  process.stdout.write(`分支：${git.branch}\n`);
  process.stdout.write(`提交：${git.sha}\n`);
  process.stdout.write(`镜像标签：${imageTag}\n`);
  process.stdout.write(`数据库迁移：${pendingMigrations ? '已执行' : '无需执行'}\n`);
  if (options.restorePoint) {
    process.stdout.write(`恢复点：${options.restorePoint}\n`);
  }
  if (acceptedSharedDatabases.length > 0) {
    process.stdout.write(
      `共享数据库例外：${acceptedSharedDatabases.join(',')}\n`,
    );
  }
  process.stdout.write('健康检查：版本匹配，首页 HTTP 200\n');
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '未知错误';
    process.stderr.write(`部署中止：${message}\n`);
    process.exitCode = 1;
  });
}
