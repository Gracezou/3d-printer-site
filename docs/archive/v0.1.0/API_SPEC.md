# 接口文档 — 3D 打印成品独立站

> 面向实现 Agent。所有接口入参必须定义 Zod schema 并拒绝未声明字段。

---

## 1. 通用约定

**Base**：`/api`
**Content-Type**：`application/json`（支付回调除外，为 `application/x-www-form-urlencoded`）

**响应包装**：
```json
{ "code": 0, "data": { }, "message": "" }
```

失败时 `data` 为 `null`，同时设置正确的 HTTP 状态码（禁止一律返回 200）。

**分页请求**：`?page=1&pageSize=20`
**分页响应**：
```json
{ "code": 0, "data": { "list": [], "total": 100, "page": 1, "pageSize": 20 }, "message": "" }
```

**鉴权**：
- C 端：Supabase session Cookie，服务端 `requireCustomer()`
- 后台：`admin_token` httpOnly Cookie（JWT），服务端 `requireAdmin()` + `requirePermission(code)`
- Cron：`Authorization: Bearer ${CRON_SECRET}`

**金额字段**：一律为**两位小数字符串**（如 `"59.00"`），禁止用 number 传输。

---

## 2. 错误码表

| code | HTTP | 常量 | 说明 |
|---|---|---|---|
| 0 | 200 | — | 成功 |
| 40001 | 400 | `PARAM_INVALID` | 参数校验失败 |
| 40101 | 401 | `UNAUTHORIZED` | 未登录或 session 失效 |
| 40102 | 400 | `OTP_INVALID` | 验证码错误或已过期 |
| 40103 | 429 | `OTP_RATE_LIMIT` | 验证码发送过于频繁 |
| 40104 | 403 | `ACCOUNT_DISABLED` | 账号已被禁用 |
| 40105 | 401 | `ADMIN_LOGIN_FAILED` | 用户名或密码错误 |
| 40106 | 423 | `ADMIN_LOCKED` | 账号已锁定，请稍后再试 |
| 40301 | 403 | `FORBIDDEN` | 无该操作权限 |
| 40401 | 404 | `NOT_FOUND` | 资源不存在 |
| 40402 | 404 | `PRODUCT_UNAVAILABLE` | 商品已下架或变体不可用 |
| 40403 | 404 | `ADDRESS_NOT_FOUND` | 收货地址不存在 |
| 40901 | 409 | `INSUFFICIENT_MATERIAL` | 耗材库存不足（message 含耗材名） |
| 40902 | 409 | `MATERIAL_INACTIVE` | 关联耗材已停用 |
| 40903 | 409 | `ORDER_STATUS_INVALID` | 订单当前状态不允许该操作 |
| 40904 | 409 | `ORDER_EXPIRED` | 订单已超时 |
| 40905 | 404 | `CODE_NOT_FOUND` | 折扣码不存在 |
| 40906 | 409 | `CODE_EXPIRED` | 折扣码未生效或已过期 |
| 40907 | 409 | `CODE_EXHAUSTED` | 折扣码使用次数已用完 |
| 40908 | 409 | `CODE_USER_LIMIT` | 您已使用过该折扣码 |
| 40909 | 409 | `CODE_MIN_AMOUNT` | 未达到折扣码使用门槛 |
| 40910 | 400 | `CART_EMPTY` | 购物车为空或未勾选商品 |
| 40911 | 409 | `VARIANT_NO_BOM` | 变体未配置耗材，无法下单 |
| 40912 | 409 | `MATERIAL_IN_USE` | 耗材被商品引用，无法删除 |
| 50000 | 500 | `INTERNAL_ERROR` | 服务器错误 |
| 50001 | 502 | `PAYMENT_PROVIDER_ERROR` | 支付渠道调用失败 |

---

## 3. C 端接口

### 3.1 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/send-code` | 发送验证码 |
| POST | `/api/auth/verify` | 校验验证码并登录 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/auth/me` | 当前用户信息 |

```jsonc
// POST /api/auth/send-code
{ "phone": "13800138000" }
// 限流：同手机号 60s 一次，同 IP 每小时 10 次 → 40103

// POST /api/auth/verify
{ "phone": "13800138000", "code": "123456" }
// → { code: 0, data: { userId, phone, nickname, isNewUser } }
// 新用户在此接口内创建 user_profiles 行
```

### 3.2 商品

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/categories` | 分类树 |
| GET | `/api/products` | 商品列表 |
| GET | `/api/products/:slug` | 商品详情 |
| GET | `/api/products/:slug/availability` | **变体可售状态（实时，禁止缓存）** |

