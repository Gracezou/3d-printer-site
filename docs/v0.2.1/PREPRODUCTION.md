# v0.2.1 预生产部署与支付退款验收

## 目标与边界

- 版本：`v0.2.1`
- 分支：`release-v0.2.1`
- 主机：华为云新加坡，应用端口 `5003`
- 数据：Supabase 新加坡项目，预生产数据库不得与正式生产共用
- 支付：支付宝沙箱，`ENABLE_MOCK_PAYMENT=false`
- 用户：仅受邀 Beta 验证，使用专用邮箱和虚构手机号、地址

## P0：域名与 HTTPS（**已全部完成，2026-09-09 关闭**）

> 本清单已于 v0.2.1 验收关闭。保留原文用于追溯。
> H13 的复核方式见 `docs/v0.2.2/CHANGES-v0.2.2.md` 的构建产物核对任务。

### 域名侧（用户执行）

- [x] H01 预生产域名确定为 `printer.daxiaoxiang.com`。
- [x] H02 Cloudflare DNS 已启用橙云代理，源站指向 `188.239.16.176`；HTTP 已能经 Cloudflare 到达应用。
- [x] H03 华为云安全组及 UFW 允许公网 TCP `80`、`443`；暂时保留 `5003`，无需新增其他管理端口。
- [x] H04 公网 DNS 已生效；外部解析结果为 Cloudflare Anycast 地址，符合橙云代理预期。
- [x] H04a Cloudflare Origin Certificate 对应私钥已从 `.local/` 安全上传；私钥未进入 Git、聊天或日志。

### 服务器与应用侧（Codex 执行）

- [x] H05 验证 Cloudflare 代理、源站 `80/443` 连通性及当前 SSL/TLS 模式；上线后使用 `Full (strict)`。
- [x] H06 Nginx `server_name` 已更新并监听 443，应用反向代理与临时 5003 回滚入口保持可用。
- [x] H07 Cloudflare Origin Certificate 与匹配私钥已安装；证书/私钥一致，私钥权限为 `0600`，证书有效期至 2041-09-05。
- [x] H08 已配置 TLS 1.2/1.3、HTTP → HTTPS 跳转和 HSTS，公网 HTTPS 健康接口返回 200。
- [x] H09 服务器运行环境已统一使用 `https://printer.daxiaoxiang.com`，Secure Cookie 已恢复，支付宝通知与返回地址均切换到 HTTPS 域名。
- [x] H10 更新 GitHub Repository Variable `PREPROD_SITE_URL=https://<域名>`；Supabase URL 和 Anon Key 保持不变。
- [x] H11 更新 Supabase Auth URL Configuration：Site URL 使用 HTTPS 域名，并将登录所需 HTTPS 地址加入 Redirect URLs；移除不再使用的 localhost/IP 回调前先完成登录验证。
- [x] H12 Cron 已重新安装，`APP_BASE_URL` 使用 HTTPS 域名且 `CRON_SECRET` 未变更。
- [x] H13 重新构建并蓝绿发布镜像；`NEXT_PUBLIC_SITE_URL` 属于浏览器构建参数，不能只重启旧容器。
- [x] H14 验证 Cloudflare `Full (strict)`、源站证书、TLS、HTTP 跳转、静态资源和健康接口。
- [x] H15 管理员登录接口和鉴权接口已通过，Cookie 包含 `Secure`/`HttpOnly`/`SameSite=Strict`；尚需完成顾客邮箱 OTP 登录。
- [x] H16 新建支付宝沙箱订单，确认异步通知直接到达 HTTPS `/api/payments/alipay/notify`，再完成部分退款、剩余全额退款和库存返还复验。
- [x] H17 HTTPS 验收全部通过后，从 UFW 和 Nginx 移除公网 `5003`，应用容器继续只绑定回环地址。

## 发布前准备

