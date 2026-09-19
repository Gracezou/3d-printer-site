# 环境变量参考

本文是 3D 打印独立站唯一的环境变量参考。所有键的用途、是否必填、适用环境、敏感性、示例占位值与代码读取位置，都以 `release-v0.3.0` 分支上的代码实际读取为准，而非模板注释。各 `.example` 模板只是按本文口径生成的占位文件；真实值只存在于本机被 git 忽略、权限为 `0600` 的私有文件中，**严禁提交或写进任何文档**。

> **安全红线**：本文及任何 `.example` 模板一律只使用占位值（`<...>`、`example.com`、`openssl rand ...` 生成示意等），绝不出现密码、密钥、token、真实服务器 IP、真实数据库地址或真实站点域名。后台账号、支付宝沙箱账号等凭据由 Grace 单独发放，不落文档。

## 一、总表

下表覆盖代码读取的全部环境变量，按职责分组。列「敏感=是」表示该值一旦泄露可直接造成危害（密钥/凭据/含凭据的连接串），必须只保存在 `0600` 私有文件中。

| 变量 | 分类 | 用途 | 必填 | 适用环境 | 敏感 | 示例占位值 | 代码读取位置（文件:行号） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `APP_ENV` | 应用运行 | 环境标识；脚本与发布流程据此校验环境 | 是（stage/生产） | dev/stage/生产 | 否 | `development` / `staging` / `production` | `scripts/preprod-data.ts:74`；`scripts/stage-initialize.ts:188`；`scripts/deploy-target.ts:382` |
| `APP_VERSION` | 应用运行 | 健康检查返回的应用版本；镜像部署时由构建写入 | 否 | 全部 | 否 | `v0.3.0+sha-<commit>`（运行时留空） | `src/app/api/health/route.ts:17` |
| `LOG_LEVEL` | 应用运行 | 服务端日志级别 | 否 | 全部 | 否 | `info`（可选 trace/debug/info/warn/error/fatal） | `src/lib/logger.ts:34` |
| `DATABASE_URL` | 数据库 | PostgreSQL 连接串（Drizzle/Postgres.js 服务端） | 是 | dev/stage/生产/沙箱 | 是（含凭据） | `postgresql://USER:PASSWORD@HOST:5432/DB` | `src/lib/db/client.ts:24`；`drizzle.config.ts:5` |
| `DATABASE_POOL_MAX` | 数据库 | 单实例最大数据库连接数 | 否（默认 5） | 全部 | 否 | `5`（Supabase 小池建议 3） | `src/lib/db/client.ts:15` |
| `SUPABASE_URL` | Supabase | Supabase 项目地址（服务端 storage/next.config 封装） | 是 | dev/stage/生产/沙箱 | 否 | `https://<project-ref>.supabase.co` | `src/lib/storage.ts:23` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | service_role 密钥，仅服务端使用 | 是 | dev/stage/生产/沙箱 | 是 | `<service-role-key>` | `src/lib/storage.ts:24` |
| `SUPABASE_STORAGE_BUCKET` | Supabase | 商品图/GLB/售后凭证公开 Storage bucket | 否（默认 `products`） | 全部 | 否 | `products` | `src/lib/validators/return-request.ts:115` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | 浏览器端邮箱 OTP Auth 项目地址 | 是 | dev/stage/生产/沙箱 | 否（公开） | `https://<project-ref>.supabase.co` | `src/lib/auth/supabase-server.ts:12`；`next.config.ts:5` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | 浏览器端 anon/publishable key | 是 | dev/stage/生产/沙箱 | 否（公开） | `<anon-key>` | `src/lib/auth/supabase-server.ts:13` |
| `ADMIN_JWT_SECRET` | 后台鉴权 | 后台 JWT HS256 签名密钥 | 是 | dev/stage/生产/沙箱 | 是 | `openssl rand -base64 48`（≥32 字符） | `src/lib/auth/admin-token.ts:17` |
| `SESSION_COOKIE_SECURE` | 后台鉴权 | 会话 Cookie 是否仅 HTTPS | 否（按 NODE_ENV 缺省） | dev/stage/生产 | 否 | `false`（本地）/ `true`（HTTPS） | `src/lib/auth/session-cookie.ts:3` |
| `ALIPAY_APP_ID` | 支付宝 | 开放平台应用 ID | 是 | dev/stage/生产/沙箱 | 否 | `<app-id>` | `src/lib/services/payment/alipay.provider.ts:65` |
| `ALIPAY_PRIVATE_KEY` | 支付宝 | 应用 RSA2 私钥，仅服务端 | 是 | dev/stage/生产/沙箱 | 是 | `<app-private-key>` | `src/lib/services/payment/alipay.provider.ts:66` |
| `ALIPAY_PUBLIC_KEY` | 支付宝 | 支付宝公钥（非应用公钥），异步通知验签 | 是 | dev/stage/生产/沙箱 | 是 | `<alipay-public-key>` | `src/lib/services/payment/alipay.provider.ts:67` |
| `ALIPAY_GATEWAY` | 支付宝 | 支付宝网关；留空默认生产网关 | 否 | dev/stage/生产/沙箱 | 否 | 生产 `https://openapi.alipay.com/gateway.do`；沙箱 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` | `src/lib/services/payment/alipay.provider.ts:76` |
| `ALIPAY_NOTIFY_URL` | 支付宝 | 异步通知地址（公网 HTTPS） | 是 | dev/stage/生产/沙箱 | 否 | `https://example.com/api/payments/alipay/notify` | `src/lib/services/payment.service.ts:45` |
| `ALIPAY_RETURN_URL` | 支付宝 | 支付完成同步跳转地址（非成功依据） | 是 | dev/stage/生产/沙箱 | 否 | `https://example.com/api/payments/alipay/return` | `src/lib/services/payment.service.ts:46` |
| `NEXT_PUBLIC_SITE_URL` | 站点公开 | 站点对外根地址（不带末尾斜杠） | 是 | dev/stage/生产/沙箱 | 否（公开） | `http://localhost:5003`（本地） | `src/app/api/payments/alipay/return/route.ts:10` |
| `NEXT_PUBLIC_ICP_LICENSE` | 站点公开 | 工信部 ICP 备案号（前台页脚） | 否 | dev/stage/生产 | 否（公开） | 留空或备案号占位 | `src/components/shop/site-footer.tsx:11` |
| `CRON_SECRET` | 定时任务 | Cron 接口 Bearer Token | 是（启用定时任务时） | stage/生产/服务器 cron | 是 | `openssl rand -base64 48`（≥32 字符） | `src/lib/auth/cron.ts:15`；`deploy/cron/run-cron.sh` |
| `ENABLE_MOCK_PAYMENT` | 功能开关 | 是否启用本地 Mock 支付；生产必须 false | 否（默认 false） | dev/stage/生产/沙箱 | 否 | `false` | `src/lib/services/payment/provider.factory.ts:18` |
| `DEMO_ADMIN_PASSWORD` | 功能开关 | 演示运营员密码；留空则随机生成 | 否 | dev | 是 | 留空（随机生成） | `scripts/demo-data.ts:858` |
| `ALLOW_DEMO_DATA` | 功能开关 | 生产模式默认禁止播种演示数据 | 否（默认 false） | dev | 否 | `false` | `scripts/demo-data.ts:836` |
| `CONFIRM_PREPROD_RESET` | 功能开关 | 预生产精简数据重置确认值；日常留空 | 否 | 预生产 | 否 | 留空（单次命令传入） | `scripts/preprod-data.ts:80` |