```jsonc
// GET /api/products?categoryId=&minPrice=&maxPrice=&materialType=&sort=&page=&pageSize=
// sort: 'default' | 'price_asc' | 'price_desc' | 'newest'
// → data.list[]:
{
  "id": "...", "name": "龙猫摆件", "slug": "totoro-figure",
  "mainImageUrl": "...", "minPrice": "59.00", "isSoldOut": false
}

// GET /api/products/:slug
{
  "id": "...", "name": "...", "subtitle": "...", "description": "# markdown",
  "mainImageUrl": "...", "gallery": ["..."], "modelPreviewUrl": "...",
  "specs": { "尺寸": "10cm", "重量": "120g" },
  "variants": [
    { "id": "...", "skuCode": "TOT-S-PLA-BLK", "name": "小号 / PLA / 黑色",
      "attributes": { "size": "小号", "material": "PLA", "color": "黑色" },
      "price": "59.00", "comparePrice": "79.00", "imageUrl": "..." }
  ]
}
// 注意：本接口【不返回】可售状态，由下方接口单独提供

// GET /api/products/:slug/availability   ← Cache-Control: no-store
{
  "variants": [ { "variantId": "...", "availableQty": 7 } ]
}
// availableQty 已封顶 99；禁止返回耗材克数
```

### 3.3 购物车（需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/cart` | 购物车（含实时可售状态） |
| POST | `/api/cart/items` | 加入购物车 |
| PATCH | `/api/cart/items/:id` | 修改数量 |
| DELETE | `/api/cart/items/:id` | 删除 |

```jsonc
// POST /api/cart/items  { "variantId": "...", "quantity": 1 }
// 已存在同变体则数量累加；累加后超过可售数量 → 40901

// GET /api/cart → data.items[]:
{
  "id": "...", "variantId": "...", "productName": "龙猫摆件",
  "variantName": "小号 / PLA / 黑色", "skuCode": "...", "imageUrl": "...",
  "unitPrice": "59.00", "quantity": 2, "subtotal": "118.00",
  "availableQty": 7, "isAvailable": true, "unavailableReason": null
}
// unavailableReason: 'off_shelf' | 'out_of_stock' | null
```

### 3.4 地址（需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/addresses` | 列表 |
| POST | `/api/addresses` | 新增 |
| PATCH | `/api/addresses/:id` | 修改 |
| DELETE | `/api/addresses/:id` | 删除（软删） |
| POST | `/api/addresses/:id/default` | 设为默认 |

所有操作必须附带 `user_id` 条件，禁止先查询再判断归属。

### 3.5 订单（需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/orders/preview` | **下单试算**（运费 + 折扣） |
| POST | `/api/orders` | 创建订单 |
| GET | `/api/orders` | 订单列表 |
| GET | `/api/orders/:orderNo` | 订单详情 |
| POST | `/api/orders/:orderNo/cancel` | 取消（仅待支付） |
| POST | `/api/orders/:orderNo/confirm` | 确认收货 |

```jsonc
// POST /api/orders/preview
{
  "items": [ { "variantId": "...", "quantity": 2 } ],
  "addressId": "...",            // 可空，为空则不算运费
  "discountCode": "WELCOME10"    // 可空
}
// → data:
{
  "itemsAmount": "118.00",
  "discountAmount": "10.00",
  "shippingAmount": "10.00",
  "payableAmount": "118.00",
  "discount": { "code": "WELCOME10", "name": "新人立减10元", "type": "fixed_amount" },
  "unavailableItems": []
}
// 试算接口【不占用】折扣码、【不预扣】库存，仅计算
// 折扣码不可用时返回对应错误码（40905~40909），前端展示提示

// POST /api/orders
{
  "items": [ { "variantId": "...", "quantity": 2 } ],
  "addressId": "...",
  "discountCode": "WELCOME10",
  "buyerRemark": "希望周末前发货",
  "fromCart": true               // true 则下单成功后清除购物车对应项
}
// → data: { "orderNo": "20260827000123", "payableAmount": "118.00",
//           "reservedUntil": "2026-08-27T10:30:00+08:00" }
//
// 服务端强制行为（见 TECH_SPEC §5.1）：
//   - 忽略前端传入的任何金额，以数据库价格重算
//   - 同一事务内完成：占用折扣码 → 建单 → 写 BOM 快照 → 预扣耗材
//   - 库存不足返回 40901，message 形如「PLA 黑色 库存不足」
```

