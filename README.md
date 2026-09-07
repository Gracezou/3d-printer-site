# 3D 打印成品独立站

Next.js 15 + PostgreSQL/Supabase 实现的 3D 打印成品商城，包含商品、多耗材 BOM、实时可售库存、购物车、订单、优惠、支付、生产、物流、退款和权限化管理后台。

> [!WARNING]
> 当前版本仅用于境外验证环境，禁止接入真实用户或保存真实邮箱、手机号、收货地址等个人信息。支付仅使用支付宝沙箱，不产生真实资金流转。真实用户接入须等数据库迁回境内并完成个人信息与备案合规工作。

## 本地启动

需要 Node.js 20+、pnpm 11+ 和一个可用的 Supabase 项目。本地端口固定为 `5003`。

```bash
cp .env.example .env.dev
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

1. 在 Supabase 中创建 public Storage bucket `products`，启用 Email Auth，并将 Magic Link 邮件模板改为包含 `{{ .Token }}` 的验证码模板。应用接受 Supabase 可配置的 6 至 10 位 OTP；对外验证时应配置自定义 SMTP。
2. 将 `.env.dev` 的必填项填好后执行迁移。空库会按顺序执行 `src/lib/db/migrations/` 中的 Drizzle 迁移。
3. `pnpm db:seed` 会创建系统角色、默认运费和 `admin` 超级管理员；首次执行时终端会输出随机临时密码，登录后应立即修改。若 `admin` 已存在，重复播种不会改密码。
4. 访问 `http://localhost:5003`，后台地址为 `http://localhost:5003/admin`。

商城使用说明：

- 收货地址支持粘贴“姓名 + 手机号 + 完整地址”后快捷识别；识别结果只填入表单，保存前必须人工核对。
- 商品筛选条件写入 URL，刷新、前进后退和分享链接后会保留。
- 稀疏 SKU 会在切换某个规格时自动选择与之匹配的在售组合；再次点击已选值可以取消该维度。
- 运费在后台“系统设置 → 运费规则”配置，不使用环境变量。结算页会显示满额包邮、优惠码包邮或命中的计费规则。

如需把首次生成的账号密码写入权限为 `0600` 的临时文件，可执行：

```bash
pnpm exec dotenv -e .env.dev -- tsx scripts/seed.ts --credential-file=.local/admin-credentials
```

## 环境变量

完整注释和默认值见 [`.env.example`](./.env.example)。`.env.dev` 和密钥文件不得提交。

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | 服务端 PostgreSQL 连接串；新加坡部署使用 Supavisor `6543` 端口的 transaction 模式 |
| `DATABASE_POOL_MAX` | 单实例数据库连接上限，默认 5 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 仅服务端 Storage 管理，Service Role 禁止使用 `NEXT_PUBLIC_` 前缀 |
| `SUPABASE_STORAGE_BUCKET` | 商品图片与模型 bucket，默认 `products` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 客户端 Supabase 邮箱 OTP Auth |
| `ADMIN_JWT_SECRET` | 后台 JWT HS256 密钥，至少 32 个随机字符 |
| `ALIPAY_*` | 支付宝应用、RSA2 密钥、网关、异步通知和同步返回地址 |
| `NEXT_PUBLIC_SITE_URL` | 站点根地址；本地为 `http://localhost:5003` |
| `NEXT_PUBLIC_ICP_LICENSE` | 页脚备案号，验证环境留空 |
| `CRON_SECRET` | 三个定时任务端点的 Bearer Token |
| `ENABLE_MOCK_PAYMENT` | 本地自动测试设为 `true`；沙箱和生产必须为 `false` |
| `DEMO_ADMIN_PASSWORD` | 可选，固定演示运营员密码；不设则播种时随机生成 |
| `ALLOW_DEMO_DATA` | 仅隔离验证环境可设 `true`，用于明确允许生产模式写入演示数据 |

## 演示数据与验收

`demo:seed` 使用固定 ID 重建一整套虚构数据，包括耗材、库存、多耗材 BOM、商品、优惠、用户、地址、购物车、全部主要订单状态、支付、生产、物流和退款。它可重复执行，不会无限追加记录。

```bash
pnpm demo:seed       # 重建并输出 demo_operator 的随机密码
pnpm demo:check      # 校验外键、库存、金额、BOM 与状态覆盖
pnpm demo:reset      # 仅删除 v0.1 固定 ID 数据并恢复原站点配置
pnpm test:acceptance # 顺序执行 v0.1 的 14 项全链路验收
```

其他质量检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm security:audit  # 需要先有最新生产构建产物
```

`pnpm dev`、`pnpm build` 和 `pnpm start` 在本地都会自动读取 `.env.dev`。CI 与生产容器中不存在该文件，配置仍通过流水线构建参数或服务器运行时环境变量注入。

验收与安全结果见 [v0.1.0 验收记录](./docs/v0.1.0/ACCEPTANCE.md) 和 [v0.1.0 安全自查](./docs/v0.1.0/SECURITY.md)。

## 定时任务

`deploy/cron/` 提供 system crontab 模板、环境变量模板和包装脚本，覆盖每分钟释放过期订单、每日 03:00 自动完成订单和每日 09:00 低库存汇总。`CRON_SECRET` 只放在权限受限的环境文件中，禁止写入 crontab 命令行。

## 验证环境部署约束

v0.2 部署目标是华为云新加坡主机 + Nginx + Next.js，Supabase 必须选择新加坡 `ap-southeast-1` 区域，数据库连接使用 Supavisor `6543` transaction 模式。实际服务器初始化、流水线和沙箱公网回调分别在 T104、T105、T106 执行，当前 Tag 不代表已部署为可用生产站。

## 已知限制与迁移

- Supabase Cloud 在中国大陆的网络可达性和稳定性无法保证。
- 境外服务器上的域名无法完成中国大陆 ICP 备案，可能影响支付宝生产商户号审核。
- 沙箱退款返回码与时序可能与生产不同，正式上线前必须重新验证。
- T044 的 3D 预览为可选延后项；当前不阻塞商品与交易主链路。
- 地址快捷识别采用本地规则，不调用地图或第三方地址服务；非常规写法可能需要手动补充市、区县。
- 迁回境内时新建 PostgreSQL/对象存储与 Auth 实例，通过 `pg_dump` / `pg_restore` 迁移数据，切换 Storage URL 和环境变量，并在停机窗口重放迁移、核对库存/订单/支付及完整回归。具体见 [v0.1.0 技术方案](./docs/v0.1.0/TECH_SPEC.md#132-迁移国内方案)。

## 文档

- [v0.1.0 Release Notes](./docs/v0.1.0/RELEASE_NOTES.md)
- [v0.1.0 PRD](./docs/v0.1.0/PRD.md)
- [v0.1.0 技术方案](./docs/v0.1.0/TECH_SPEC.md)
- [v0.1.0 数据模型](./docs/v0.1.0/DATA_MODEL.md)
- [v0.1.0 API 规范](./docs/v0.1.0/API_SPEC.md)
- [v0.1.0 任务清单](./docs/v0.1.0/TASKS.md)
- [v0.2.0 增量变更](./docs/CHANGES-v0.2.0.md)
- [v0.2.0 部署计划](./docs/DEPLOYMENT-PLAN-v0.2.0.md)
- [v0.2.0 Release Notes](./docs/RELEASE_NOTES-v0.2.0.md)

## License

[MIT](./LICENSE)
3D打印独立站