### 部署目标键（`deploy/targets/*.env`）

这些键由 `scripts/deploy-target.ts` 从部署目标文件读取（`parseEnvText` → `loadTargetConfig`），不是 `process.env`。键清单见 `scripts/deploy-target.ts:58` 的 `targetKeys`。

| 变量 | 用途 | 必填 | 敏感 | 示例占位值 | 校验位置（`scripts/deploy-target.ts`） |
| --- | --- | --- | --- | --- | --- |
| `TARGET_NAME` | 固定 `stage` 或 `production`，与命令行目标一致 | 是 | 否 | `stage` / `production` | `:345` |
| `SSH_HOST` | SSH 主机名或 IP | 是 | 是 | `<server-host>` | `:347` |
| `SSH_PORT` | SSH 端口 | 是 | 否 | `22` | `:348` |
| `SSH_USER` | SSH 登录用户 | 是 | 否 | `<ssh-user>` | `:352` |
| `SSH_AUTH` | 认证方式 `key` 或 `password` | 是 | 否 | `key` | `:355` |
| `SSH_KEY_PATH` | 密钥认证时本机私钥路径（0600） | `key` 时必填 | 是 | `~/.ssh/3d-printer-stage` | `:388` |
| `SSH_PASSWORD` | 密码认证时填写（需 sshpass） | `password` 时必填 | 是 | 留空（密钥认证） | `:393` |
| `DEPLOY_DIR` | 服务器部署目录 | 是 | 是 | `/opt/3d-printer-site` | `:357` |
| `RELEASE_MODE` | 发布模式 `blue-green` 或 `low-memory` | 是 | 否 | `blue-green` | `:363` |
| `SITE_URL` | 发布后首页检查 URL | 是 | 是 | `https://stage.example.com` | `:366` |
| `HEALTH_URL` | 健康检查 URL（与 SITE_URL 同主机） | 是 | 是 | `https://stage.example.com/api/health` | `:366` |
| `IMAGE_REPO` | 无标签 GHCR 镜像仓库 | 是 | 是 | `ghcr.io/<owner>/<repo>` | `:369` |
| `APP_RUNTIME_ENV_FILE` | Stage 固定 `.env.stage`，生产固定 `.env.production` | 是 | 否 | `.env.stage` / `.env.production` | `:373` |
| `DB_IDENTITY` | `host:port/database?user=username`，须与 DATABASE_URL 一致 | 是 | 是 | `host:5432/db?user=postgres.<project-ref>` | `:375` |