```jsonc
// GET /api/orders/:orderNo → data:
{
  "orderNo": "...", "status": "in_production", "statusText": "生产中",
  "itemsAmount": "118.00", "discountAmount": "10.00",
  "shippingAmount": "10.00", "payableAmount": "118.00",
  "discountCode": "WELCOME10",
  "receiver": { "name": "张三", "phone": "138****8000",
                "address": "浙江省 杭州市 西湖区 xx路1号" },
  "items": [ { "productName": "...", "variantName": "...", "imageUrl": "...",
               "unitPrice": "59.00", "quantity": 2, "subtotal": "118.00",
               "printStatus": "printing", "printStatusText": "打印中" } ],
  "shipment": { "carrierName": "顺丰", "trackingNo": "SF123", "shippedAt": "..." },
  "buyerRemark": "...", "createdAt": "...", "paidAt": "...", "reservedUntil": null
}
// 强约束：C 端响应中【禁止】包含 bom_snapshot、耗材信息、adminRemark
```

### 3.6 支付

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/payments` | 用户 | 创建支付，返回收银台 URL |
| GET | `/api/payments/:outTradeNo/status` | 用户 | 轮询支付状态 |
| POST | `/api/payments/alipay/notify` | **无（验签）** | 支付宝异步通知 |
| GET | `/api/payments/alipay/return` | 无 | 同步跳转，仅重定向 |

```jsonc
// POST /api/payments  { "orderNo": "20260827000123" }
// → data: { "outTradeNo": "20260827000123-847213", "payUrl": "https://openapi.alipay.com/..." }
// 前置校验：订单归属当前用户、status = pending_payment、reserved_until > now()
// 已存在 status='created' 的旧记录时先置为 'closed'

// GET /api/payments/:outTradeNo/status
// → data: { "status": "success", "orderStatus": "in_production" }
// status: 'pending' | 'success' | 'closed'
// 前端每 3 秒轮询一次，最长 5 分钟
// 本接口可主动调用 provider.queryPayment() 作为回调丢失时的兜底
```

**`POST /api/payments/alipay/notify`（强约束）**

处理顺序不得调整，任一步失败按标注返回：

| 步骤 | 校验 | 失败返回 |
|---|---|---|
| 1 | 验签 `checkNotifySign` | `failure` + warn 日志 |
| 2 | `trade_status ∈ {TRADE_SUCCESS, TRADE_FINISHED}` | `success`（忽略非成功通知） |
| 3 | `app_id` 与本方一致 | `failure` |
| 4 | `out_trade_no` 能查到 payments 记录 | `failure` |
| 5 | `total_amount == payments.amount` | `failure` + error 日志 + 告警 |
| 6 | `payments.status != 'success'` | 直接 `success`（幂等，不做任何变更） |
| 7 | 事务处理（见 TECH_SPEC §5.2） | 异常时 `failure`，等待重投 |

**响应体必须是纯文本 `success`**（无 JSON 包装、无换行），否则支付宝会持续重试。

若第 7 步中订单已被取消（更新影响行数为 0）：标记 `payments.needs_manual_review = true`，记 error 日志，返回 `success`，由人工在后台处理退款。

### 3.7 Cron

| 方法 | 路径 | 频率 |
|---|---|---|
| GET | `/api/cron/release-expired` | `* * * * *` |
| GET | `/api/cron/auto-complete` | `0 3 * * *` |
| GET | `/api/cron/low-stock-alert` | `0 9 * * *` |

均需 `Authorization: Bearer ${CRON_SECRET}`，不匹配返回 401。响应 `{ code: 0, data: { processed: 12 } }`。

---

## 4. 后台接口

Base：`/api/admin`。所有接口需 `admin_token`，并按标注校验权限。所有写操作需写入 `admin_operation_logs`。

### 4.1 认证与工作台

| 方法 | 路径 | 权限 |
|---|---|---|
| POST | `/api/admin/auth/login` | — |
| POST | `/api/admin/auth/logout` | 登录态 |
| GET | `/api/admin/auth/me` | 登录态 |
| POST | `/api/admin/auth/password` | 登录态（改自己密码） |
| GET | `/api/admin/dashboard` | `dashboard:view` |

```jsonc
// GET /api/admin/dashboard → data:
{
  "todayOrderCount": 12, "todaySalesAmount": "1580.00",
  "pendingProductionCount": 8, "pendingShipmentCount": 3,
  "needsReviewPaymentCount": 0,
  "lowStockMaterials": [
    { "id": "...", "name": "PLA 黑色", "availableGrams": "120.00", "safetyGrams": "200.00" }
  ]
}
```

### 4.2 订单管理

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/admin/orders` | `order:view` |
| GET | `/api/admin/orders/:id` | `order:view` |
| PATCH | `/api/admin/orders/:id/remark` | `order:remark` |
| POST | `/api/admin/orders/:id/ship` | `order:ship` |
| POST | `/api/admin/orders/:id/cancel` | `order:cancel` |
| POST | `/api/admin/orders/:id/refund` | `order:refund` |
| GET | `/api/admin/orders/export` | `order:export` |

