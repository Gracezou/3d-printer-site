# v0.2.0 部署任务审核稿

- 状态：**已审核，实施中（临时 IP 验收）**
- 目标主机：华为云 Flexus L 新加坡，2 核 2G / 40G
- 基线：Git Tag `v0.1.0`，开发分支 `dev-0.2`
- 依据：`CHANGES-v0.2.0.md` §2、§3、§6、§7、§8 与 v0.1.0 `TASKS.md` T104–T107

> [!WARNING]
> 本阶段只允许虚构测试数据和支付宝沙箱，禁止接入真实用户、真实个人信息或生产资金。

## 1. 已确认决策

1. 服务器保持 2 核 2G，**不配置 swap**。
2. 禁止在服务器上执行 `next build` 或 Docker 镜像构建。
3. 由 GitHub Actions 使用 Node.js 22（pnpm 11.22 的最低要求）构建 linux/amd64 不可变镜像，最终运行层保持 Node.js 20，服务器只拉取镜像并启动。
4. 域名就绪前，应用临时映射公网 `0.0.0.0:5003 -> 容器 3000`，通过 `http://188.239.16.167:5003` 验收；域名就绪后改为仅绑定 loopback 并接入 Nginx。
5. 保留服务器上宝塔的 Node.js 22，本应用的 Node.js 20 仅存在于容器。
6. Supabase 使用新加坡 `ap-southeast-1`，PostgreSQL 使用 Supavisor `6543` transaction 连接池。
7. 已有 `cliproxy` 容器保留数据但停止运行，且不随 Docker 自启。
8. 按用户决定保留宝塔 `888/8888` 公网入口；它们是“仅开放 22/80/443”原验收条件的明确例外。
9. 当前不申请 Let's Encrypt 证书，因此无需通知邮箱；域名确定后补做 HTTPS。

## 2. 审核前必须补齐

- [ ] 固定部署域名，A/AAAA 记录已指向目标主机（不阻塞 IP 验收）
- [ ] Let's Encrypt 通知邮箱（不阻塞 IP 验收）
- [ ] GitHub Container Registry 包名与镜像可见性（推荐 private）
- [ ] 服务器只读 GHCR Token，仅保存在 Root 的 Docker credential store
- [ ] 可用的 SSH 公钥；验证后禁用 Root 密码登录
- [x] 保留宝塔 `888/8888` 公网入口，登记为已接受的安全例外
- [ ] 完整的服务端 `.env`，由用户在服务器上注入，不通过 GitHub Artifact 或仓库传输
- [ ] Supabase Email provider 已启用，Magic Link 邮件模板包含 `{{ .Token }}`，对外验收前已配置自定义 SMTP
- [ ] 沙箱支付宝应用、密钥、网关、回调地址与沙箱买家账号

## 3. T105 代码变更任务

### D01 健康检查

- 新增 `GET /api/health`，返回应用状态、版本和数据库 `SELECT 1` 结果。
- 健康接口不返回连接串、主机名、异常堆栈或任何密钥。
- 验收：正常时 HTTP 200，数据库不可用时 HTTP 503。

### D02 生产镜像

- 新增多阶段 `Dockerfile`，构建层锁定 Node.js 22、运行层锁定 Node.js 20，pnpm lockfile frozen install，Next.js standalone 运行。
- 构建阶段只接收必需的 `NEXT_PUBLIC_*` 变量，不接收 Service Role、数据库、JWT 或支付私钥。
- 运行阶段使用非 Root 用户，只包含 standalone/server/static 产物。
- 镜像标签同时生成 Git SHA 与环境别名，部署必须锁定 SHA，禁止仅依赖 `latest`。

### D03 Compose 运行时

- 路径：`/opt/3d-printer-site/compose.yaml` 与 `/opt/3d-printer-site/.env`。
- `.env` 权限 `0600`，目录与部署脚本仅 Root 可写。
- IP 验收阶段绑定 `0.0.0.0:5003:3000`；域名上线后切换为 `127.0.0.1:3000:3000`，并增加 HTTP healthcheck。
- 2G 且无 swap 时，初始限制容器内存 768MiB，`NODE_OPTIONS=--max-old-space-size=512`。
- 使用 Docker `json-file` 日志轮转：单文件 10MiB，最多 5 个。

