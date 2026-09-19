# 层光造物

Next.js 15 + PostgreSQL/Supabase 实现的 3D 打印成品商城，包含商品、多耗材 BOM、实时可售库存、购物车、订单、优惠、支付、生产、物流、商品级退款、客户售后申请和权限化管理后台。

## 当前版本与状态

- **生产**：尚未上线，服务器待提供。
- **Stage**：v0.3.0 已发布至 `http://stage.printer.daxiaoxiang.com`。
- v0.2.3（境内迁移）文档位于 `release-v0.2.3` 分支。

## 本地开发

需要 Node.js 20+、pnpm 11+、本地 PostgreSQL 和一个用于 Auth/Storage 的 Supabase 项目。本地端口固定为 `5003`。

```bash
cp .env.example .env.dev
pnpm install
pnpm exec dotenv -e .env.dev --override -- pnpm db:migrate
pnpm db:seed
pnpm dev
```

1. 在 Supabase 中创建 public Storage bucket `products`，启用 Email Auth，并将 Magic Link 邮件模板改为包含 `{{ .Token }}` 的验证码模板。应用接受 Supabase 可配置的 6 至 10 位 OTP；对外验证时应配置自定义 SMTP。
2. 将 `.env.dev` 的必填项填好后显式加载它再执行迁移。空库会按顺序执行 `src/lib/db/migrations/` 中的 Drizzle 迁移。`pnpm db:migrate` 不再自动读取 `.env.dev`；它与直接调用 drizzle-kit 默认只接受 `localhost`/`127.0.0.1`。
3. `pnpm db:seed` 会创建系统角色、默认运费和 `admin` 超级管理员；首次执行时终端会输出随机临时密码，登录后应立即修改。若 `admin` 已存在，重复播种不会改密码。
4. 访问 `http://localhost:5003`，后台地址为 `http://localhost:5003/admin`。

如需把首次生成的账号密码写入权限为 `0600` 的临时文件，可执行：

```bash
pnpm exec dotenv -e .env.dev -- tsx scripts/seed.ts --credential-file=.local/admin-credentials
```

## 商城使用说明

- 收货地址支持粘贴“姓名 + 手机号 + 完整地址”后快捷识别；识别结果只填入表单，保存前必须人工核对。
- 商品筛选条件写入 URL，刷新、前进后退和分享链接后会保留。
- 稀疏 SKU 会在切换某个规格时自动选择与之匹配的在售组合；再次点击已选值可以取消该维度。
- 运费在后台“系统设置 → 运费规则”配置，不使用环境变量。结算页会显示满额包邮、优惠码包邮或命中的计费规则。

## 常用命令

```bash
pnpm demo:seed       # 重建 demo 数据并输出 demo_operator 的随机密码
pnpm demo:check      # 校验外键、库存、金额、BOM 与状态覆盖
pnpm demo:reset      # 仅删除 v0.1 固定 ID 数据并恢复原站点配置
pnpm test:acceptance # v0.1 的 14 组 + v0.3 的退款、返库、售后验收
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm security:audit  # 需要先有最新生产构建产物
```

`pnpm dev`、`pnpm build` 和 `pnpm start` 在本地都会自动读取 `.env.dev`。CI 与生产容器中不存在该文件，配置仍通过流水线构建参数或服务器运行时环境变量注入。

`test:acceptance` 会先校验 `DATABASE_URL` 必须指向本机，再重建本地 demo 基线；禁止对共用或生产数据库运行。远程正式迁移需同时设置 `ALLOW_REMOTE_DATABASE_MIGRATION=true` 与精确的 `CONFIRM_REMOTE_DATABASE_HOST`，并在执行前双人核对终端打印的 host。详见 [v0.3.0 迁移与回滚](./docs/v0.3.0/MIGRATION-ROLLBACK-v0.3.0.md)。

环境变量详见 [环境变量参考](./docs/ops/ENVIRONMENT.md)；部署与定时任务详见 [部署手册](./docs/ops/DEPLOY.md)。

## 文档

完整文档索引见 [docs/README.md](./docs/README.md)。

## License

[MIT](./LICENSE)