1. 从 `deploy/.env.production.example` 生成服务器 `/opt/3d-printer-site/.env`，填写 Supabase、后台 JWT、Cron 和支付宝沙箱参数。
2. 执行 `chmod 600 /opt/3d-printer-site/.env`，确认文件未进入 Git、镜像层或日志。
3. `NEXT_PUBLIC_SITE_URL`、`ALIPAY_NOTIFY_URL`、`ALIPAY_RETURN_URL` 必须指向同一预生产站点。完整支付回调验收使用 HTTPS 域名；只有 IP + HTTP 时不把异步通知验收标记为通过。
   IP + HTTP 验收期间设置 `SESSION_COOKIE_SECURE=false`，否则浏览器会丢弃后台登录 Cookie；切换 HTTPS 域名时必须同步改为 `true`。
4. 配置 GitHub 仓库变量 `PREPROD_SITE_URL`、`PREPROD_SUPABASE_URL` 和 `PREPROD_SUPABASE_ANON_KEY`；它们会写入浏览器构建产物，其中 Supabase Anon Key 本身是公开客户端凭据，绝不能误填 Service Role。域名未就绪时 `PREPROD_SITE_URL` 可先使用 `http://188.239.16.176:5003`。
5. `PREPROD_ICP_LICENSE` 为可选仓库变量；新加坡预生产环境保持为空。

## 数据初始化

先创建系统角色、管理员和基础配置，再重置为精简数据集：

```bash
pnpm exec dotenv -e .env.production -- tsx scripts/seed.ts
pnpm preprod:data:check
CONFIRM_PREPROD_RESET=RESET_PREPROD_DATA pnpm preprod:data:reset
pnpm preprod:data:check
```

重置脚本保留系统角色、后台管理员和非演示 Auth 用户资料。分类、耗材、库存流水、商品、SKU、BOM、优惠活动、优惠码、地址、购物车、订单、支付、生产、物流、退款、运费规则和后台操作日志各保留一条实例；业务实例优先关联已有 Auth 用户，没有可用用户时才创建虚构参考资料。站点文案改为正常品牌内容，不显示“演示站”或“测试商品”。

## 构建与发布

`release-v0.2.1` 推送后，GitHub Actions 会执行类型检查、Lint、单元测试、生产构建和安全审计，再发布不可变镜像：

```text
ghcr.io/<owner>/<repo>:sha-<commit-sha>
```

服务器只允许通过不可变 SHA 镜像发布：

```bash
cd /opt/3d-printer-site
./release.sh ghcr.io/<owner>/<repo>:sha-<commit-sha>
curl --fail http://127.0.0.1:5003/api/health
```

健康检查应返回 `status=ok`，版本应包含 `v0.2.1` 与构建提交 SHA。随后从外网检查首页、商品详情、邮箱 OTP 登录、购物车、结算页和后台登录。

应用健康后安装定时任务：

```bash
cd /tmp/3d-printer-site-deploy/deploy/cron
./install.sh
/opt/3d-printer-site/run-cron.sh release-expired
```

安装脚本默认从 `/opt/3d-printer-site/.env` 安全提取站点地址和 `CRON_SECRET`；密钥不会写入 crontab 命令行。

## 支付与退款验收

1. 使用新的 Beta 用户创建一笔低金额订单，确认订单初始状态为“待支付”，库存进入预占。
2. 发起支付宝沙箱支付，核对网关域名是沙箱地址，金额、订单号和商品标题正确。
3. 使用沙箱买家完成支付，确认异步通知返回 `success`；订单、支付记录变为已支付，库存只扣减一次。
4. 重放同一条通知，确认支付幂等且不重复扣料。
5. 在后台对该订单发起部分退款，核对退款记录、订单累计退款金额和支付宝沙箱结果。
6. 对剩余金额发起退款，确认订单进入已退款，且不能超额或重复退款。
7. 分别验证“返还库存”和“不返还库存”的业务选择；核对库存流水、操作员与审计日志。
8. 保留订单号、支付单号、退款单号、时间和脱敏截图作为 Beta 验收证据，严禁记录私钥、Service Role 或完整个人信息。

## 回滚

应用异常时由 `deploy/release.sh` 自动回滚到前一镜像。数据重置不可自动回滚，执行前必须确认目标库并按 Supabase 备份策略创建可恢复点。支付退款一旦提交到支付宝沙箱，不通过直接修改数据库伪造回滚。
