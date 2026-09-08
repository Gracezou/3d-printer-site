# v0.2.1 生产服务器选型、主机规范与转生产检查清单

- 状态：**阶段一、阶段二已实施，待预生产发布**
- 决策日期：2026-09-08
- 适用对象：新购华为云 Flexus L 新加坡实例（先做预生产，验收通过后原地转生产）
- 当前主机 IP：`188.239.16.176`
- 关系：本文件补充 `docs/v0.2.0/DEPLOYMENT-PLAN-v0.2.0.md`。凡与该文件冲突之处，**本文件针对新机器生效**；旧机器（现有 2C2G）保持原方案不变。

---

## 1. 决策摘要

| 项 | 决策 | 一句话理由 |
|---|---|---|
| 实例规格 | **2 核 4 GiB / 60 GiB 系统盘 / 30 Mbps / 2048 GB 流量（¥69.75/月）** | 2G 无余量做不到零停机发布；每月多 ¥33 换发布安全边际 |
| 操作系统 | **Ubuntu 24.04 LTS** | 22.04 标准支持 2027-05-31 到期；应用运行时锁在容器内，host 版本对应用无影响 |
| 宝塔面板 | **不安装** | 只需 Nginx + 证书，certbot 做得更彻底；同时消除 888/8888 公网入口这一安全例外 |
| Nginx | apt 官方源安装，vhost 手写 | 配置内容沿用 `DEPLOYMENT-PLAN-v0.2.0.md` D06 |
| 证书 | certbot / acme.sh，HTTP-01 webroot，systemd timer 自动续期 | 单域名，不需要 DNS-01 的复杂度 |
| 旧机器（现有 2C2G） | **降级为 staging/预生产，不退订** | 否则生产环境将没有对应的验证环境 |

---

## 2. 环境拓扑（决策后）

| 环境 | 机器 | 用途 | 数据库 | 支付 |
|---|---|---|---|---|
| staging / 预生产 | 现有新加坡 2C2G（保留宝塔） | 新版本先在此验证 | Supabase 预生产项目 | 支付宝沙箱 |
| production | **新购新加坡 2C4G（无宝塔）** | 真实用户与真实资金 | Supabase 生产项目（独立） | 支付宝生产商户号 |

> 两套环境的 Supabase 项目**不得共用**。新机器在验收阶段先接预生产库，转生产时切换到独立的生产库。

---

## 3. 选型依据：内存预算

数据库在 Supabase Cloud、图片在 Supabase Storage，服务器只跑 Docker + Next.js 容器 + Nginx，因此瓶颈是内存而非 CPU 或磁盘。以下为估算值。

### 3.1 2 GiB（现有机器，含宝塔）

| 项 | 估算占用 |
|---|---:|
| Ubuntu 24.04 minimal + systemd | ~300 MB |
| Docker daemon | ~120 MB |
| 宝塔面板进程 | ~200 MB |
| Nginx | ~30 MB |
| 应用容器（限制 768 MiB） | 768 MB |
| **合计** | **~1.4 GB / 2 GB** |

可以运行，但没有 swap，余量全部是 page cache。**关键约束**：`docker compose up -d` 默认先停旧容器再起新容器，存在数十秒停机；若要「先起新容器 → healthcheck 通过 → 再切流量」，瞬时需要两份容器内存（约 1.5 GB），2 GiB 装不下。

### 3.2 4 GiB（新机器，无宝塔）

| 项 | 估算占用 |
|---|---:|
| Ubuntu 24.04 minimal + systemd | ~300 MB |
| Docker daemon | ~120 MB |
| Nginx | ~30 MB |
| 应用容器（限制 1536 MiB） | 1536 MB |
| **合计** | **~2.0 GB / 4 GB** |

发布瞬间双容器约 3.5 GB，仍在范围内。堆从 512 MB 提到 1024 MB 后 Next.js SSR 的 GC 压力显著下降。

### 3.3 其他资源

- **磁盘 60 GiB**：需保留若干历史 SHA 镜像用于回滚。40 GiB 需要频繁 `docker image prune`，60 GiB 无需惦记。
- **流量 2048 GB**：图片走 Supabase Storage，服务器出口以 HTML/JS 为主，早期远用不完。
- **CPU 2 核**：低流量 SSR 足够；Flexus L 后续可升配，不必一次到位。

