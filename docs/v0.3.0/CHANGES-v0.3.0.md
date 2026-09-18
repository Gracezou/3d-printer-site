# 变更说明 v0.3.0 — 退款引擎商品级重构

- 状态：**需求已定稿，待执行**
- 定稿日期：2026-09-15（**全文重写**。前一版基于旧定位与旧范围，已作废）
- 分支：`release-v0.3.0`
- 基线：v0.2.2（线上运行版本）
- 版本性质：**动钱与库存的版本，出错代价最高。范围务必保持收窄。**

---

## 0. 版本定位与序列

### 0.1 为什么现在做

支付宝企业商户号审核期间，开发侧的最优安排是把「收真钱之后立刻会痛」的能力补齐。退款是其中第一位——**真实收款上线后的第一个客诉就会用到它**。

v0.2.3（境内迁移与延迟验证）的剩余任务大部分依赖服务器部署与域名切换，可与本版本并行，互不阻塞（本版本不碰部署）。

### 0.2 版本序列

| 版本 | 内容 | 改表 |
|---|---|---|
| v0.2.2（线上） | 机型库 + 首页重构 + 机型页 SEO | 是 |
| v0.2.3（执行中） | 跨境延迟实测 + 应用迁上海 + 备案配合 + 域名切换 | 否 |
| **v0.3.0（本文档）** | **退款引擎商品级重构 + 客户端退款申请** | **是** |
| v0.3.1 | 订单状态邮件通知 + 意向登记开模通知 | 是 |
| v0.3.2 | 购物路径体验（机型筛选、规格选择、购物车结算、账户页、a11y、Playwright） | 否 |
| v0.4.0 | 3D 实时换色预览 + SKU 图片联动 + 出境合规协议 | 待定 |

---

## 1. 目标与边界

**做**：退款从订单级改为商品级、优惠与运费分摊、库存返还按 BOM 快照、退款成功后移出打印队列、客户端退款申请与准入判定、尺寸不符例外情形、后台审核队列。

**不做**：
- 部署、迁移、域名（归 v0.2.3）
- 邮件通知（归 v0.3.1）——本期审核结果只在站内订单中心可见
- 购物路径体验（归 v0.3.2）
- 切换支付宝生产凭据（待商户号批复）
- **不改动支付（`payments`）与下单（`order.service.ts`）的既有逻辑**

---

## 2. 前置结论（代码勘察）

| 发现 | 影响 |
|---|---|
| `refunds` 表只有 `order_id` / `payment_id` / `amount` / `is_full_refund` / `restock` / `operator_id` | **完全没有商品维度**，这是本版本的核心改造点 |
| `refund.service.ts` 的 `refundOrder()` 是单个 263 行函数，接受一个总金额 | 需重构为按商品明细驱动 |
| **`restock: isFullRefund && input.restock`** | **现状是部分退款根本不返还库存**——这是个实打实的缺陷，本期一并修掉 |
| `refunds.operator_id` 关联 `admin_users`，无用户发起路径 | 客户端申请需要新表，不能复用 `refunds` |
| `print_jobs` 已是 **order_item 级**，`order_item_id` 上有唯一约束，状态 `queued → printing → post_processing → done` | 退款准入判定与打印队列联动可直接落地，无需新增跟踪结构 |
| `orders` 有 `refunded_amount` 累计字段 | 订单状态计算依赖它，重构时须保持语义 |
| 错误码已用到 40914（v0.2.2 占用 40913/40914） | 本期从 **40915** 起 |

---

## 3. 已确认的设计决策

| # | 决策 | 出处 |
|---|---|---|
| D1 | **优惠按商品小计比例分摊**。全部退完时累计退款额恰等于实付金额 | A8 |
| D2 | 部分退款**不退运费**；全部商品退完时**连运费一起退**；退货后跌破包邮门槛**不补收运费** | A9 |
| D3 | 客户端申请准入：**仅 `print_job.status = queued` 允许**；进入 `printing` 起不允许（耗材已消耗）。**后台管理员不受此限制** | A10 |
| D4 | 售后走**申请单 → 后台审核 → 退款**，不允许客户端直接触发退款 | A7 |
| D5 | **尺寸不符 / 装配问题为例外情形**，允许后台在任何状态下受理。外壳是精密配合件，此类投诉率远高于普通商品 | §H5 |
| D6 | 七天无理由退货：产品方决定不提供。**工程上退款准入规则必须做成可配置，不得把「不允许退款」硬编码** | §J4 |