### 服务器 Cron 键（`deploy/cron/3d-printer-site-cron.env.example`）

安装为服务器 `/etc/default/3d-printer-site-cron`（root 所有，权限 `0600`），由 `deploy/cron/run-cron.sh` 读取；`deploy/cron/install.sh` 从应用运行配置的 `NEXT_PUBLIC_SITE_URL` 与 `CRON_SECRET` 自动生成。

| 变量 | 用途 | 必填 | 敏感 | 示例占位值 | 读取位置 |
| --- | --- | --- | --- | --- | --- |
| `APP_BASE_URL` | 站点根地址，用于拼 Cron 接口 URL | 是 | 否 | `https://staging.example.com` | `deploy/cron/run-cron.sh` |
| `CRON_SECRET` | Cron 接口 Bearer Token | 是 | 是 | `replace-with-a-random-secret` | `deploy/cron/run-cron.sh` |

### GitHub Environment `BUILD_CONFIG`（CI 构建参数）

不是本地 `.env` 文件，而是 GitHub 每个 Environment（`stage` / `production`）级配置的单个 JSON 变量，由 `.github/workflows/release-image.yml` 以 `vars.BUILD_CONFIG` 注入，`scripts/resolve-build-config.ts` 解析并校验。JSON 结构（占位值）：

```json
{
  "environment": "stage",
  "NEXT_PUBLIC_SITE_URL": "https://stage.example.com",
  "NEXT_PUBLIC_ICP_LICENSE": "STAGE-NOT-APPLICABLE",
  "NEXT_PUBLIC_SUPABASE_URL": "https://stage-project.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY": "replace-with-stage-anon-key"
}
```

| 键 | 用途 | 必填 | 敏感 | 校验 |
| --- | --- | --- | --- | --- |
| `environment` | 目标环境 `stage` / `production`，须与构建目标一致 | 是 | 否 | `scripts/resolve-build-config.ts` 断言与 `process.argv[2]` 一致 |
| `NEXT_PUBLIC_SITE_URL` | 注入前端站点根地址 | 是 | 否（公开） | 非空单行字符串 |
| `NEXT_PUBLIC_ICP_LICENSE` | 注入前台备案号；无备案填明确占位值 | 是 | 否（公开） | 非空单行字符串 |
| `NEXT_PUBLIC_SUPABASE_URL` | 注入前端 Supabase 地址 | 是 | 否（公开） | 非空单行字符串 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 注入前端 anon key | 是 | 否（公开） | 非空单行字符串 |

四个 `NEXT_PUBLIC_*` 值最终进入浏览器前端，属公开构建信息。CI 从这一份 JSON 原子读取全部构建参数；`environment` 与构建目标不一致、字段为空或含换行都会失败。

### 脚本/CI 传参专用键（代码在用但有意不进入 `.env` 模板）

以下键被代码读取，但属于脚本防呆确认、dry-run 覆盖或 CI 内置变量，**不应写入任何 `.env` 模板**；只通过命令行临时环境或 GitHub Actions 注入。