---

## 4. 新机器主机初始化规范（不装宝塔）

沿用 `DEPLOYMENT-PLAN-v0.2.0.md` 第 4 节的实施顺序，差异项如下：

1. **系统**：选 Ubuntu 24.04 minimal 镜像；安装后执行 `apt purge snapd`，关闭不需要的服务。
2. **Python 3.12 / PEP 668**：`pip install` 会报 `externally-managed-environment`。任何一键脚本或监控 agent 安装失败优先排查此项，使用 venv 或 `--break-system-packages`。
3. **AppArmor 非特权 user namespace 限制**（24.04 新增）：标准 Docker 不受影响；若使用 rootless Docker 或沙箱类工具需设置 `kernel.apparmor_restrict_unprivileged_userns=0`。
4. **Nginx**：apt 官方源安装，vhost 独立文件，反向代理到 `127.0.0.1:3000`，配置项按 D06 执行（WebSocket/HTTP 头、超时、上传上限、静态缓存、安全响应头）。
5. **证书**：certbot 或 acme.sh，HTTP-01 webroot 模式；webroot 目录位于宿主机，不涉及容器。续期 hook 执行 `nginx -s reload`，由 systemd timer 驱动。验收执行 `certbot renew --dry-run`。
6. **防火墙**：仅开放 22 / 80 / 443。**不再存在 888/8888 例外**。域名与 HTTPS 就绪后撤销临时的公网 5003，容器改绑 `127.0.0.1:3000`。
7. **SSH**：先配置公钥，验证可登录后禁用 Root 密码登录。
8. **cron**：沿用 `deploy/cron/`，`CRON_SECRET` 只放在 Root 可读的环境文件，禁止出现在 crontab 命令行、进程参数或日志中。
9. **备份**：服务器无状态，业务数据全部在 Supabase，依赖 Supabase 备份/PITR；服务器侧只需保留 `/opt/3d-printer-site/.env` 的离线副本（`0600`）。

### 4.1 若坚持保留宝塔（不推荐）

最低要求：`888/8888` 关闭公网访问，改为仅监听内网并通过 SSH 隧道访问。生产环境跑真实支付时，公网可达的管理面板是整机最薄弱的一环。

---

## 5. 容器资源参数调整（4 GiB 机器）

相对 `DEPLOYMENT-PLAN-v0.2.0.md` D03 的 2 GiB 参数：

| 参数 | 2 GiB 旧值 | 4 GiB 新值 |
|---|---|---|
| 容器内存限制 | 768 MiB | **1536 MiB** |
| `NODE_OPTIONS` | `--max-old-space-size=512` | `--max-old-space-size=1024` |
| swap | 不配置 | 不配置 |
| 日志轮转 | json-file 10 MiB × 5 | 不变 |

发布策略可从「先停后起」升级为「先起新容器 → healthcheck 通过 → 切流量 → 停旧容器」。`deploy/release.sh` 需相应调整；调整前后都必须完成回滚演练。

---

## 6. 预生产转生产检查清单

> 本机器由预生产原地转生产，机器上残留过测试数据、演示数据与沙箱密钥。**转换不是零成本切换**，以下每项必须逐条确认。

### 6.1 数据

- [ ] 生产使用**独立的 Supabase 生产项目**，不复用预生产项目
- [ ] 在生产库执行 `pnpm exec dotenv -e .env.production -- tsx scripts/seed.ts` 建立系统角色、管理员与基础配置
- [ ] 执行 `pnpm preprod:data:check` 确认目标库无误
- [ ] 清理所有演示/预生产业务数据；确认商品、优惠、订单、支付、生产、物流、退款均无残留测试记录
- [ ] 确认站点文案为正式品牌内容，无「演示站」「测试商品」字样
- [ ] `ALLOW_DEMO_DATA` 未设置或为 `false`；`CONFIRM_PREPROD_RESET` 留空
- [ ] 建立首个生产可恢复点（Supabase 备份 / PITR）

### 6.2 支付

- [ ] 支付宝**生产商户号**已获批（前置：域名 ICP 备案状态，见第 7 节）
- [ ] `ALIPAY_*` 全部由沙箱切换为生产密钥、生产网关
- [ ] `ALIPAY_NOTIFY_URL` / `ALIPAY_RETURN_URL` 指向生产 HTTPS 域名
- [ ] `ENABLE_MOCK_PAYMENT=false`
- [ ] 在生产环境**重新验证退款链路**（沙箱与生产的返回码和时序可能不同，见 v0.1.0 T071）
- [ ] 生产环境完成一笔小额真实支付与退款闭环，核对回调幂等与金额