---

## 4. 任务增量（T201–T210）

### 4.1 数据层

#### T201 退款数据模型商品级改造
- 新增 `refund_items` 与 `return_requests` / `return_request_items`（见 §5）
- `refunds` 保留为**一次退款操作的头**，`amount` = 明细之和；`restock` 字段**下沉到 `refund_items`**（每件商品单独决定是否返还库存——运营的实际判断就是按件做的：这件已打印不返还，那件还没打印返还）
- 迁移必须**前向兼容**，历史订单级退款记录保持可读
- **验收**：现有 `test:refunds` 在迁移后仍然通过

### 4.2 退款引擎

#### T202 ⚠️ 金额分摊引擎（本版本最容易出错的地方）
- 依赖：T201
- 按 D1 实现优惠的比例分摊，按 D2 实现运费规则
- **关键约束：不得逐项独立四舍五入。** 逐项 `round()` 会在多商品订单上累积分位差，导致「全部退完」的累计金额与实付金额对不上（多退或少退几分钱）。
  **正确做法：最后一项用「实付总额 − 已分摊之和」兜底**，而不是独立计算
- 金额一律 `decimal.js` + `DECIMAL(10,2)`，禁止 JS `number`
- **验收**：构造 3 件不同单价 + 满减 + 运费的订单，逐件退完，**累计退款额必须精确等于实付金额**（这是本任务唯一不可妥协的验收项）

#### T203 库存返还按 BOM 快照
- 依赖：T201
- 按 `order_items.bom_snapshot` 计算返还量，**不读实时 BOM**（§3.2 的既有约束）
- **修掉现状缺陷**：部分退款此前完全不返还库存
- 返还与否由 `refund_items.restock` 决定，运营在审核时按件选择
- **验收**：部分退款返还库存后，`v_variant_availability` 的可售数正确回升；库存流水可追溯到具体 `refund_item`

#### T204 打印队列联动
- 依赖：T201、T203
- 退款成功后，按该 `order_item` 的剩余未退件数重算 `queued` 打印数量；数量为 0 才移出队列
- 仅处理 `status = queued` 的任务；已进入 `printing` 及之后的不自动取消（耗材已消耗，需人工判断）
- **验收**：部分退款后队列数量与剩余未退数量一致，全部退完才移除；已开始打印的任务不被误取消

#### T205 `refundOrder` 重构
- 依赖：T202、T203、T204
- 由「接受一个总金额」改为「接受商品明细」
- 订单状态计算：**所有商品退完 → `refunded`；部分退款 → 保持原状态**
- ⚠️ **本任务会重写 `96126c5 fix: preserve order state for partial refunds` 的逻辑。必须保留该修复的行为语义，并补齐针对它的回归测试**，否则等于把刚填的坑重新挖开
- 保持 Provider 抽象：**不得引用任何支付宝 SDK 类型或字段名**（§3.8）
- 渠道首次明确拒绝可标记失败；一旦经历 `unknown` 或进入续记，后续拒绝也只能保持 `pending` 并转人工复核
- **验收**：后台直接退款与客户端申请退款两条路径，产生的金额、库存流水、审计日志**逐条一致**

#### T209 幂等与并发保护
- 依赖：T205
- 现有 `uq_movements_order_once` 是订单级幂等，商品级退款需要**新的幂等键**（建议 `(refund_id, order_item_id)` 唯一）
- 不可超额退款、不可重复退款、不可对同一 `order_item` 重复返还库存
- 加锁顺序遵循既有约束：**按 `material_id` 升序**（§3.3）
- 同退款处理租约由数据库时钟计算，并在每次渠道调用前续租；续记始终复用原退款号
- **验收**：并发发起同一商品的退款，只有一次成功；重放退款回调不产生重复流水

### 4.3 客户端申请与审核

#### T206 客户端退款申请
- 依赖：T201
- 用户按**商品**发起申请，可多选订单内的商品
- 准入判定按 D3：查该 `order_item` 的 `print_job.status`
- **准入规则实现为可配置**（D6），不得硬编码
- 同一订单同时只允许一条 `pending` 申请（部分唯一索引）
- **申请单本身不动库存、不动金额**，仅记录诉求
- 凭证图片复用既有 `upload.service`（沿用其权限、扩展名、体积与 magic number 校验）
- **验收**：`printing` 状态的商品申请被拒（40916）；重复申请被拒（40915）

