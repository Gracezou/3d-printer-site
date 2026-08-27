# 技术设计文档 — 3D 打印成品独立站

> 面向实现 Agent。标注「强约束」的条目不得自行变更。
> 配套：`PRD.md`、`DATA_MODEL.md`、`API_SPEC.md`、`TASKS.md`。

---

## 1. 架构总览

单体应用，前台与后台同一个 Next.js 项目，通过路由组隔离。

```
┌─────────────────────────────────────────────────┐
│                  Next.js 应用                    │
│                                                  │
│  app/(shop)/*     前台   Server Component + ISR  │
│  app/(admin)/*    后台   Client Component + CSR  │
│  app/api/*        接口   Route Handlers          │
│                                                  │
│  lib/services/*   业务层（订单/库存/支付/优惠）    │
│  lib/db/*         Drizzle schema + 查询           │
└──────────┬──────────────────────┬───────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │  Supabase   │        │  支付宝网关   │
    │  Postgres   │        │  page.pay    │
    │  Auth       │        │  notify      │
    │  Storage    │        └─────────────┘
    └─────────────┘
```

### 1.1 分层规则（强约束）

```
Route Handler / Server Action   ← 只做参数校验、鉴权、调用 service、组装响应
        ↓
lib/services/*                  ← 全部业务逻辑与事务边界
        ↓
lib/db/*                        ← Drizzle 查询与 SQL 函数调用
```

- **禁止**在 Route Handler 或 React 组件中直接写业务逻辑或拼装事务
- **禁止**在 service 层引用 `next/headers`、`NextRequest` 等框架对象，service 必须可被脚本与定时任务直接调用
- 所有涉及库存、订单、支付、优惠的写操作必须在 service 层完成，且包裹在数据库事务内

这一条是为了未来把核心逻辑平移到独立 Go 服务时不需要重写业务代码。

---

## 2. 技术选型

| 项 | 选型 | 版本 | 理由 |
|---|---|---|---|
| 框架 | Next.js App Router | 15.x | 前后台同构，SEO 友好 |
| 语言 | TypeScript | 5.x | `strict: true`，禁用 `any` |
| ORM | Drizzle ORM | latest | 事务与原生 SQL 表达力强，库存扣减需要 `FOR UPDATE` 与存储过程调用 |
| 数据库 | Supabase Postgres | 15+ | 沿用团队既有经验 |
| C 端鉴权 | Supabase Auth（手机号 OTP） | - | 免自建验证码与会话体系 |
| 后台鉴权 | 自建 JWT + httpOnly Cookie | - | 与 C 端完全隔离 |
| 存储 | Supabase Storage | - | 商品图、GLB 模型文件 |
| 样式 | Tailwind CSS + shadcn/ui | - | 后台表单表格现成 |
| 表格 | TanStack Table | v8 | 后台列表 |
| 表单 | React Hook Form + Zod | - | Zod schema 前后端共用 |
| 3D 预览 | three.js + GLTFLoader | - | 按需动态导入，不进主包 |
| 支付 | alipay-sdk (Node) | - | 电脑网站支付 |
| 定时任务 | Vercel Cron 或 node-cron | - | 见 §8 |
| 校验 | Zod | - | 所有接口入参必须定义 schema |

### 2.1 为什么不用 Supabase RLS（强约束）

本项目**禁止**依赖 RLS 做业务鉴权，所有权限判断在 service 层完成。原因：

- Next.js 全栈本身就有可信服务端，鉴权放服务端更直观可测
- 库存扣减、折扣占用等逻辑需要跨表事务与 `SECURITY DEFINER` 函数，RLS 会带来额外复杂度
- 后台管理走独立账号体系，与 Supabase Auth 无关，RLS 无从判断

数据库连接使用 `service_role` 密钥，**该密钥禁止出现在任何客户端代码或 `NEXT_PUBLIC_` 环境变量中**。

---

## 3. 目录结构