### 6.3 配置与环境变量

- [ ] `APP_ENV` 由 `staging`/`preproduction` 改为生产值；健康检查版本正确
- [ ] `NEXT_PUBLIC_SITE_URL` 指向生产域名
- [ ] `NEXT_PUBLIC_ICP_LICENSE` 按备案结果填写或留空
- [ ] `ADMIN_JWT_SECRET`、`CRON_SECRET` **重新生成**，不沿用预生产值
- [ ] Supabase `SERVICE_ROLE_KEY`、`DATABASE_URL` 指向生产项目，`DATABASE_URL` 使用 Supavisor `6543` transaction 模式
- [ ] 自定义 SMTP 已配置，发件域名、限流与投递情况已验证
- [ ] `/opt/3d-printer-site/.env` 权限 `0600`，未进入 Git、镜像层或日志

### 6.4 安全

- [ ] 播种生成的临时管理员密码已修改；`DEMO_ADMIN_PASSWORD` 未设置
- [ ] 删除所有演示运营账号与预生产测试用户
- [ ] 防火墙与云安全组仅保留 22 / 80 / 443
- [ ] `grep -r "SERVICE_ROLE" .next/static` 无结果（生产构建产物）
- [ ] `pnpm security:audit` 在最新生产构建后通过
- [ ] HTTP 自动跳转 HTTPS，证书链正确，`certbot renew --dry-run` 通过

### 6.5 可用性与回滚

- [ ] 旧镜像回滚演练成功，数据库迁移确认前向兼容
- [ ] 三个 cron 端点鉴权、手工触发、调度与容器重启恢复均通过
- [ ] `/api/health` 本机与公网均返回 200，版本含构建 SHA
- [ ] 现有 2C2G 机器已切换为 staging，指向预生产 Supabase 项目

### 6.6 合规

- [ ] 确认可以接入真实用户与真实个人信息（此前所有版本均明确禁止）
- [ ] 若数据库仍在境外，已完成个人信息出境相关评估
- [ ] README 与 Release Notes 中的 Beta 限制声明已更新或移除

---

## 7. 未决事项

| 项 | 说明 |
|---|---|
| 境外域名无法 ICP 备案 | 可能影响支付宝生产商户号审核。这是本次「预生产转生产」链路上最大的不确定性，**应在购买服务器的同时并行推进**，不要等到验收完成才开始 |
| 上海实例备案资格 | 若最终必须迁回境内，需先在华为云控制台核实 Flexus L 是否满足备案条件，不满足则改用标准 ECS |
| 生产库地域 | 若应用留在新加坡而数据库迁境内（或反之），需处理跨境延迟，届时按 `CHANGES-v0.2.0.md` §10 将下单事务合并为单个存储过程 |

---

## 8. 2026-09-09 实施记录

- 新主机 `188.239.16.176` 已核对为 Ubuntu 24.04、2 核、约 4 GiB 内存、60 GiB 系统盘、无 Swap。
- 系统安全更新和内核升级已完成，当前内核为 `6.8.0-139-generic`。
- 已卸载 snapd，安装并启用 Docker CE、Compose、Nginx、Certbot、fail2ban、UFW 和 unattended-upgrades。
- 已验证 Root SSH 公钥登录，关闭密码认证、交互式认证、X11、Agent/TCP 转发；原 Root 密码已轮换。
- UFW 当前开放 22、80、443 与预生产临时端口 5003；域名和 HTTPS 生效后移除 5003。
- 已应用内核、journald、Docker 日志轮转、fail2ban 和自动更新配置；不需要的桌面/硬件服务已停用。
- `/opt/3d-printer-site` 已建立，运行时 `.env` 当前为空且权限为 `0600`，等待阶段三填入预生产配置。
- Nginx 已监听 80 和临时 5003；应用未部署前返回 502 属于预期。
- 本地部署资产已调整为 1536 MiB 容器限制、1024 MiB Node.js Heap，并使用蓝绿槽位健康检查后切换 Nginx upstream。
