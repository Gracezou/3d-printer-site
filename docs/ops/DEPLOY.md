# Stage 与生产发布

本文描述 `release-v0.3.0` 的目标配置、镜像构建、数据库迁移和服务器发布流程。脚本只发布环境隔离的不可变镜像：`stage-sha-<commit>` 或 `production-sha-<commit>`。

## 配置文件分工

发布涉及两类本地文件，它们必须按环境分开，权限均为 `0600`，且永不提交：

1. `deploy/targets/stage.env` / `deploy/targets/production.env`
   - 服务器连接和发布目标配置。
   - 模板分别为 `deploy/targets/stage.env.example` 和 `production.env.example`。
   - 真实文件由 Grace 填写；不得复制到另一个环境。
2. `.env.stage` / `.env.production`
   - 应用、数据库、Supabase、支付和后台鉴权配置。
   - Stage 只允许 `.env.stage`，且 `APP_ENV=staging`；生产只允许 `.env.production`，且 `APP_ENV=production`。
   - Stage 与生产必须使用不同的 Supabase 项目、支付配置和签名密钥；严禁从 `.env.dev` 复制。
   - `DATABASE_URL` 推荐使用对应项目的 Supabase Session pooler（端口 `5432`）。直连 `db.<project-ref>.supabase.co` 依赖 IPv6；只有运行主机具备 IPv6 或项目已购买 IPv4 附加服务时才使用直连。
   - 发布脚本只用 `APP_RUNTIME_ENV_FILE` 指向的本地文件检查并执行迁移，不会把它上传到服务器。服务器的 `$DEPLOY_DIR/.env` 需在首次发布前由 Grace 单独安全配置。

示例：

```bash
cp deploy/targets/stage.env.example deploy/targets/stage.env
cp .env.stage.example .env.stage
chmod 600 deploy/targets/stage.env .env.stage
```

`.env.stage.example` 与 `.env.example` 的键保持一致，`APP_ENV=staging`。`APP_VERSION` 在模板中保留为注释键；服务器运行配置也应保持该键注释，避免空值覆盖镜像内置的 `v0.3.0+sha-<commit>`。

> 当前仓内已有的 `.env.production` 实际承载的是 `APP_ENV=staging` 预生产配置。建议 Grace 将它改名为 `.env.preprod`，再另建真正的 `.env.production`；本任务不会读取、复制或改名该文件。

## 部署目标键

Grace 需要逐项填写：

- `TARGET_NAME`：固定为 `stage` 或 `production`。
- `SSH_HOST`、`SSH_PORT`、`SSH_USER`：SSH 目标。
- `SSH_AUTH`：推荐 `key`；也可填 `password`。
- `SSH_KEY_PATH`：密钥认证时填写，私钥权限必须为 `0600`。
- `SSH_PASSWORD`：密码认证时填写；本机必须安装 `sshpass`。密码认证安全性较弱，不推荐。
- `DEPLOY_DIR`：服务器部署目录，需已有 Compose 和发布脚本。
- `RELEASE_MODE`：内存充足服务器用 `blue-green`，低内存服务器用 `low-memory`。
- `SITE_URL`、`HEALTH_URL`：发布后的首页和健康检查地址。
- `IMAGE_REPO`：不含标签的 GHCR 镜像仓库。
- `APP_RUNTIME_ENV_FILE`：Stage 固定 `.env.stage`，生产固定 `.env.production`。
- `DB_IDENTITY`：`host:port/database?user=username`。必须与 `DATABASE_URL` 解析出的主机、端口、库名、用户完全一致；Supabase pooler 用户名采用 `<数据库角色>.<project-ref>`，默认角色即 `postgres.<project-ref>`。

脚本不会打印目标文件中的密码、密钥路径、主机、URL、镜像仓库或数据库连接串。默认只提示 SSH 主机已配置；`--quiet-host` 可连该提示也省略。

## SSH 密钥推荐做法

为 Stage 和生产分别创建部署专用密钥，不复用个人密钥；公钥只授予运行发布脚本所需的服务器账号。私钥保存在本机安全目录并设为 `0600`。首次发布前人工核对并保存服务器 host key，脚本强制启用 host key 校验。