| 变量 | 用途 | 敏感 | 代码读取位置 |
| --- | --- | --- | --- |
| `ALLOW_REMOTE_DATABASE_MIGRATION` | 远程库迁移放行开关（`true`）；否则只允许 localhost/127.0.0.1 | 否 | `scripts/assert-local-database.ts:32`；`scripts/deploy-target.ts:892,936` |
| `CONFIRM_REMOTE_DATABASE_HOST` | 远程迁移目标主机确认，须与 DATABASE_URL 主机一致 | 是 | `scripts/assert-local-database.ts:33` |
| `ALLOW_REMOTE_TEST_DATABASE` | 退款联调测试库放行开关（`true`） | 否 | `scripts/assert-local-database.ts:19` |
| `CONFIRM_DEVICE_CATALOG_SEED` | 设备目录播种确认值 | 否 | `scripts/device-catalog.ts:34` |
| `CONFIRM_STAGE_DATABASE_SEED` | Stage 库播种确认值 | 否 | `scripts/stage-initialize.ts:217` |
| `STAGE_INIT_REHEARSAL_ROOT` | Stage 初始化排练根目录（dry-run） | 否 | `scripts/stage-initialize.ts:125` |
| `DEPLOY_TARGET_CONFIG` | 覆盖部署目标文件路径（仅 dry-run，须位于 `.local/`） | 是 | `scripts/deploy-target.ts:502` |
| `DEPLOY_RUNTIME_ENV_OVERRIDE` | 覆盖运行配置路径（仅 dry-run，须位于 `.local/`） | 是 | `scripts/deploy-target.ts:994` |
| `DEPLOY_RUNTIME_SCAN_ROOT` | 数据库互斥检查对照目录（仅 dry-run） | 是 | `scripts/deploy-target.ts:518` |
| `DEPLOY_TARGET_TEST_MODE` | 部署 dry-run 测试模式开关（`1`） | 否 | `scripts/deploy-target.ts:982` |
| `NODE_ENV` | Next.js 内置运行环境；影响日志级别与会话 Cookie 缺省 | 否 | `src/lib/logger.ts:35`；`src/lib/auth/session-cookie.ts:2` |
| `GITHUB_ENV` | GitHub Actions 内置，指向 `$GITHUB_ENV` 文件，非业务变量 | 否 | `.github/workflows/release-image.yml` |

## 二、配置文件分工

| 文件/来源 | 角色 | 真实文件 | git 忽略 | 权限 | 模板 |
| --- | --- | --- | --- | --- | --- |
| `.env.example` | 本地开发运行配置模板 | `.env.dev`（仓库未托管） | 是（`.env.*`） | 0600 | 自身 |
| `.env.stage.example` | Stage 应用运行配置模板 | `.env.stage` | 是（`.env.*`） | 0600 | 自身 |
| `.env.sandbox.example` | 沙箱退款回归专用配置模板 | `.env.sandbox` | 是（`.env.*`） | 0600 | 自身 |
| `deploy/targets/stage.env.example` | Stage 部署目标模板 | `deploy/targets/stage.env` | 是（`deploy/targets/*.env`） | 0600 | 自身 |
| `deploy/targets/production.env.example` | 生产部署目标模板 | `deploy/targets/production.env` | 是（`deploy/targets/*.env`） | 0600 | 自身 |
| `deploy/.env.production.example` | 服务器 `$DEPLOY_DIR/.env` 运行时配置模板（Compose `env_file` 用） | 服务器 `/opt/3d-printer-site/.env`（本机不放真实值） | 是（`.env.*`） | 0600 | 自身 |
| `deploy/cron/3d-printer-site-cron.env.example` | 服务器 Cron 环境模板 | 服务器 `/etc/default/3d-printer-site-cron` | 不适用（服务器文件） | 0600 | 自身 |
| `deploy/cron/3d-printer-site.cron.example` | Cron 调度模板（**不是环境变量**） | 服务器 `/etc/cron.d/3d-printer-site` | 不适用 | 0644 | 自身 |
| GitHub Environment `BUILD_CONFIG` | CI 构建参数（JSON） | 无本地文件 | 不适用 | 不适用 | 见上文 JSON |

三份 `.example` 为 git 忽略白名单：`.gitignore` 通过 `!.env.example`、`!.env.stage.example`、`!.env.sandbox.example`、`!deploy/.env.production.example`、`!deploy/targets/*.env.example` 保留模板，其余 `.env*` 与 `deploy/targets/*.env` 一律忽略。

## 三、模板有 / 无 的核对结论

- **「模板有但代码不用」**：经逐键核对，三个运行配置模板（`.env.example`、`.env.stage.example`、`.env.sandbox.example`）与 `deploy/.env.production.example` 中出现的键均被代码读取，**未发现模板有但代码不用的键**。
- **「代码在用但模板缺失」**：即上表「脚本/CI 传参专用键」一节所列变量。它们被代码读取但有意不进入 `.env` 模板（防呆确认值、dry-run 覆盖、CI 内置变量），以免误当成常规配置长期写入。

## 四、维护约定

- 新增环境变量必须同步更新本文总表与其对应的 `.example` 模板；注释措辞与分组顺序以本文为准。
- 本文与模板只能出现占位值；真实值只存在于 `0600` 私有文件，永不提交。
- 部署流程相关变量（部署目标键、Cron 键、`BUILD_CONFIG`）的填写流程见 [`DEPLOY.md`](./DEPLOY.md)；沙箱退款回归的填写安全约束见 [`../v0.3.0/ALIPAY-SANDBOX-REFUND-RUNBOOK.md`](../v0.3.0/ALIPAY-SANDBOX-REFUND-RUNBOOK.md)。
