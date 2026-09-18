import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

type Target = 'stage' | 'production';

type Options = {
  target: Target;
  dryRun: boolean;
  backupConfirmed: boolean;
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
  DB_MIGRATION_HOST_CONFIRM: string;
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
  'DB_MIGRATION_HOST_CONFIRM',
] as const;

function fail(message: string): never {
  throw new Error(message);
}

export function parseArgs(argv: string[]): Options {
  const [targetValue, ...flags] = argv;
  if (targetValue !== 'stage' && targetValue !== 'production') {
    fail(
      'Usage: scripts/deploy-target.sh <stage|production> [--dry-run] [--backup-confirmed] [--i-have-grace-approval] [--quiet-host]',
    );
  }

  const knownFlags = new Set([
    '--dry-run',
    '--backup-confirmed',
    '--i-have-grace-approval',
    '--quiet-host',
  ]);
  const unknown = flags.find((flag) => !knownFlags.has(flag));
  if (unknown) fail(`Unknown option: ${unknown}`);

  return {
    target: targetValue,
    dryRun: flags.includes('--dry-run'),
    backupConfirmed: flags.includes('--backup-confirmed'),
    graceApproval: flags.includes('--i-have-grace-approval'),
    quietHost: flags.includes('--quiet-host'),
  };
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
): TargetConfig {
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
  if (!config.DB_MIGRATION_HOST_CONFIRM || /\s/u.test(config.DB_MIGRATION_HOST_CONFIRM)) {
    fail('DB_MIGRATION_HOST_CONFIRM 不能为空或包含空白');
  }

  const runtimeEnv = resolveRepositoryFile(
    config.APP_RUNTIME_ENV_FILE,
    'APP_RUNTIME_ENV_FILE',
  );
  assertPrivateFile(runtimeEnv, '应用运行配置');
  config.APP_RUNTIME_ENV_FILE = runtimeEnv;

  if (config.SSH_AUTH === 'key') {
    if (!config.SSH_KEY_PATH) fail('SSH_AUTH=key 时必须填写 SSH_KEY_PATH');
    if (!dryRun) assertPrivateFile(config.SSH_KEY_PATH, 'SSH 私钥');
  } else {
    if (!config.SSH_PASSWORD) fail('SSH_AUTH=password 时必须填写 SSH_PASSWORD');
    if (!dryRun && !commandExists('sshpass')) {
      fail('密码认证需要本机安装 sshpass；推荐改用 SSH 密钥');
    }
  }

  return config;
}

function run(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; input?: string } = {},
): { status: number; stdout: string } {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  return result.error === undefined;
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

function targetConfigPath(options: Options, testMode: boolean): string {
  const override = process.env.DEPLOY_TARGET_CONFIG;
  if (!override) {
    return path.join(repoRoot, 'deploy', 'targets', `${options.target}.env`);
  }
  if (!testMode || !options.dryRun) {
    fail('DEPLOY_TARGET_CONFIG 仅允许 dry-run 测试模式使用');
  }
  const resolved = resolveRepositoryFile(override, 'DEPLOY_TARGET_CONFIG');
  const relative = path.relative(repoRoot, resolved);
  if (!relative.startsWith(`.local${path.sep}`)) {
    fail('测试配置必须位于 .local/');
  }
  return resolved;
}

function sshArgs(config: TargetConfig, command: string): {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  const common = [
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

function waitForImageWorkflow(branch: string, sha: string): void {
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
      'status,conclusion',
    ]);
    if (result.status !== 0) fail('无法查询镜像构建流水线');
    const runs = JSON.parse(result.stdout) as Array<{
      status: string;
      conclusion: string | null;
    }>;
    const workflow = runs[0];
    if (workflow?.status === 'completed') {
      if (workflow.conclusion !== 'success') fail('镜像构建流水线未成功');
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
  }
  fail('等待镜像构建超时');
}

function checkPendingMigrations(config: TargetConfig): boolean {
  const result = run(
    'pnpm',
    [
      'exec',
      'dotenv',
      '-e',
      config.APP_RUNTIME_ENV_FILE,
      '--',
      'tsx',
      'scripts/check-pending-migrations.ts',
    ],
    {
      env: {
        ...process.env,
        ALLOW_REMOTE_DATABASE_MIGRATION: 'true',
        CONFIRM_REMOTE_DATABASE_HOST: config.DB_MIGRATION_HOST_CONFIRM,
      },
    },
  );
  if (result.status !== 0) fail('无法安全检查目标库迁移状态');
  const state = result.stdout.trim();
  if (state !== 'pending' && state !== 'current') {
    fail('迁移状态检查返回了未知结果');
  }
  return state === 'pending';
}

function runMigrations(config: TargetConfig): void {
  const result = run(
    'pnpm',
    [
      'exec',
      'dotenv',
      '-e',
      config.APP_RUNTIME_ENV_FILE,
      '--',
      'pnpm',
      'db:migrate',
    ],
    {
      env: {
        ...process.env,
        ALLOW_REMOTE_DATABASE_MIGRATION: 'true',
        CONFIRM_REMOTE_DATABASE_HOST: config.DB_MIGRATION_HOST_CONFIRM,
      },
    },
  );
  if (result.status !== 0) fail('数据库迁移失败；目标详情已从日志省略');
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
  const configPath = targetConfigPath(options, testMode);
  const config = loadTargetConfig(options.target, configPath, options.dryRun);
  const git = inspectGitContext(testMode);
  if (!/^release-v\d+\.\d+\.\d+$/u.test(git.branch)) {
    fail('只能从 release-v<major>.<minor>.<patch> 分支发布');
  }
  const image = `${config.IMAGE_REPO}:sha-${git.sha}`;

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
  process.stdout.write(`镜像标签：sha-${git.sha}\n`);
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

  waitForImageWorkflow(git.branch, git.sha);
  const manifest = run('docker', ['manifest', 'inspect', image]);
  if (manifest.status !== 0) fail('不可变镜像标签不存在或当前账号无权读取');

  const pendingMigrations = checkPendingMigrations(config);
  if (pendingMigrations) {
    if (options.target === 'stage' && !options.backupConfirmed) {
      fail('存在待执行迁移；Stage 必须传入 --backup-confirmed 确认已有恢复点');
    }
    if (options.target === 'production') {
      await promptFor(
        'BACKUP-READY',
        '确认生产库已有可用备份或恢复点，请输入 BACKUP-READY：',
      );
    }
    runMigrations(config);
  }

  const releaseScript =
    config.RELEASE_MODE === 'blue-green'
      ? 'release.sh'
      : 'release-low-memory.sh';
  const remoteCommand = `cd ${config.DEPLOY_DIR} && ./${releaseScript} ${image}`;
  const remote = sshArgs(config, remoteCommand);
  const release = run(remote.executable, remote.args, { env: remote.env });
  if (release.status !== 0) {
    fail('服务器发布失败；远端发布脚本已负责自动回滚');
  }

  await verifyDeployment(config, git.sha);
  process.stdout.write('发布结果：成功\n');
  process.stdout.write(`分支：${git.branch}\n`);
  process.stdout.write(`提交：${git.sha}\n`);
  process.stdout.write(`镜像标签：sha-${git.sha}\n`);
  process.stdout.write(`数据库迁移：${pendingMigrations ? '已执行' : '无需执行'}\n`);
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