生产私钥必须设置口令，并使用 `ssh-add -c <private-key>` 加载到 `ssh-agent`；`-c` 会让每次私钥使用都要求 Grace 在本机确认。生产目标只允许密钥认证；脚本会拒绝 `SSH_AUTH=password`，也会用 `ssh-keygen` 拒绝空口令私钥。

密码认证只作为 Stage 兼容方案。脚本通过 `SSHPASS` 环境变量调用 `sshpass -e`，不会把密码放进命令参数或日志，但仍弱于密钥认证。

## 使用方法

仅检查本地配置、Git 状态并打印计划，不访问 GitHub、数据库或服务器：

```bash
scripts/deploy-target.sh stage --dry-run
```

Stage 正式发布；如果检测到待执行迁移，必须显式确认已有备份或恢复点：

```bash
scripts/deploy-target.sh stage --restore-point=<pitr-or-dump-id>
```

Stage 发布会在工作区干净时自动推送当前 `release-v<major>.<minor>.<patch>` 分支，等待 `release-image.yml` 成功并确认 GHCR 不可变镜像存在，然后检查迁移、执行服务器发布和健康检查。仅当该版本全部功能完成且代码评审、安全审查、独立回归均通过，且没有影响发布的待确认事项时，才属于已授权的 Stage 自动发布范围。

Stage 会将数据库集群与仓内存在的 `.env.dev`、`.env.production`、`.env.preprod` 逐一比较，日志只显示“相同/不同”。Supabase 以项目 ref 识别集群，因此同一项目的直连、session pooler 和 transaction pooler 都会判为相同；其他 PostgreSQL 以主机和库名识别并忽略端口。共用数据库默认拒绝；Grace 明确接受后，按实际目标增加例如 `--accept-shared-database=dev`，该例外会写入发布摘要。生产则与 dev、stage、preprod 做同样检查，发现共用时一律拒绝且没有例外参数。

生产发布必须先取得 Grace 在频道中的本次明确批准，再执行：

```bash
scripts/deploy-target.sh production --i-have-grace-approval
```

生产流程还会要求交互输入目标站点域名。存在迁移时，命令还必须带 `--restore-point=<id>`，并再次交互输入 `BACKUP-READY`。生产目标绝不自动执行 `git push`；当前提交必须已经位于上游分支。合并 `master`、打 tag、生产配置变更和生产数据库迁移同样必须单独取得 Grace 批准。

## 数据库迁移

脚本先用目标应用运行配置查询 `drizzle.__drizzle_migrations`，只输出 `current` / `pending` 状态，不输出数据库地址。发现待执行迁移后才调用：

```bash
pnpm db:migrate
```

部署脚本先校验本地 `DATABASE_URL` 与 `DB_IDENTITY` 完全一致，再从身份中派生 host，设置 `ALLOW_REMOTE_DATABASE_MIGRATION=true` 与 `CONFIRM_REMOTE_DATABASE_HOST`，保留既有迁移双重确认。迁移前还会通过 SSH 使用 `docker compose run`，按应用相同的 `env_file` 规则读取 `$DEPLOY_DIR/.env`、计算完整数据库身份的 SHA-256；服务器只回传哈希，本地与服务器不一致时拒绝迁移和发布。连接串中的多主机或 `host`、`hostaddr`、`port`、`dbname`、`user` 查询参数会被拒绝。

`pnpm db:migrate` 不再隐式读取 `.env.dev`。本地手工迁移示例：

```bash
pnpm exec dotenv -e .env.dev --override -- pnpm db:migrate
```

## CI 与镜像

`release-image.yml` 明确监听 `release-v0.3.0`，没有改成 `release-v*` 通配。普通 push 使用 GitHub `stage` Environment；生产镜像必须由 Grace 批准后手工触发 workflow，选择 `production` Environment。相同 SHA 的两个环境使用不同标签，不能互相覆盖：

- Stage 标签：`stage-sha-<commit>`
- 生产标签：`production-sha-<commit>`
- 健康检查版本：从 release 分支或 tag 推导版本，例如 `v0.3.0+sha-<commit>`