```
src/
├── app/
│   ├── (shop)/                      # 前台路由组
│   │   ├── layout.tsx               # 前台布局（导航、页脚）
│   │   ├── page.tsx                 # 首页
│   │   ├── products/
│   │   │   ├── page.tsx             # 商品列表
│   │   │   └── [slug]/page.tsx      # 商品详情
│   │   ├── category/[slug]/page.tsx
│   │   ├── cart/page.tsx
│   │   ├── checkout/
│   │   │   ├── page.tsx             # 下单页
│   │   │   └── pay/[orderNo]/page.tsx
│   │   ├── account/
│   │   │   ├── orders/page.tsx
│   │   │   ├── orders/[orderNo]/page.tsx
│   │   │   └── addresses/page.tsx
│   │   └── auth/login/page.tsx
│   ├── (admin)/admin/               # 后台路由组
│   │   ├── layout.tsx               # 侧边栏 + 权限守卫
│   │   ├── page.tsx                 # 工作台
│   │   ├── login/page.tsx
│   │   ├── orders/
│   │   ├── production/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── materials/
│   │   ├── users/
│   │   ├── promotions/
│   │   └── settings/
│   └── api/
│       ├── auth/
│       ├── products/
│       ├── cart/
│       ├── addresses/
│       ├── orders/
│       ├── payments/
│       │   └── alipay/notify/route.ts
│       ├── cron/
│       └── admin/
├── lib/
│   ├── db/
│   │   ├── schema/                  # Drizzle 表定义（按领域拆文件）
│   │   ├── client.ts                # 连接实例
│   │   └── migrations/
│   ├── services/
│   │   ├── product.service.ts
│   │   ├── availability.service.ts  # 可售计算
│   │   ├── cart.service.ts
│   │   ├── order.service.ts         # 下单核心事务
│   │   ├── inventory.service.ts     # 预扣/消耗/释放/重打
│   │   ├── promotion.service.ts     # 折扣试算与占用
│   │   ├── shipping.service.ts      # 运费计算
│   │   ├── production.service.ts
│   │   └── payment/
│   │       ├── provider.interface.ts
│   │       ├── alipay.provider.ts
│   │       ├── mock.provider.ts
│   │       └── index.ts             # Provider 工厂
│   ├── auth/
│   │   ├── customer.ts              # Supabase Auth 封装
│   │   ├── admin.ts                 # 后台 JWT 签发校验
│   │   └── permissions.ts           # 权限码定义与校验
│   ├── validators/                  # Zod schema，前后端共用
│   ├── errors.ts                    # 业务错误类与错误码
│   ├── money.ts                     # 金额计算工具（基于 decimal.js）
│   └── logger.ts
├── components/
│   ├── ui/                          # shadcn
│   ├── shop/
│   └── admin/
└── types/
```

---

## 4. 鉴权方案

### 4.1 C 端

- Supabase Auth 手机号 OTP。`signInWithOtp` 发送验证码，`verifyOtp` 换取 session
- session 存 httpOnly Cookie，通过 `@supabase/ssr` 在 Server Component 与 Route Handler 中读取
- 首次登录时在 `user_profiles` 表插入一行，与 `auth.users.id` 一对一
- Route Handler 中统一用 `requireCustomer()` 取当前用户，未登录抛 `UNAUTHORIZED`
- 用户 `status = disabled` 时，`requireCustomer()` 抛 `ACCOUNT_DISABLED`

### 4.2 后台

- 用户名 + 密码，`bcrypt`（cost 12）校验
- 签发 JWT（HS256，`ADMIN_JWT_SECRET`），有效期 8 小时，存 httpOnly + SameSite=Strict Cookie，Cookie 名 `admin_token`
- Payload：`{ sub: adminId, roleCode, permissions: string[], exp }`
- `middleware.ts` 拦截 `/admin/*`（登录页除外）与 `/api/admin/*`，校验 token 有效性
- 细粒度权限在 Route Handler 中用 `requirePermission('order:refund')` 校验，无权限返回 403
- 登录失败计数存 `admin_users.failed_login_count` 与 `locked_until`，5 次锁定 15 分钟

**强约束**：后台 Cookie 与 C 端 Cookie 名称、密钥、校验逻辑完全独立，任何情况下不得互相识别。

---

## 5. 关键流程

### 5.1 下单（核心事务）