```jsonc
// GET /api/admin/orders?status=&keyword=&startDate=&endDate=&page=&pageSize=
// keyword 同时匹配订单号与收货人手机号

// POST /api/admin/orders/:id/ship
{ "carrierCode": "sf", "carrierName": "顺丰速运", "trackingNo": "SF1234567890" }
// 前置：订单 status = 'pending_shipment' → 否则 40903

// POST /api/admin/orders/:id/refund
{ "amount": "118.00", "reason": "客户申请退款", "restock": true }
// 前置：订单已支付、amount <= paidAmount - refundedAmount
// 全额退款（amount == payableAmount）时额外执行：
//   - fn_refund_return_stock（若 restock=true）
//   - 折扣码 used_count -1，redemption → 'released'
// 部分退款：不回滚折扣码次数；restock=true 时不回滚（第一版部分退款不支持回滚耗材）
```

### 4.3 生产管理

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/admin/print-jobs` | `production:view` |
| POST | `/api/admin/print-jobs/:id/start` | `production:update` |
| POST | `/api/admin/print-jobs/:id/post-process` | `production:update` |
| POST | `/api/admin/print-jobs/:id/done` | `production:update` |
| POST | `/api/admin/print-jobs/:id/fail` | `production:update` |

```jsonc
// GET /api/admin/print-jobs?status=&materialId=&page=
// → data.list[]:
{
  "id": "...", "orderNo": "...", "productName": "...", "variantName": "...",
  "quantity": 2, "status": "queued", "printerName": null,
  "materials": [ { "name": "PLA 黑色", "colorHex": "#000000", "requiredGrams": "210.00" } ],
  "createdAt": "..."
}

// POST /api/admin/print-jobs/:id/start  { "printerName": "P1S-01" }

// POST /api/admin/print-jobs/:id/fail   { "remark": "翘边失败" }
// → 调用 fn_reprint_consume，任务回到 queued，failed_count +1
// → 响应中返回本次扣减明细与扣减后库存，若为负数附带 warning 字段

// POST /api/admin/print-jobs/:id/done
// → 若该订单所有 print_jobs 均为 done，订单自动转 pending_shipment
```

### 4.4 商品与分类

| 方法 | 路径 | 权限 |
|---|---|---|
| GET/POST | `/api/admin/categories` | `category:view` / `category:edit` |
| PATCH/DELETE | `/api/admin/categories/:id` | `category:edit` |
| GET | `/api/admin/products` | `product:view` |
| POST | `/api/admin/products` | `product:edit` |
| GET/PATCH | `/api/admin/products/:id` | `product:view` / `product:edit` |
| DELETE | `/api/admin/products/:id` | `product:edit` |
| POST | `/api/admin/products/:id/status` | `product:publish` |
| PUT | `/api/admin/products/:id/variants` | `product:edit` |
| POST | `/api/admin/upload` | `product:edit` |

```jsonc
// PUT /api/admin/products/:id/variants   —— 全量覆盖式保存
{
  "variants": [
    {
      "id": "...",                  // 新增时为 null
      "skuCode": "TOT-S-PLA-BLK",
      "name": "小号 / PLA / 黑色",
      "attributes": { "size": "小号", "material": "PLA", "color": "黑色" },
      "price": "59.00", "comparePrice": "79.00",
      "weightGrams": "120.00", "printHours": "3.50",
      "imageUrl": "...", "isActive": true,
      "bom": [ { "materialId": "...", "grams": "100.00" } ]
    }
  ]
}
// 保存校验（强约束）：
//   - isActive = true 的变体，bom 数组不得为空 → 40911
//   - skuCode 全局唯一
//   - 被订单引用过的变体不允许物理删除，只能 isActive = false
//   - 保存后更新 products.min_price
// 响应中返回每个变体当前 availableQty（来自 v_variant_availability）

// POST /api/admin/upload   multipart/form-data
// field: file, type='image'|'model'
// image: jpg/png/webp, <= 5MB；model: glb, <= 20MB
// 必须校验 magic number，不信任 Content-Type
// → data: { "url": "https://..." }
```

### 4.5 耗材管理

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/admin/materials` | `material:view` |
| POST | `/api/admin/materials` | `material:edit` |
| PATCH | `/api/admin/materials/:id` | `material:edit` |
| POST | `/api/admin/materials/:id/stock-in` | `material:stock_in` |
| POST | `/api/admin/materials/:id/adjust` | `material:adjust` |
| POST | `/api/admin/materials/:id/toggle` | `material:edit` |
| GET | `/api/admin/materials/:id/movements` | `material:view` |
| GET | `/api/admin/materials/:id/variants` | `material:view` |