Stage 构建同时保留旧版 `sha-<commit>` 兼容标签，供 v0.2.x 热修分支的既有发布脚本使用；生产构建不写该兼容标签，不能覆盖 Stage 镜像。

Grace 需要在 GitHub 分别创建 `stage`、`production` Environment，并在每个 Environment 级仅配置一个 JSON 变量 `BUILD_CONFIG`。不要在仓库级或组织级创建同名变量。结构如下，所有值均为占位示例：

```json
{
  "environment": "stage",
  "NEXT_PUBLIC_SITE_URL": "https://stage.example.com",
  "NEXT_PUBLIC_ICP_LICENSE": "STAGE-NOT-APPLICABLE",
  "NEXT_PUBLIC_SUPABASE_URL": "https://stage-project.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY": "replace-with-stage-anon-key"
}
```

生产 Environment 将 `environment` 改为 `production` 并填写生产专属值。Stage 若没有备案号，`NEXT_PUBLIC_ICP_LICENSE` 可填 `STAGE-NOT-APPLICABLE` 等明确占位值；字段仍不得留空。CI 从这一个 JSON 原子读取全部构建参数，断言 `environment` 与当前构建目标一致、四个 `NEXT_PUBLIC_*` 字段均为非空单行字符串，再注入构建；回退到另一环境的配置时会因环境标记不匹配而失败。

GitHub 对 Environment 缺失变量的回退没有来源标记：如果仓库级或组织级恰好存在同名且 `environment` 也相同的 `BUILD_CONFIG`，CI 无法区分。生产首发前及每次调整构建配置后，Grace 必须人工执行以下命令，确认两层均不存在 `BUILD_CONFIG`；组织未使用 Actions variables 时可跳过第二条：

```bash
gh variable list
gh variable list --org <org>
```

这些 `NEXT_PUBLIC_*` 值最终都会进入浏览器前端，属于公开构建信息。如果仍希望避免 `BUILD_CONFIG` 整段出现在步骤日志中，可将它改存为对应 Environment 的 secret，并同步把 workflow 引用从 `vars.BUILD_CONFIG` 改为 `secrets.BUILD_CONFIG`。生产 Environment 还应配置 Grace 为 required reviewer，防止代理自行构建生产镜像。

## 服务器前置条件

`DEPLOY_DIR` 中需预先放置并授权执行：

- `compose.yaml`
- `.env`（对应环境的服务器运行配置，权限 `0600`）
- 蓝绿模式：`release.sh` 及 Nginx upstream 配置
- 低内存模式：`release-low-memory.sh`、`compose.low-memory.yaml`

蓝绿模式在候选实例健康后切换 Nginx；失败时保持原实例。低内存模式先拉取镜像再 stop-start，失败时自动恢复 `.active-release` 记录的上一镜像。

## 发布后验证与回滚

脚本要求：

1. `HEALTH_URL` 返回成功，JSON `version` 包含本次完整 SHA。
2. `SITE_URL` 最终返回 HTTP 200。
3. 摘要只输出分支、提交、环境 SHA 标签、恢复点标识、共享数据库例外、迁移结果和健康检查结果，不输出目标配置值。

发布脚本在成功切换时把新镜像写入 `ACTIVE_IMAGE`，把原镜像写入 `PREVIOUS_IMAGE`。发布命令内部失败会自动回滚；发布成功但公网验证失败时，脚本会报告上一镜像标签，需要人工在服务器执行：

```bash
cd <DEPLOY_DIR>
. ./.active-release
test -n "$PREVIOUS_IMAGE"
# RELEASE_MODE=blue-green：
./release.sh "$PREVIOUS_IMAGE"
# RELEASE_MODE=low-memory：
./release-low-memory.sh "$PREVIOUS_IMAGE"
```

数据库迁移默认只前向执行；涉及数据库兼容性时按版本对应迁移/回滚手册处理，不能用旧镜像盲目回滚数据库结构。回滚后在频道汇报失败点、镜像 SHA、恢复点、迁移是否已执行和回滚结果。
