# Stage 与生产发布

本文描述 `release-v0.3.0` 的目标配置、镜像构建、数据库迁移和服务器发布流程。脚本默认只发布不可变的 `sha-<commit>` 镜像。

## 配置文件分工

发布涉及两类本地文件，它们必须按环境分开，权限均为 `0600`，且永不提交：

1. `deploy/targets/stage.env` / `deploy/targets/production.env`
   - 服务器连接和发布目标配置。
   - 模板分别为 `deploy/targets/stage.env.example` 和 `production.env.example`。
   - 真实文件由 Grace 填写；不得复制到另一个环境。
2. `.env.stage` / `.env.production`
   - 应用、数据库、Supabase、支付和后台鉴权配置。
   - Stage 从 `.env.stage.example` 创建，生产从 `.env.example` 或现有生产模板逐项核对。
   - Stage 与生产必须使用不同的 Supabase 项目、支付配置和签名密钥；严禁从 `.env.dev` 复制。
   - 发布脚本只用 `APP_RUNTIME_ENV_FILE` 指向的本地文件检查并执行迁移，不会把它上传到服务器。服务器的 `$DEPLOY_DIR/.env` 需在首次发布前由 Grace 单独安全配置。

示例：

```bash
cp deploy/targets/stage.env.example deploy/targets/stage.env
cp .env.stage.example .env.stage
chmod 600 deploy/targets/stage.env .env.stage
```

`.env.stage.example` 与 `.env.example` 的键保持一致，`APP_ENV=staging`。`APP_VERSION` 在模板中保留为注释键；服务器运行配置也应保持该键注释，避免空值覆盖镜像内置的 `v0.3.0+sha-<commit>`。

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
- `APP_RUNTIME_ENV_FILE`：本地对应环境的应用运行配置。
- `DB_MIGRATION_HOST_CONFIRM`：必须与该环境 `DATABASE_URL` 的 hostname 完全一致。

脚本不会打印目标文件中的密码、密钥路径、主机、URL、镜像仓库或数据库连接串。默认只提示 SSH 主机已配置；`--quiet-host` 可连该提示也省略。

## SSH 密钥推荐做法

为 Stage 和生产分别创建部署专用密钥，不复用个人密钥；公钥只授予运行发布脚本所需的服务器账号。私钥保存在本机安全目录并设为 `0600`。首次发布前人工核对并保存服务器 host key，脚本不会自动关闭 SSH host key 校验。

密码认证仅为兼容方案。脚本通过 `SSHPASS` 环境变量调用 `sshpass -e`，不会把密码放进命令参数或日志，但仍弱于密钥认证。

## 使用方法

仅检查本地配置、Git 状态并打印计划，不访问 GitHub、数据库或服务器：

```bash
scripts/deploy-target.sh stage --dry-run
```

Stage 正式发布；如果检测到待执行迁移，必须显式确认已有备份或恢复点：

```bash
scripts/deploy-target.sh stage --backup-confirmed
```

Stage 发布会在工作区干净时自动推送当前 `release-v<major>.<minor>.<patch>` 分支，等待 `release-image.yml` 成功并确认 GHCR 不可变镜像存在，然后检查迁移、执行服务器发布和健康检查。仅当该版本全部功能完成且代码评审、安全审查、独立回归均通过，且没有影响发布的待确认事项时，才属于已授权的 Stage 自动发布范围。

生产发布必须先取得 Grace 在频道中的本次明确批准，再执行：

```bash
scripts/deploy-target.sh production --i-have-grace-approval
```

生产流程还会要求交互输入目标站点域名。存在迁移时，需再次交互输入 `BACKUP-READY`。生产目标绝不自动执行 `git push`；当前提交必须已经位于上游分支。合并 `master`、打 tag、生产配置变更和生产数据库迁移同样必须单独取得 Grace 批准。

## 数据库迁移

脚本先用目标应用运行配置查询 `drizzle.__drizzle_migrations`，只输出 `current` / `pending` 状态，不输出数据库地址。发现待执行迁移后才调用：

```bash
pnpm db:migrate
```

部署脚本会同时设置 `ALLOW_REMOTE_DATABASE_MIGRATION=true` 与 `CONFIRM_REMOTE_DATABASE_HOST`；后者来自 `DB_MIGRATION_HOST_CONFIRM`，必须与 `DATABASE_URL` 的 hostname 完全一致。`pnpm db:migrate` 不再隐式读取 `.env.dev`，手工迁移时必须显式加载正确的环境文件并遵守同一双重确认规则。

## CI 与镜像

`release-image.yml` 明确监听 `release-v0.3.0`，没有改成 `release-v*` 通配。这样未来新 release 分支不会在未经核对时自动获得镜像发布能力。镜像版本和标签均包含完整提交 SHA：

- 镜像标签：`sha-<commit>`
- 健康检查版本：`v0.3.0+sha-<commit>`

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
3. 摘要只输出分支、提交、`sha-<commit>` 标签、迁移结果和健康检查结果，不输出目标配置值。

发布失败时，服务器发布脚本自动回滚。若发布已成功但之后的公网验证失败，立即在服务器按相同发布模式重新发布 `.active-release` 中记录的上一镜像，并在频道汇报失败点、镜像 SHA、迁移是否已执行和回滚结果。数据库迁移默认只前向执行；涉及数据库兼容性时按版本对应迁移/回滚手册处理，不能用旧镜像盲目回滚数据库结构。