### D04 CI 镜像发布

- GitHub Actions 在 push 到 `dev-0.2` 或手动触发时执行 typecheck、lint、unit test、production build 和安全审计。
- 通过 GitHub OIDC/`GITHUB_TOKEN` 推送 GHCR，不保存长期 Registry 写 Token。
- 不在 CI 自动 SSH 生产主机；首版使用服务器端显式发布命令，保留人工审核点。

### D05 发布脚本

- 输入为完整 Git SHA 镜像标签；拒绝空值、`latest` 和非法标签。
- 顺序：拉取镜像 → 一次性迁移任务 → Compose 更新 → 等待 healthcheck → 本机 HTTP 验证。
- 任一步失败时恢复旧镜像标签，并输出容器日志摘要。
- 数据库迁移只允许前向兼容；发布前生成一份数据库备份或 Supabase PITR 恢复点。

### D06 Nginx 与 HTTPS

- 在宝塔 Nginx vhost 目录新增独立配置，反向代理到 `127.0.0.1:3000`。
- 配置 WebSocket/HTTP 必需头、超时、上传上限、静态资源缓存和安全响应头。
- Certbot 使用 webroot 签发，续期 hook 调用宝塔 Nginx reload，不由 Certbot 自动重写 vhost。
- 验收：HTTP 跳转 HTTPS，HTTPS 返回 200，`certbot renew --dry-run` 通过。

### D07 定时任务

- 复用 `deploy/cron/` 中的包装脚本与模板。
- `CRON_SECRET` 仅存在 Root 可读环境文件，禁止出现在 crontab 命令行、进程参数或日志中。
- 安装后手工执行三个端点，再验证容器重启后 cron 仍可用。

## 4. 服务器实施顺序

1. IP 验收阶段先确认 GHCR；DNS、证书邮箱与 SSH 公钥列为上线前收尾项。
2. 创建 `/opt/3d-printer-site`，写入 `0600` 环境文件和只读 Registry 登录。
3. 在空的新加坡 Supabase 上执行迁移和基础 seed，启用邮箱 OTP 模板；演示 seed 需额外确认 `ALLOW_DEMO_DATA=true`。
4. 部署指定 SHA 镜像，验证 `127.0.0.1:5003/api/health` 和公网 `http://188.239.16.167:5003/api/health`。
5. 域名就绪后安装 Nginx vhost，再申请证书、启用 HTTPS 和跳转，同时撤销公网 5003。
6. 安装 cron，逐项执行 T105 验收。
7. T105 通过后才配置支付宝沙箱并执行 T106。

## 5. 回滚方案

- 应用：Compose 恢复上一个 Git SHA 镜像，等待 healthcheck 后切回 Nginx。
- Nginx：恢复改动前 vhost 备份，执行 `nginx -t` 后 reload。
- Cron：移除本项目独立 `/etc/cron.d/` 文件，不改动其他定时任务。
- 数据库：代码回滚不自动反向执行 DDL；使用发布前备份/PITR 处理不可向前兼容的故障。
- 服务器加固：恢复 `/root/t104-backup-20260831-0224`中的 SSH、UFW 或 Nginx 配置。

## 6. T105 验收门禁

- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm security:audit` 全部通过
- [ ] 镜像内以非 Root 用户运行，无 `.env`、Git 元数据、Service Role 或支付私钥
- [ ] IP 验收阶段容器仅额外开放 5003，内存和日志限制生效
- [ ] `/api/health` 本机和公网 `http://188.239.16.167:5003` 均返回 200
- [ ] 域名上线后 HTTP 自动跳转 HTTPS，TLS 证书链正确，`certbot renew --dry-run` 通过
- [ ] 防火墙和云安全组仅保留经审核的入站端口
- [ ] 三个 cron 端点鉴权、手工触发、调度和容器重启恢复通过
- [ ] 测试邮箱能收到 6 位 OTP 并登录，个人资料联系电话能带入新建收货地址
- [ ] 旧镜像回滚演练成功，并确认数据库迁移前向兼容
- [ ] 未导入真实用户或生产支付数据

## 7. 审核结论

部署方案已获用户确认。当前按临时 IP + 5003 完成应用发布和验收；域名、Nginx 与 HTTPS 延后实施。