#### T207 尺寸不符例外情形
- 依赖：T206
- 按 D5：`reason_code` 为尺寸不符 / 装配问题时，**后台可在任何状态下受理**
- 该类申请在审核队列中显著标记，便于优先处理
- **验收**：`done` 状态的商品以尺寸不符为由申请，后台可正常受理并完成退款

#### T208 后台审核队列
- 依赖：T206、T205
- 新增权限码 `return:review`，纳入既有 RBAC 与角色配置页
- 审核通过 → 调用重构后的退款引擎；`restock` 由运营按件选择
- 审核界面**必须展示每件商品当前的 `print_job` 状态**，供运营判断是否返还库存
- 审核动作与 `admin_operation_logs` **同事务写入**
- **验收**：无 `return:review` 权限访问返回 403

### 4.4 回归

#### T210 回归测试与文档
- 依赖：T201–T209
- 新增 `test:refund-items`、`test:return-requests`，纳入 `test:acceptance`
- **必须补齐针对 `96126c5` 修复语义的回归测试**
- README 与 API 文档同步

---

## 5. 数据模型变更

**不触碰** `payments` / `print_jobs`（仅读与状态更新）/ `materials` / `product_variants` 的结构。

### 5.1 `refund_items`（新增）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `refund_id` | uuid FK → refunds | |
| `order_item_id` | uuid FK → order_items | |
| `quantity` | int | 本次退款数量 |
| `items_amount` | numeric(10,2) | 该商品的商品金额部分 |
| `discount_share` | numeric(10,2) | 分摊到本商品的优惠额 |
| `shipping_share` | numeric(10,2) | 分摊运费，通常为 0（见 D2） |
| `amount` | numeric(10,2) | 实退金额 = items_amount − discount_share + shipping_share |
| `restock` | boolean | **是否返还库存，按件决定** |
| `created_at` | timestamptz | |

约束：`unique(refund_id, order_item_id)`（T209 幂等键）。

### 5.2 `return_requests`（新增）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `request_no` | varchar(32) unique | 对用户展示 |
| `order_id` | uuid FK → orders | `ON DELETE RESTRICT` |
| `user_id` | uuid FK → user_profiles | 查询必须同时带 `user_id` 条件（§5-3 约束） |
| `reason_code` | varchar(30) | 含尺寸不符 / 装配问题（D5） |
| `reason_text` | varchar(500) | |
| `images` | jsonb | 凭证图片 |
| `status` | varchar(20) | `pending` / `approved` / `rejected` / `completed` / `cancelled` |
| `reviewer_id` | uuid FK → admin_users | |
| `review_remark` | text | |
| `reviewed_at` | timestamptz | |
| `refund_id` | uuid FK → refunds nullable | 通过并退款后回填 |
| `created_at` / `updated_at` | timestamptz | |

约束：部分唯一索引 `uq_return_pending_per_order`（同一订单下 `status = 'pending'` 只允许一条）。

### 5.3 `return_request_items`（新增）

| 字段 | 类型 |
|---|---|
| `request_id` | uuid FK → return_requests |
| `order_item_id` | uuid FK → order_items |
| `quantity` | int |

主键 `(request_id, order_item_id)`。

### 5.4 迁移要求

- 前向兼容；历史订单级退款记录保持可读
- 发布前建立 Supabase 可恢复点

---

## 6. 接口变更

| 方法与路径 | 说明 |
|---|---|
| `POST /api/returns` | 用户按商品提交退款申请 |
| `GET /api/returns` | 用户申请列表 |
| `GET /api/returns/[requestNo]` | 申请详情（必须带 `user_id` 条件查询） |
| `POST /api/returns/[requestNo]/cancel` | 撤销 `pending` 申请 |
| `POST /api/returns/upload` | 登录用户上传售后凭证，复用既有图片安全校验 |
| `GET /api/admin/returns` | 审核队列，需 `return:review` |
| `POST /api/admin/returns/[id]/approve` | 审核通过并发起退款，需同时具备 `return:review` 与 `order:refund`（待 Grace 确认） |
| `POST /api/admin/returns/[id]/reject` | 驳回，需 `return:review` |
| `POST /api/admin/refunds/[id]/void` | 人工核实渠道未出款后作废待复核退款，需 `order:refund` |
| `POST /api/admin/orders/[id]/refund` | **改为接受商品明细**（破坏性变更，后台前端需同步） |

