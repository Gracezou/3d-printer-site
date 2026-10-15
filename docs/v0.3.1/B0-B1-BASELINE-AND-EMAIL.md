# v0.3.1 B0/B1 基线与业务邮件契约

> 日期：2026-10-15。基线提交 `c902b4c`（v0.3.0）。B2/B3 的视觉和购物交互方案留待讨论。

## B0 现状核对

| 路径 | 已有行为 | 后续缺口 |
|---|---|---|
| 首页与商品发现 | 首页有机型选择器；商品筛选写入 URL | 首屏高度、移动端已选条件和局部反馈属 B2 |
| 详情与规格 | 稀疏 SKU 有可选组合约束，已选维度可再次点击取消 | 冲突属性清除、引导文案及统一选择行为属 B2 |
| 购物车与结算 | 购物车有乐观操作；结算金额、优惠和运费由现有服务计算 | 局部失败回滚、连续操作和移动布局属 B3 |
| 账户与售后 | 订单详情可查看/提交售后；审核结果此前仅站内查看 | B1 增加业务邮件，B3 再讨论信息层级 |
| 邮件 | 登录验证码由 Supabase Auth 自定义 SMTP 发送 | 缺少独立业务邮件队列及订单、售后、开模通知 |

Stage v0.3.0 的只读 HTTP 基线（本机经公网单次请求，2026-10-15；非浏览器交互性能指标）：首页 200 / 4.21s / 78,860B，商品列表 200 / 3.07s / 49,804B，购物车页面 200 / 2.52s / 18,323B。页面截图及同条件交互性能复测留在 B2/B3 方案确认后执行，不能将单次公网耗时当作 LCP/INP。

数据库迁移原为 0000–0008；B1 新增 0009。隔离本地 PostgreSQL 17 已从空库执行至 0009，未对共享 Supabase 库执行迁移或测试写入。目标 Stage/生产库身份在实际发布前由既有部署脚本再次核对。

## B1 发送方案

- 业务邮件使用独立 SMTP 配置（`BUSINESS_SMTP_*`、`BUSINESS_MAIL_FROM`）；登录验证码仍由 Supabase Auth 管理。选择普通 SMTP 是为了与当前发信方式兼容，具体服务商由部署环境提供。发件域使用 `notify.` 身份，配置 SPF/DKIM/DMARC 后开启。
- 业务事务内仅写 `email_messages(pending)`；定时任务每分钟运行，每批最多发送 3 封。唯一 `dedupe_key` 防止重复入队，行锁和租约防止并发认领。
- SMTP 明确 4xx 拒绝采用退避重试，最多 5 次；明确 5xx 拒绝标记 `failed`；连接中断、超时、租约过期或发送后落账失败标为 `unknown`，不盲目自动重发。SMTP 无统一查询接口，未知结果需根据消息 ID 到服务商日志核实。
- Stage 开启业务邮件时必须设置 `BUSINESS_MAIL_ALLOWED_RECIPIENTS`；名单外邮箱标为失败且不发送。`BUSINESS_MAIL_ENABLED=false` 时任务不认领队列；启用前检查积压，避免旧测试事件被误发。
- 邮件仅含订单编号、机型及站内链接，不含完整收货地址、支付密钥或售后凭证。站内状态是权威来源。

### 事件矩阵

| 事件 | 触发点 | 去重键 | 邮件含义 |
|---|---|---|---|
| 支付成功 | 支付确认事务把订单置为 `in_production` 且库存提交成功 | `payment_paid:<payment id>` | 已支付，将安排制作 |
| 开始制作 | 第一件打印任务从 `queued` 转为 `printing` | `production_started:<order id>` | 已实际进入制作 |
| 发货 | 发货事务创建 `shipments` | `order_shipped:<shipment id>` | 已发货，订单页查看物流 |
| 售后驳回 | 申请从 `pending` 变为 `rejected` | `return_rejected:<request id>` | 审核未通过，站内看详情 |
| 售后通过 | 申请关联退款成功落账并更新申请状态 | `return_approved:<request id>` | 审核通过，退款状态以站内为准 |
| 退款成功 | `refunds` 从 `pending` 成功落账 | `refund_succeeded:<refund id>` | 退款已处理，到账看原渠道 |
| 开模可购 | 机型已开模、可见且关联在售有库存商品 | `model_opened:<request id>` | 登记机型已有商品可买 |

支付/退款回调重放只复用同一去重键；失败或状态未持久化时不能入队成功通知。开模登记保持 `pending`，邮件确认发出后变为 `notified`；仅勾选已开模但不能购买时不发。

## 迁移、回滚与运维

1. 发布前先将 0009 应用于 Stage；检查 RLS、表权限与队列索引。0009 只新增表及索引，不更改订单、支付、退款或登记表；旧应用可继续运行。
2. 配置业务 SMTP、站点 URL、Cron 密钥及 Stage 白名单；先保持 `BUSINESS_MAIL_ENABLED=false`，核对配置和积压后再开启。Stage 仅用受控邮箱做真实投递验收。
3. 回滚新应用时保留 0009 表和消息历史，旧应用会忽略它。重新发布前检查积压和 `unknown`。真正撤销 0009 须先完成邮件对账、导出记录、确认无未处理消息，再单独审批数据删除。

加载对应私有 `.env` 后可执行 `pnpm business-email:ops list` 查看前 100 条未完成消息（邮箱已遮蔽）。`failed` 可用 `pnpm business-email:ops retry <uuid>` 重排；`unknown` 必须先按消息 ID 核对服务商日志确认未投递，再运行 `pnpm business-email:ops retry <uuid> --confirmed-not-delivered`。脚本不会重排 `sent` 消息。Stage 白名单造成的 `recipient_not_allowed` 需先核对收件人与配置。

## 本地验证

- 空库迁移 0000–0009 成功；`email_messages` 启用 RLS，`anon`/`authenticated` 无 SELECT，`service_role` 有 SELECT/INSERT。
- 隔离本地库验证相同事件去重、开模资格、成功投递、4xx 重试、结果未知隔离及 Stage 白名单阻断；样例记录已清零。
- 同一隔离库复跑支付、生产看板、售后集成脚本通过；售后脚本已清理运行期间生成的测试邮件记录，不触发真实 SMTP。
- `pnpm test`（53 文件/214 项）、`pnpm lint`、`pnpm typecheck` 通过。真实 SMTP 投递与 Stage 邮件链接仍属于 T226 发布验收。