```
POST /api/orders
  │
  ├─ Zod 校验入参
  ├─ requireCustomer()
  │
  └─ orderService.createOrder(userId, input)
       │
       └─ db.transaction(async tx => {
            1. 查询变体 + 商品，校验 status/is_active     → 失败 PRODUCT_UNAVAILABLE
            2. 用【数据库价格】计算 items_amount（忽略前端金额）
            3. 校验收货地址归属当前用户                    → 失败 ADDRESS_NOT_FOUND
            4. shippingService 计算运费（按省份 + 小计）
            5. promotionService.applyCode(tx, code, userId, itemsAmount)
                 ├─ 条件更新 discount_codes.used_count      → 影响行数 0 则 CODE_EXHAUSTED
                 ├─ 校验 per_user_limit（count redemptions） → 超出 CODE_USER_LIMIT
                 └─ 返回 discountAmount
            6. 计算 payable_amount
            7. 生成 order_no，INSERT orders（reserved_until = now() + 30min）
            8. 读取各变体的 variant_materials，构造 bom_snapshot
                 required_grams = grams × (1 + material.waste_rate)
               INSERT order_items（含 bom_snapshot）
            9. SELECT fn_reserve_order_stock(orderId)     ← 见 DATA_MODEL §15.1
                 ├─ 从 order_items.bom_snapshot 聚合需求克数
                 ├─ 按 material_id 升序逐行 FOR UPDATE
                 ├─ 校验 stock - reserved - safety >= 需求
                 │    → 不足抛 INSUFFICIENT_MATERIAL:<耗材名>
                 ├─ UPDATE materials SET reserved_grams += N
                 └─ INSERT material_stock_movements (type='reserve')
           10. INSERT discount_redemptions (status='occupied')
           11. DELETE 购物车中对应 cart_items
          })
```

**强约束**：
- 预扣**必须**在 `order_items` 写入之后执行，因为所有库存函数都以 `bom_snapshot` 为计算依据。预扣与消耗必须读同一份快照，否则期间 BOM 被改动会造成 `reserved_grams` 泄漏
- 加锁**必须按 `material_id` 升序**，否则并发下单不同商品时会死锁
- Postgres 异常需在 service 层捕获并按 `MATERIAL_NOT_FOUND:` / `MATERIAL_INACTIVE:` / `INSUFFICIENT_MATERIAL:` 前缀解析为对应 `BizError`
- 事务内**禁止**发起任何网络请求（含支付宝、短信）
- 事务隔离级别使用默认 `READ COMMITTED`，配合行锁即可

### 5.2 支付

**创建支付**：
```
POST /api/payments
  ├─ 校验订单归属、状态为 pending_payment、未过期
  ├─ 若存在 status='created' 的旧支付记录，关闭它（避免多笔并存）
  ├─ 生成 out_trade_no = orderNo + '-' + 时间戳后6位   ← 支持重试
  ├─ INSERT payments (status='created')
  └─ alipayProvider.createPayment() → 返回收银台 URL
```

**异步回调**（强约束，最容易出错的地方）：
```
POST /api/payments/alipay/notify   ← 无鉴权，必须公网可达
  │
  ├─ 1. 解析 form-urlencoded body
  ├─ 2. 【验签】alipaySdk.checkNotifySign(params)     → 失败直接返回 'failure'，记 warn 日志
  ├─ 3. 校验 trade_status ∈ ['TRADE_SUCCESS','TRADE_FINISHED'] → 否则返回 'success'（忽略）
  ├─ 4. 校验 app_id === 本方 APP_ID                   → 不符返回 'failure'
  ├─ 5. 按 out_trade_no 查 payments，不存在 → 返回 'failure'
  ├─ 6. 【金额校验】total_amount === payments.amount  → 不符返回 'failure'，记 error 日志并告警
  ├─ 7. 【幂等】若 payments.status === 'success' → 直接返回 'success'，不做任何变更
  │
  └─ 8. db.transaction:
         ├─ UPDATE payments SET status='success', provider_txn_id=trade_no,
         │         paid_at=..., raw_notify=... WHERE id=? AND status != 'success'
         │    → 影响行数为 0 说明并发已处理，直接 return（二次幂等保险）
         ├─ UPDATE orders SET status='in_production', paid_at=..., paid_amount=...
         │    WHERE id=? AND status='pending_payment'
         │    → 影响行数为 0 则说明订单已取消，转入下方【边界情况处理】
         ├─ inventoryService.commit(tx, orderId)
         │    ├─ UPDATE materials SET stock_grams -= N, reserved_grams -= N
         │    └─ INSERT movements (type='consume')
         ├─ UPDATE discount_redemptions SET status='confirmed'
         └─ INSERT print_jobs（每个 order_item 一条，status='queued'）
     
  └─ 9. 返回纯文本 'success'（必须，否则支付宝会重复通知）
```

**幂等键**：`payments.provider_txn_id` 建唯一索引，作为最后一道防线。

**边界情况处理**：订单已超时取消但支付回调后到（用户在最后一秒付款）。此时第 8 步订单更新影响行数为 0，需要：记录 `error` 级日志、在 `payments` 上标记 `needs_manual_review = true`、在后台工作台展示待处理项。**第一版不做自动退款**，由人工在后台发起退款。

### 5.3 超时释放

