# v0.2.2 验收记录

> 日期：2026-09-13
> 分支：`master`
> 验收基线：`master@3c83fde`；发布镜像来源 `718fc0d` 与其 Git tree 完全一致

## 自动质量门禁

| 检查 | 结果 | 备注 |
|---|---|---|
| `pnpm typecheck` | 通过 | 无 TypeScript 错误 |
| `pnpm lint` | 通过 | 无 ESLint 错误 |
| `pnpm test` | 通过 | 23 个测试文件、60 项测试 |
| `pnpm test:acceptance` | 通过 | 原交易链路及新增机型 CRUD/权限/审计/关联、意向登记唯一性/并发/限流/计数用例全部通过 |
| `pnpm build:production` | 通过 | 60 个静态页面生成完成 |
| `pnpm security:audit` | 通过 | 4 个既有 moderate，无 high |
| `git diff --check` | 通过 | 无空白错误 |

验收期间发现计价测试中“刚创建的折扣码”会受数据库与应用主机轻微时钟偏差影响，偶发被判断为尚未生效。测试夹具现将有效折扣码开始时间显式设为一分钟前；业务判断逻辑未改变，单项及全量复测均通过。

## 数据迁移与业务验收

- 目标环境确认为 `.env.dev` 对应的 Supabase 项目 `tnjvdmtoyecuvfrivgjq`，迁移前表清单与 Drizzle 历史已记录。
- `0003_handy_monster_badoon.sql` 已应用；迁移记录 hash 为 `2fe0f9e1ae7c24750b56ae5fa215ebc20388b0a6e1031efa843f0edbb5ea0b3f`，与本地文件一致。
- `device_brands`、`device_models`、`product_device_models`、`model_requests` 均已启用 RLS；`anon`、`authenticated` 无 DML 权限，`service_role` 保留所需权限。
- 四张新表的主键、外键、唯一/检查约束及外键覆盖索引均已验证；未改动订单、库存、支付、退款及生产表。
- 已显式执行机型种子，写入阅星瞳、Kindle、掌阅、文石/BOOX 四个品牌及各一个机型，重复执行保持幂等。
- 新增 `test:devices` 与 `test:model-requests`，覆盖权限拒绝、CRUD、审计、关联维护、重复/并发登记、IP 限流和人数准确性。
- 验收发现 PostgreSQL 唯一冲突被 Drizzle 包装在 `cause` 中，导致重复登记误报 500；现已递归识别错误链并验证返回 40913。

## 浏览器与静态验收

- 本地地址：`http://localhost:5003/`，使用 `.env.dev`，机型库迁移与种子数据均已应用。
- 360、390、768、1440 四档视口均无横向滚动，H1 与设备选择区域都位于首屏。
- 首页 H1 为“量卷裁衣”，页面标题和正文包含“电子阅读器保护壳”，未发现“演示站”“测试站”残留。
- 首页设备选择器展示 4 个品牌及对应机型；使用型号别名 `PW5` 搜索可命中 Kindle Paperwhite，并可用 Enter 直接进入机型页。
- 设备搜索补齐活动项、上下方向键、Enter、Escape、`aria-activedescendant` 与 `aria-selected` 行为。
- 四个当前机型页均展示尺寸、交付说明与意向登记表单，正文超过 300 字；390px 视口无横向滚动。
- 商品详情通过站内链接进入，中文参数、交期和售后文案正常，未发现 `process`、`material`、`weight` 等中英混排字段。
- 首页图片均有明确渲染尺寸；现有 Lighthouse 基线 CLS 为 0。
- 首页与机型页源码中没有散落十六进制颜色，颜色值集中在 `globals.css` Token 中。
- 站内代码仅支付宝 `payUrl` 保留 `window.location.assign`，符合外部支付跳转例外。
- 本地生产构建包含 `https://printer.daxiaoxiang.com`，未发现 `188.239.16.167`、`188.239.16.176` 或 `http://printer.daxiaoxiang.com`。
- 本地 sitemap 已包含四个机型页，robots 已屏蔽 `/admin`、`/account`、`/checkout`、`/api`。
- 生产模式首次访问首页后，机型/品牌查询计数分别由 6/4 增至 7/5；第二次访问保持 7/5，缓存命中成立。后台品牌与机型写接口均已核对调用 `revalidateTag`。

## 部署与线上技术验收

- 2026-09-13 使用蓝绿发布脚本将 `ghcr.io/gracezou/3d-printer-site:sha-718fc0d8e3b22be8f6e7e29c8916bbb20d4a1433` 发布到 blue 槽位 `127.0.0.1:3000`，旧 green 槽位在切流后正常停止。
- 线上 `/api/health` 返回 HTTP 200、`status=ok`、`database=ok` 和 `v0.2.2+sha-718fc0d…`。
- `.active-release`、运行容器镜像与健康检查 SHA 一致，容器状态为 healthy；发布后日志未发现 error、fatal 或 unhandled。
- HTTPS 首页返回 200，HTTP 自动 301 到 HTTPS；HSTS、X-Content-Type-Options、X-Frame-Options、Referrer-Policy 和 Permissions-Policy 均存在。
- 首页显示“量卷裁衣”和“电子阅读器保护壳”；设备 API 返回四个首批品牌，`PW5` 可命中 Kindle Paperwhite。
- 商品页和机型页返回 200，渲染 HTML 中存在预期 Product、Offer、BreadcrumbList JSON-LD。
- sitemap 返回 200 并包含四个机型页；robots 返回 200 并屏蔽 `/admin`、`/account`、`/checkout`、`/api`。
- 未登录访问后台会跳转登录页；三个 Cron 端点无授权访问均返回 401。
- 生产域名存在于渲染 HTML 和服务端 bundle；客户端 `_next/static` 不含生产域名，也不含服务器 IP 或 HTTP 旧地址。

## 尚未满足的发布条件

以下项目仍需上线或人工环境才能宣告完成：

1. 部署完成后人工回归登录恢复购买、支付宝外跳与 return 回跳；用户已确认本阶段暂缓。
2. 按 [`GOOGLE-RICH-RESULTS-ACCEPTANCE.md`](./GOOGLE-RICH-RESULTS-ACCEPTANCE.md) 验证线上结构化数据。

T154 原定随机抽查 10 个机型页；当前仅有 4 个机型，已全部检查通过。用户确认 v0.2.2 按当前数据范围验收，新增机型及内容扩充留待后续版本。

Tag `v0.2.2` 已建立；在以上两项人工验收完成前，B7 与 Release Notes 保持“待人工验收”状态。