订单详情响应新增：每件商品的可退款状态与对应 `print_job` 状态。

---

## 7. 错误码增量

已用到 40914，本期从 **40915** 起：

| 码 | 常量 | HTTP | 场景 |
|---|---|---|---|
| 40915 | `RETURN_REQUEST_EXISTS` | 409 | 同一订单已有 pending 申请 |
| 40916 | `RETURN_NOT_ALLOWED` | 409 | 该商品当前状态不允许客户申请 |
| 40917 | `RETURN_STATUS_INVALID` | 409 | 申请单状态不允许该操作 |
| 40918 | `RETURN_AMOUNT_EXCEEDED` | 409 | 退款金额超过该商品可退余额 |
| 40919 | `RETURN_FIT_EXCEPTION` | 409 | 尺寸不符例外情形的受理校验 |
| 40920 | `REFUND_IN_PROGRESS` | 409 | 同一退款正在由其他请求处理 |
| 40921 | `ZERO_AMOUNT_REFUND` | 409 | 退款明细计算结果为 0，拒绝发起渠道退款 |
| 40922 | `REFUND_REJECTED` | 409 | 支付渠道已明确拒绝退款，可修正后重新发起 |
| 40923 | `REFUND_MANUAL_REVIEW_REQUIRED` | 409 | 重试或续记收到拒绝，但历史渠道结果不确定，必须人工复核 |

---

## 8. 验收标准

| # | 验收项 | 判定 |
|---:|---|---|
| 1 | **分摊精确性** | 3 件不同单价 + 满减 + 运费的订单，逐件退完，**累计退款额精确等于实付金额** |
| 2 | 运费规则 | 部分退款不含运费；全部退完时运费一并退回；跌破包邮门槛不补收 |
| 3 | 库存返还 | 部分退款返还库存后可售数正确回升；流水可追溯到具体 `refund_item` |
| 4 | 打印队列联动 | 退款后 `queued` 任务移出队列；`printing` 及之后的不被误取消 |
| 5 | 订单状态 | 全部退完 → `refunded`；部分退款保持原状态（`96126c5` 的语义未被破坏） |
| 6 | 两路径一致 | 后台直接退款与客户端申请退款的金额、库存流水、审计日志逐条一致 |
| 7 | 幂等 | 并发发起同一商品退款只有一次成功；重放不产生重复流水 |
| 8 | 不可超额 | 退款金额不得超过该商品可退余额（40918） |
| 9 | 客户端准入 | `printing` 商品申请被拒（40916）；重复申请被拒（40915） |
| 10 | 尺寸不符例外 | `done` 状态商品以尺寸不符为由可被后台受理 |
| 11 | 权限隔离 | 无 `return:review` 权限访问审核队列返回 403 |
| 12 | 准入可配置 | 退款准入规则可通过配置调整，未硬编码 |
| 13 | 既有链路 | 现有单元测试与 `test:acceptance` 全部通过 |

质量门禁沿用：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm security:audit`。

---

## 9. 遗留风险

| 项 | 说明 |
|---|---|
| **分摊算法的分位差** | 逐项四舍五入会导致全额退款对不上实付金额。验收项 1 是本版本的红线，不可放宽 |
| **会重写已修复的缺陷** | T205 触及 `96126c5 fix: preserve order state for partial refunds`。必须保留语义并补回归测试 |
| **审核通过后用户收不到通知** | 本期无邮件能力，结果只在站内订单中心可见。归 v0.3.1，页面文案需明示「请在订单中心查看处理结果」 |
| 沙箱与生产的退款差异 | 生产退款行为可能与沙箱不同（v0.1 T071）。商户号批复后需以真实小额订单复验本版本全部退款路径 |
| 七天无理由退货 | 产品方决定不提供（§J4）。切换企业主体后消费者可通过支付宝与 12315 投诉，承担方为公司。**这是准入规则必须可配置的原因** |
| 跨境延迟对事务的影响 | 退款同样在事务内执行多次数据库往返。若 v0.2.3 的 L1 结论显示延迟偏高，本版本的事务耗时需一并观察 |