```
GET /api/cron/release-expired   （需 CRON_SECRET 鉴权）
  │
  └─ 每分钟执行
     SELECT id FROM orders
       WHERE status='pending_payment' AND reserved_until < now()
       LIMIT 100 FOR UPDATE SKIP LOCKED          ← 防止多实例重复处理
     │
     └─ 逐单事务:
          ├─ UPDATE orders SET status='cancelled', cancel_reason='payment_timeout'
          ├─ inventoryService.release(tx, orderId)   → movements type='reserve_release'
          ├─ promotionService.release(tx, orderId)   → used_count -1, redemption='released'
          └─ 关闭关联的 payments（status='closed'）
```

### 5.4 打印失败重打

```
POST /api/admin/print-jobs/:id/fail
  └─ db.transaction:
       ├─ UPDATE print_jobs SET status='queued', failed_count = failed_count + 1
       ├─ 按 order_item 的 bom_snapshot 计算需求克数
       ├─ UPDATE materials SET stock_grams -= N     ← 只扣 stock，不动 reserved
       │    （允许扣成负数，但需在响应中提示已超库存）
       └─ INSERT movements (type='reprint_loss', ref_type='print_job')
```

---

## 6. 可售状态计算

### 6.1 实现方式

创建数据库视图 `v_variant_availability`（定义见 `DATA_MODEL.md`），所有可售查询统一走该视图，**禁止**在应用层用多次查询拼装。

### 6.2 缓存策略（强约束）

| 场景 | 策略 |
|---|---|
| 商品列表页售罄角标 | 随 ISR 缓存（60s），允许短暂过期 |
| 商品详情页静态内容 | ISR 60s |
| **商品详情页变体可售状态** | **必须实时查询，`cache: 'no-store'`** |
| 加入购物车 | 实时校验 |
| 提交订单 | 实时校验 + 行锁复核 |

详情页首屏由 Server Component 渲染商品静态内容，可售状态由客户端组件挂载后立即请求 `GET /api/products/:slug/availability` 填充。加载期间变体选项显示骨架态，**禁止**默认显示为可选。

---

## 7. 支付 Provider 抽象（强约束）

未来需要迁移到企业主体或接入微信支付，因此支付必须做接口抽象。

```typescript
// lib/services/payment/provider.interface.ts
export interface PaymentProvider {
  readonly code: 'alipay_page' | 'wechat_native' | 'mock';

  /** 创建支付，返回收银台跳转 URL 或二维码内容 */
  createPayment(params: {
    outTradeNo: string;
    amount: string;        // DECIMAL 字符串，禁止 number
    subject: string;
    notifyUrl: string;
    returnUrl: string;
  }): Promise<{ payUrl?: string; qrCode?: string }>;

  /** 主动查询支付状态（轮询兜底用） */
  queryPayment(outTradeNo: string): Promise<{
    status: 'pending' | 'success' | 'closed';
    providerTxnId?: string;
    paidAmount?: string;
  }>;

  /** 验签并解析异步通知 */
  verifyNotify(rawBody: string | Record<string, string>): Promise<{
    valid: boolean;
    outTradeNo?: string;
    providerTxnId?: string;
    amount?: string;
    tradeStatus?: string;
    raw: Record<string, unknown>;
  }>;

  /** 发起退款 */
  refund(params: {
    outTradeNo: string;
    outRefundNo: string;
    amount: string;
    reason: string;
  }): Promise<{ success: boolean; providerRefundId?: string; message?: string }>;
}
```

- `order.service.ts` 与 `inventory.service.ts` **禁止**引用任何支付宝 SDK 类型或字段名
- Provider 由 `getPaymentProvider(code)` 工厂返回，渠道码存于 `payments.provider`
- 本地开发与测试用 `MockProvider`：`createPayment` 返回一个本地确认页 URL，`ENABLE_MOCK_PAYMENT=true` 时才注册

---

## 8. 定时任务

优先使用 Vercel Cron（`vercel.json`）；若部署在自有服务器，用 `node-cron` 在独立进程中调用同样的 HTTP 端点。

```
/api/cron/release-expired     * * * * *      订单超时释放
/api/cron/auto-complete       0 3 * * *      自动确认收货
/api/cron/low-stock-alert     0 9 * * *      低库存汇总
```

**鉴权**：所有 cron 端点校验 `Authorization: Bearer ${CRON_SECRET}`，不匹配返回 401。

---

## 9. 错误处理与响应格式

### 9.1 统一响应