```jsonc
// GET /api/admin/materials?keyword=&type=&lowStockOnly=&page=
// → data.list[]:
{
  "id": "...", "code": "PLA-BLK-175", "name": "PLA 黑色 1.75mm",
  "materialType": "PLA", "colorName": "黑色", "colorHex": "#000000",
  "spec": "1.75mm / 1kg", "unitCostPerKg": "65.00",
  "stockGrams": "3200.00", "reservedGrams": "420.00", "safetyGrams": "200.00",
  "availableGrams": "2580.00",        // = stock - reserved - safety
  "wasteRate": "0.0500", "isActive": true, "isLowStock": false,
  "usedByVariantCount": 12
}

// POST /api/admin/materials/:id/stock-in
{ "grams": "1000.00", "unitCostPerKg": "65.00", "batchNo": "B20260827", "remark": "补货" }
// → 写 purchase_in 流水

// POST /api/admin/materials/:id/adjust
{ "targetGrams": "3150.00", "remark": "盘点差异" }
// → delta = target - current，写 adjust 流水，记录调整前后快照

// POST /api/admin/materials/:id/toggle   { "isActive": false }
// 停用前必须先调用 /variants 展示受影响变体数量，由前端二次确认
// 停用即时生效：v_variant_availability 中相关变体 availableQty 变为 0

// GET /api/admin/materials/:id/movements?type=&startDate=&endDate=&page=
```

### 4.6 用户管理

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/admin/users` | `user:view` |
| GET | `/api/admin/users/:id` | `user:view` |
| POST | `/api/admin/users/:id/status` | `user:disable` |

响应中手机号**必须脱敏**为 `138****8000`，仅在订单详情的收货信息中展示完整号码。

### 4.7 优惠管理

| 方法 | 路径 | 权限 |
|---|---|---|
| GET/POST | `/api/admin/promotions` | `promotion:view` / `promotion:edit` |
| PATCH | `/api/admin/promotions/:id` | `promotion:edit` |
| GET/POST | `/api/admin/discount-codes` | `promotion:view` / `promotion:edit` |
| PATCH | `/api/admin/discount-codes/:id` | `promotion:edit` |
| POST | `/api/admin/discount-codes/:id/toggle` | `promotion:edit` |
| GET | `/api/admin/discount-codes/:id/redemptions` | `promotion:view` |

```jsonc
// POST /api/admin/discount-codes
{
  "promotionId": "...",
  "code": "welcome10",          // 服务端转大写存储，唯一校验
  "codeType": "limited",        // 'permanent' | 'limited'
  "maxUses": 100,               // permanent 时必须为 null
  "perUserLimit": 1,            // 默认 1
  "startsAt": "2026-09-01T00:00:00+08:00",
  "endsAt": "2026-09-30T23:59:59+08:00",
  "remark": "新人活动"
}

// GET /api/admin/discount-codes → data.list[]:
{
  "id": "...", "code": "WELCOME10", "promotionName": "新人立减10元",
  "codeType": "limited", "maxUses": 100, "usedCount": 37,
  "perUserLimit": 1, "startsAt": "...", "endsAt": "...",
  "isActive": true, "status": "active"
}
// status 为计算字段：'active' | 'disabled' | 'not_started' | 'expired' | 'exhausted'

// POST /api/admin/discount-codes/:id/toggle  { "isActive": false }  ← 即时生效
```

### 4.8 权限与配置（超管）

| 方法 | 路径 | 权限 |
|---|---|---|
| GET/POST | `/api/admin/admins` | `admin:view` / `admin:edit` |
| PATCH | `/api/admin/admins/:id` | `admin:edit` |
| POST | `/api/admin/admins/:id/reset-password` | `admin:edit` |
| GET/POST | `/api/admin/roles` | `admin:view` / `role:edit` |
| PATCH | `/api/admin/roles/:id` | `role:edit` |
| GET/PUT | `/api/admin/settings` | `settings:edit` |
| GET/PUT | `/api/admin/shipping-rules` | `settings:edit` |
| GET | `/api/admin/logs` | `admin:view` |

`is_system = true` 的角色不允许删除；禁止将自己的角色改为无 `admin:edit` 权限的角色。