```typescript
// 成功
{ "code": 0, "data": { ... }, "message": "" }
// 失败
{ "code": 40001, "data": null, "message": "黑色 PLA 库存不足" }
```

HTTP 状态码同时正确设置（400/401/403/404/409/500），不得一律返回 200。

### 9.2 业务错误类

```typescript
export class BizError extends Error {
  constructor(
    public code: ErrorCode,
    public httpStatus: number,
    message: string,
    public detail?: Record<string, unknown>
  ) { super(message); }
}
```

Route Handler 用统一 `withErrorHandler` 包裹，捕获 `BizError` 转响应，其他异常记录 `error` 日志后返回 50000 通用错误，**禁止**将数据库错误信息透出给客户端。

错误码表见 `API_SPEC.md` §2。

---

## 10. 金额处理（强约束）

- 数据库统一 `DECIMAL(10,2)`
- 应用层使用 `decimal.js`，**禁止**用 JavaScript `number` 参与任何金额运算
- Drizzle 中 decimal 列映射为 `string`，进入计算前转 `Decimal`，写回前转字符串
- 传给支付宝的金额为两位小数字符串
- 百分比折扣计算：`items.mul(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN)`，向下取整对用户不利的方向统一为**优惠向下取整**

---

## 11. 日志与可观测

- 使用 `pino`，JSON 输出
- **必须**记录的事件：订单创建、支付回调（含验签结果）、库存变动、折扣码占用与释放、后台写操作、所有 5xx
- 日志中**禁止**输出：手机号完整值（脱敏为 `138****8000`）、支付宝私钥、`service_role` 密钥、密码
- 每个请求生成 `requestId`，贯穿日志

---

## 12. 环境变量

```bash
# 数据库
DATABASE_URL=                          # Supabase Postgres 连接串（含连接池）
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=             # 仅服务端，禁止 NEXT_PUBLIC_
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# 后台鉴权
ADMIN_JWT_SECRET=                      # >= 32 字符随机串

# 支付宝
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=                    # 应用私钥
ALIPAY_PUBLIC_KEY=                     # 支付宝公钥（用于验签）
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
ALIPAY_NOTIFY_URL=                     # 必须公网可达 HTTPS
ALIPAY_RETURN_URL=

# 站点
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_ICP_LICENSE=               # 备案号，页脚展示

# 任务
CRON_SECRET=

# 开关
ENABLE_MOCK_PAYMENT=false
```

`.env.example` 必须提交仓库，`.env.local` 必须在 `.gitignore` 中。

---

## 13. 部署与迁移路径

### 13.1 第一版

Vercel 部署 + Supabase Cloud。

**已知风险（需在 README 中记录）**：
- Supabase Cloud 国内直连不稳定，SSR 数据库查询延迟可能明显
- **境外部署的域名无法完成 ICP 备案**，而支付宝网站支付要求备案域名。若商户号审核受此影响，需按 §13.2 迁移

### 13.2 迁移到国内云（预留）

代码层面已通过以下设计降低迁移成本，实现时必须遵守：

| 项 | 约束 |
|---|---|
| 数据库 | 仅使用标准 Postgres 特性，**禁止**使用 Supabase 专有扩展（如 `pg_graphql`、Realtime） |
| 鉴权 | Supabase Auth 调用全部收敛在 `lib/auth/customer.ts` 一个文件内，迁移时只替换该文件 |
| 存储 | 文件上传下载收敛在 `lib/storage.ts`，暴露 `upload/delete/getPublicUrl` 三个方法 |
| 数据库访问 | 全部经 Drizzle，不使用 `supabase-js` 的表查询 API |

迁移目标形态：阿里云 ECS（Docker）+ RDS PostgreSQL + OSS + Auth.js。

---

## 14. 安全要求

- 所有接口入参经 Zod 校验，拒绝未定义字段
- 富文本（商品描述 Markdown）渲染前用 `rehype-sanitize` 清洗
- 文件上传：限制扩展名（图片 `jpg/png/webp`，模型 `glb`）、单文件 ≤ 20MB、校验 magic number，不信任 `Content-Type`
- 后台接口全部走 `POST/PATCH/DELETE` + JWT，敏感操作（退款、库存调整、耗材停用）额外记录操作日志
- 验证码发送做频率限制：同手机号 60 秒 1 次，同 IP 每小时 10 次
- 支付回调端点不做 CSRF 校验（外部调用），但必须严格验签
- 用户越权防护：所有按 id 查询的资源（订单、地址、购物车）必须附带 `user_id` 条件，**禁止**先查后判断归属
