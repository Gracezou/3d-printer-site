# 任务拆解 — 3D 打印成品独立站

> 供实现 Agent 按序执行。任务按依赖排序，同阶段内的任务可并行。

---

## 0. 执行原则（强约束）

1. **先读文档再动手**：开始任一任务前，先阅读 `PRD.md`、`TECH_SPEC.md`、`DATA_MODEL.md`、`API_SPEC.md` 中对应章节
2. **DDL 是权威**：Drizzle schema 必须与 `DATA_MODEL.md` 的 DDL 逐字段一致。若发现 DDL 有误，**停下来报告，不要自行修改后继续**
3. **不跳阶段**：P3 之前不得开始 P4，因为前台依赖后台录入的数据
4. **每阶段验收**：完成一个阶段后运行该阶段验收项，全部通过再进入下一阶段
5. **遇到文档未覆盖的决策**：停下来提问，不要自行假设。特别是涉及金额、库存、状态流转的部分
6. **禁止事项复核**：每次提交前自查 —— 是否在组件里写了业务逻辑？是否用 `number` 算了金额？是否有先查后写的并发漏洞？是否有查询未带 `user_id` 条件？

### 当前执行计划（2026-08-30）

- 已提交：T070 后台订单管理、T080 优惠规则管理、本地端口调整为 `5003`（`97a9004`）
- 已提交：T060 Provider + Mock、T061 Alipay Provider、T062 支付接口、T063 异步回调、T064 支付页面（`321fb6a`）
- 已提交：T071 退款接口与后台操作页（`4569a62`）
- 已提交：T072 生产任务、T073 生产看板、T074 工作台（`efac828`）
- 已提交：T081 折扣码管理（`66d45d0`）
- 已提交：T090 用户订单中心（`ef97652`）
- 已提交：T091 用户管理后台（`8f6d9b8`）
- 已提交：T092 管理员与角色管理（`629b51e`）
- 已提交：T093 站点配置（`2b09c7b`）
- 已提交：T100 定时任务（`9e1376e`）；数据库回归已覆盖批次限制、超时释放、库存与折扣回滚、支付关闭、自动确认收货、低库存快照和幂等性
- 已完成：T101 全链路验收及可重复的全套 v0.1 演示数据，PRD §8 的 14 项验收全部通过
- 已完成：T102 安全自查，修复 strict 入参与间接依赖漏洞，生产 bundle 无 Service Role 泄漏
- 已完成：T103 README、v0.1 文档归档与 Release Notes；发布提交上创建 `v0.1` Tag
- 支付宝沙箱配置与真实全链路回归按当前安排后续补充，不阻塞其余业务功能开发
- 下一步：按 `CHANGES-v0.2.md` 执行 T104 新加坡服务器初始化
- 支付宝沙箱参考实现位于本机 `alipay-demo` 项目；只迁入已验证的 RSA2 签名、验签、电脑网站支付和主动查询逻辑，不复制示例项目的页面、构建产物或客户端金额处理
- 支付实现必须适配本文档的 Provider 抽象，并严格执行 `TECH_SPEC.md` §5.2 的数据库金额校验、回调幂等、库存实扣、折扣确认、生产任务创建和晚到回调人工复核
- 沙箱密钥只写入被 Git 忽略的 `.env.dev`，禁止进入源码、日志、测试快照或提交记录

执行结果与后续顺序：

1. T100 定时任务；完成验证后立即提交代码
2. T101 全链路验收，同时创建一整套可重复生成的 v0.1 有效测试数据
3. T102 安全自查并修复发现的问题
4. T103 更新 README、归档 v0.1 五份文档、整理 v0.1 Release Notes、提交并发布 `v0.1` Tag
5. 以 `CHANGES-v0.2.md` 为当前增量规范，依次执行 T104 服务器初始化、T105 部署流水线、T106 支付宝沙箱联调

支付宝沙箱真实全链路回归归入 T106，在新加坡部署环境与配置补齐后执行。

---

## P0 项目基建

### T001 初始化项目
- 依赖：无
- Next.js 15 App Router + TypeScript（`strict: true`）+ Tailwind + shadcn/ui
- 目录结构严格按 `TECH_SPEC.md` §3 创建
- 配置 ESLint + Prettier，规则中禁用 `any`
- 创建 `.env.example`（按 `TECH_SPEC.md` §12），`.env.local` 加入 `.gitignore`
- **验收**：`pnpm dev` 启动无错误，`pnpm typecheck` 通过

### T002 基础设施封装
- 依赖：T001
- `lib/errors.ts`：`BizError` 类 + 错误码常量（按 `API_SPEC.md` §2 全量定义）
- `lib/api-response.ts`：`ok(data)` / `fail(err)` / `withErrorHandler(handler)`
- `lib/money.ts`：基于 `decimal.js` 的金额工具（`add/sub/mul/percent/toFixed2`）
- `lib/logger.ts`：pino 实例 + `requestId` 中间件 + 手机号脱敏工具
- `lib/storage.ts`：`upload/delete/getPublicUrl`，内部调用 Supabase Storage
- **验收**：单元测试覆盖 `money.ts` 的加减乘与百分比向下取整

### T003 数据库连接与 Drizzle 配置
- 依赖：T001
- `lib/db/client.ts`，配置连接池
- `drizzle.config.ts`，migration 输出到 `lib/db/migrations`
- **验收**：能连通 Supabase 并执行 `SELECT 1`

---

## P1 数据层

### T010 Drizzle Schema
- 依赖：T003
- 按 `DATA_MODEL.md` §3~§13 定义全部表，按领域拆分文件（`user.ts`/`product.ts`/`material.ts`/`order.ts`/`promotion.ts`/`admin.ts`/`config.ts`）
- decimal 列映射为 `string` 类型
- **验收**：`drizzle-kit generate` 产出的 SQL 与文档 DDL 一致（人工比对字段名、类型、约束）

### T011 手写 SQL 迁移
- 依赖：T010
- Drizzle 无法表达的部分写入独立 migration 文件：
  - `fn_set_updated_at` 触发器函数 + 各表触发器
  - 所有 `CHECK` 约束与部分索引（含 `uq_movements_order_once`）
  - `v_variant_availability` 视图
  - `fn_generate_order_no` + `seq_order_no`
  - `DATA_MODEL.md` §15 的 5 个库存存储过程
- **验收**：迁移可在空库上一次性执行成功；重复执行不报错（使用 `CREATE OR REPLACE` / `IF NOT EXISTS`）

### T012 种子数据脚本
- 依赖：T011
- 按 `DATA_MODEL.md` §16 写入角色、运费规则、站点配置
- 超管密码随机生成并输出到控制台，**禁止**硬编码
- **验收**：空库执行后可用输出的密码登录后台

### T013 库存函数测试
- 依赖：T011
- 编写 SQL 级测试：造 2 种耗材 + 1 个双料 BOM 变体，验证预扣 → 消耗 → 释放的克数对称性
- 验证 `uq_movements_order_once` 能拦截重复 `consume`
- **验收**：`PRD.md` §8 验收项 2、3、4 的数据库层部分通过

---

## P2 鉴权

### T020 C 端鉴权
- 依赖：T010
- `lib/auth/customer.ts`：Supabase Auth 手机号 OTP 封装，`requireCustomer()`
- 首次登录创建 `user_profiles`；`status = disabled` 抛 `ACCOUNT_DISABLED`
- 接口：`/api/auth/send-code`、`/api/auth/verify`、`/api/auth/logout`、`/api/auth/me`
- 验证码限流：同手机号 60s，同 IP 每小时 10 次
- **验收**：完整走通注册登录；60s 内二次发送返回 40103

### T021 后台鉴权
- 依赖：T010, T012
- `lib/auth/admin.ts`：bcrypt 校验 + JWT 签发 + Cookie 读写
- `lib/auth/permissions.ts`：权限码常量（`DATA_MODEL.md` §4.1）+ `requirePermission()`，`["*"]` 视为全权限
- `middleware.ts`：拦截 `/admin/*` 与 `/api/admin/*`
- 登录失败 5 次锁定 15 分钟
- **验收**：无权限账号调用受限接口返回 403；连续错密 5 次后返回 40106

### T022 操作日志
- 依赖：T021
- `withAdminLog(action, targetType)` 包装器，自动写 `admin_operation_logs`
- **验收**：任一后台写操作后能在日志表查到记录

---

## P3 后台：耗材与商品

> 这一阶段必须先于前台，否则前台没有数据可展示。

### T030 耗材 CRUD
- 依赖：T021
- Service：`material.service.ts`
- 接口：`API_SPEC.md` §4.5 全部
- 入库、调整、停用均通过流水表记录，**禁止**直接 UPDATE 库存字段而不写流水
- **验收**：入库 1000g 后 `stock_grams` 增加且流水有 `purchase_in` 记录；调整后流水记录调整前后快照

### T031 耗材管理页面
- 依赖：T030
- 列表（含可用克数、色块、低库存标红置顶）、新增/编辑弹窗、入库弹窗、调整弹窗、流水抽屉
- 停用前调用 `/variants` 展示受影响变体数并二次确认
- **验收**：`PRD.md` §6.5 全部功能可用

### T032 分类管理
- 依赖：T021
- 树形增删改、排序、显隐
- **验收**：可建两级分类并调整顺序

### T033 商品 CRUD + 变体与 BOM
- 依赖：T030, T032
- Service：`product.service.ts`
- `PUT /variants` 为全量覆盖式保存，含 `PRD.md` §6.4 的全部校验
- 启用变体必须有 BOM，否则 40911
- 保存后更新 `products.min_price`
- **验收**：`PRD.md` §8 验收项 2（多耗材 BOM 不可售）通过；无 BOM 的启用变体保存被拒绝

### T034 商品管理页面
- 依赖：T033
- 列表、编辑页（基础信息 + Markdown 编辑器 + 图集上传 + GLB 上传）
- 变体表格：属性维度定义 + 笛卡尔积批量生成 + 每行 BOM 配置 + 实时可售数量展示
- **验收**：能完整录入一个含 4 个变体、每个变体 2 种耗材的商品

### T035 文件上传
- 依赖：T002
- `POST /api/admin/upload`，校验扩展名 + magic number + 大小
- **验收**：伪造 `Content-Type` 的 `.exe` 上传被拒绝

---

## P4 前台浏览

### T040 可售服务
- 依赖：T011
- `availability.service.ts`：统一走 `v_variant_availability`，提供 `getByVariantIds()` / `getByProductId()`
- 对外封顶 99，**禁止**返回耗材克数
- **验收**：单元测试覆盖 —— 变体停用、无 BOM、耗材停用、耗材不足四种情况均返回 0

### T041 前台布局与首页
- 依赖：T040
- 导航、页脚（含备案号）、Banner、分类区、推荐区、新品区
- ISR `revalidate = 300`，输出 `Organization` + `WebSite` 结构化数据
- **验收**：Lighthouse SEO ≥ 90

### T042 商品列表页
- 依赖：T040
- 筛选、排序、页码分页（每页 24）、售罄角标、空状态
- ISR `revalidate = 60`
- **验收**：筛选与排序组合均正确；全变体售罄的商品显示角标

### T043 商品详情页
- 依赖：T040
- Server Component 渲染静态内容（ISR 60s）
- **可售状态由客户端组件实时拉取**，加载中显示骨架，禁止默认可选
- 变体选择器：不可售选项置灰不可点；可售 < 5 显示「仅剩 N 件」
- 参数表、Markdown 描述（经 `rehype-sanitize`）
- **验收**：`PRD.md` §8 验收项 1（后台调 0 库存后前台 60s 内置灰）通过

### T044 3D 预览组件
- 依赖：T043
- three.js + GLTFLoader，**动态导入**，不进主包
- 仅在 `modelPreviewUrl` 存在时渲染入口
- **验收**：无 GLB 的商品页 JS 体积不受影响

---

## P5 购物车与下单

### T050 购物车
- 依赖：T020, T040
- `cart.service.ts` + `API_SPEC.md` §3.3 全部接口
- 加购时校验可售数量；列表返回实时可售状态与失效原因
- 未登录加购 → 跳登录 → 回跳并完成加购
- **验收**：加购数量超可售返回 40901；商品下架后购物车项标记失效且不可勾选

### T051 地址管理
- 依赖：T020
- 接口 + 页面；所有查询带 `user_id` 条件
- 设为默认时用唯一部分索引保证只有一个
- **验收**：用他人 addressId 调用修改接口返回 404

### T052 运费与折扣计算服务
- 依赖：T010
- `shipping.service.ts`：按 `DATA_MODEL.md` §13 规则计算
- `promotion.service.ts`：`preview()` 只算不占用，`apply(tx)` 原子占用，`release(tx)` 释放
- 门槛与减免**仅作用于商品小计**
- **验收**：`PRD.md` §8 验收项 9（折扣不减运费）通过

### T053 下单试算接口
- 依赖：T052
- `POST /api/orders/preview`
- **验收**：折扣码各种不可用状态返回对应错误码（40905~40909）

### T054 下单核心事务
- 依赖：T052, T053
- `order.service.ts` 的 `createOrder()`，严格按 `TECH_SPEC.md` §5.1 的 11 步顺序
- Postgres 异常按前缀解析为 `BizError`
- **验收**：`PRD.md` §8 验收项 6（金额篡改）、7（折扣码并发）、14（并发扣料）通过

### T055 下单页面
- 依赖：T054
- 地址选择、商品清单、折扣码输入与试算、备注、金额明细、提交
- **验收**：`PRD.md` §5.5 全部功能可用

---

## P6 支付

> 当前执行阶段。`alipay-demo` 仅作为已完成沙箱验证的协议参考，业务状态以本项目数据库为唯一事实来源。

### T060 Provider 抽象与 Mock
- 依赖：T002
- 按 `TECH_SPEC.md` §7 定义接口，实现 `MockProvider` 与工厂
- `ENABLE_MOCK_PAYMENT=true` 时注册 Mock
- **验收**：Mock 模式下能完成一笔支付全流程

### T061 支付宝 Provider
- 依赖：T060
- `alipay-sdk` 实现 `createPayment` / `queryPayment` / `verifyNotify` / `refund`
- **验收**：沙箱环境完成一笔支付并收到回调

### T062 支付接口
- 依赖：T061
- `POST /api/payments`、`GET /api/payments/:outTradeNo/status`
- **验收**：重复创建支付时旧记录被置为 `closed`

### T063 支付回调
- 依赖：T062
- `POST /api/payments/alipay/notify`，严格按 `API_SPEC.md` §3.6 的 7 步顺序
- 响应纯文本 `success`
- 订单已取消的边界情况：标记 `needs_manual_review`，不自动退款
- **验收**：`PRD.md` §8 验收项 5（重复投递 3 次仅扣料一次）通过；篡改 `total_amount` 的回调被拒绝

### T064 支付页面
- 依赖：T062
- 倒计时、跳转收银台、轮询状态（3s 一次，最长 5 分钟）
- **同步跳转不作为成功依据**
- **验收**：手动构造 `return_url` 访问不会改变订单状态

---

## P7 后台订单与生产

### T070 订单管理接口与页面
- 依赖：T054
- 列表、筛选、详情、备注、发货、取消、导出 CSV
- 详情展示 BOM 快照与支付记录
- **验收**：非 `pending_shipment` 状态发货返回 40903

### T071 退款
- 依赖：T070, T061
- `POST /api/admin/orders/:id/refund`
- 全额退款：调用 provider 退款 + 可选回滚耗材 + 回滚折扣码次数
- 部分退款：不回滚折扣码，不回滚耗材
- **验收**：全额退款后折扣码 `used_count` 减 1 且可再次使用

### T072 生产任务
- 依赖：T063
- 支付成功时创建 `print_jobs`（每个 order_item 一条）
- 状态流转接口 + 打印失败重打扣料
- 全部 done 时订单自动转 `pending_shipment`
- **验收**：`PRD.md` §8 验收项 11（重打扣料）通过

### T073 生产看板页面
- 依赖：T072
- 按状态分列，任务卡片含耗材需求明细，支持按耗材筛选
- 标记失败需二次确认并展示将扣减的克数
- **验收**：`PRD.md` §6.3 全部功能可用

### T074 工作台
- 依赖：T070, T072
- 今日订单/销售额、待排产数、待发货数、待人工核查支付数、低库存耗材列表
- **验收**：数字与数据库实际值一致

---

## P8 折扣码后台

### T080 优惠规则管理
- 依赖：T021
- promotions CRUD，三种类型表单
- **验收**：三种类型均可创建

### T081 折扣码管理
- 依赖：T080
- CRUD + 一键开关 + 核销记录查看
- 码统一转大写存储；`permanent` 强制 `maxUses = null`
- 计算 `status` 字段（active/disabled/not_started/expired/exhausted）
- **验收**：`PRD.md` §8 验收项 8（单用户限次）、10（取消回滚次数）通过；关闭开关后下单立即不可用

---

## P9 用户与权限

### T090 订单中心
- 依赖：T054, T072
- 列表（状态 Tab）、详情（状态进度条 + 生产进度明细）、取消、确认收货
- 响应中**禁止**包含 BOM、耗材信息、`adminRemark`
- **验收**：`PRD.md` §8 验收项 12（状态流转完整）通过

### T091 用户管理后台
- 依赖：T021
- 列表（手机号脱敏）、详情、禁用/启用
- **验收**：禁用后该用户登录返回 40104

### T092 管理员与角色管理
- 依赖：T021
- 账号 CRUD、重置密码、角色 CRUD、权限勾选
- 系统角色不可删；不允许把自己改成无 `admin:edit` 的角色
- **验收**：`PRD.md` §8 验收项 13（权限隔离）通过

### T093 站点配置
- 依赖：T021
- Banner 配置、站点信息、运费规则管理
- **验收**：改运费规则后下单试算金额随之变化

---

## P10 定时任务与收尾

### T100 定时任务
- **状态：已完成**（`9e1376e`）
- 依赖：T054, T063
- 三个 cron 端点 + `CRON_SECRET` 鉴权
- 超时释放使用 `FOR UPDATE SKIP LOCKED`，每批 100 条
- 按 `CHANGES-v0.2.md` §6 使用系统 crontab，不配置 `vercel.json`
- 提供不含明文 `CRON_SECRET` 的 crontab 模板或包装脚本：每分钟释放超时订单、每日 03:00 自动完成订单、每日 09:00 执行低库存提醒
- **验收**：`PRD.md` §8 验收项 4（31 分钟后自动取消并释放）通过
- **提交节点**：T100 验收通过后立即提交代码，再进入 T101

### T101 全链路验收
- **状态：已完成**（14 项全部通过）
- 依赖：全部
- 逐条执行 `PRD.md` §8 的 14 项验收标准，输出结果清单
- 同时新增独立、可重复执行的 v0.1 测试数据脚本；仅生成虚构手机号与地址，禁止写入真实个人信息
- 测试数据至少覆盖：
  - 系统角色、不同权限管理员账号
  - 分类、耗材、库存与库存流水
  - 商品、变体、多耗材 BOM、在售/售罄场景
  - 站点信息、Banner、运费规则、优惠规则与折扣码
  - C 端用户、地址、购物车
  - 待支付、生产中、待发货、已发货、已完成、已取消、已退款等订单，以及对应支付、生产任务、物流、退款与折扣核销数据
- 数据必须满足外键、金额、库存和状态流转约束；脚本可重复运行且不会无限产生重复记录，并提供明确的清理或重置方式
- **验收**：前后台主要页面均能用该数据完成展示和操作，且测试数据不包含真实个人信息
- **验收**：14 项全部通过，未通过项需说明原因并修复

### T102 安全自查
- **状态：已完成**（生产构建与 `security:audit` 通过）
- 依赖：全部
- 对照 `TECH_SPEC.md` §14 逐条检查
- 重点：`SUPABASE_SERVICE_ROLE_KEY` 是否泄漏到客户端包、所有资源查询是否带 `user_id`、富文本是否清洗、上传是否校验 magic number
- **验收**：`grep -r "SERVICE_ROLE" .next/static` 无结果

### T103 文档与部署
- **状态：已完成**（README、归档、Release Notes 与 `v0.1` Tag）
- 依赖：T101, T102
- README：本地启动步骤、环境变量说明、迁移执行方式、种子数据说明
- README 按 `CHANGES-v0.2.md` 补充显著警告：当前为境外验证环境、禁止接入真实用户、支付宝仅为沙箱且不产生真实资金流转
- **必须记录已知风险**：Supabase Cloud 国内访问不稳定；境外部署域名无法备案，可能影响支付宝商户号审核；迁移路径见 `TECH_SPEC.md` §13.2
- **验收**：他人按 README 能在空环境完整跑起来
- README 验证通过后，将 `PRD.md`、`TECH_SPEC.md`、`DATA_MODEL.md`、`API_SPEC.md`、`TASKS.md` 归档至 `docs/v0.1/`，归档版本不再修改
- 在 `docs/v0.1/` 整理 `RELEASE_NOTES.md`，记录功能范围、验收结果、部署说明、已知限制与 T044 延后事项
- 归档与 Release Notes 提交后，在该提交上创建并发布 `v0.1` Git Tag；打 Tag 前必须确认工作区干净且 T101、T102 全部通过

### T104 服务器初始化（v0.2 新增）
- 依赖：T103
- 以 `CHANGES-v0.2.md` 为当前生效增量规范；目标环境为华为云 Flexus L 新加坡服务器
- 确认内存方案并配置 4G swap、Docker、Node.js 20、Nginx、域名、HTTPS 自动续期与防火墙（仅 22/80/443）
- 本任务涉及外部服务器、域名和证书操作；执行前由用户提供或确认目标主机、域名、登录方式和内存方案
- **验收**：`https://<域名>` 返回 200，`certbot renew --dry-run` 通过

### T105 部署流水线（v0.2 新增）
- 依赖：T104
- 新增 docker-compose、环境变量注入、构建与发布脚本、Nginx 配置和 `GET /api/health` 健康检查
- `.env` 权限必须为 600 且不得入库；数据库使用新加坡 `ap-southeast-1` Supabase Supavisor 6543 transaction 模式
- 将 T100 的三个任务安装为系统 crontab，`CRON_SECRET` 通过 `/etc/cron.d/` 环境变量或包装脚本注入，禁止写入 crontab 命令行
- **验收**：一条命令完成发布；容器重启后健康检查与定时任务均正常

### T106 支付宝沙箱联调（v0.2 新增）
- 依赖：T105, T062, T063
- 在已部署的新加坡服务器配置支付宝沙箱环境变量与沙箱买家账号，保持 `ENABLE_MOCK_PAYMENT=false`
- 完整验证：下单 → 沙箱收银台 → 支付 → HTTPS 回调 → 订单进入生产 → 耗材扣减
- 验证真实 RSA2 签名、回调幂等、数据库金额校验、退款，以及篡改 `total_amount` 的回调被拒绝
- **验收**：重复投递真实签名回调只扣料一次；篡改金额被拒绝；沙箱测试数据与未来生产数据隔离

---

## 附：阶段依赖图

```
P0 基建
 └─ P1 数据层
     ├─ P2 鉴权
     │   ├─ P3 后台耗材商品 ──┐
     │   ├─ P8 折扣码后台     │
     │   └─ P9 用户权限       │
     └─ P4 前台浏览 ←─────────┘
         └─ P5 购物车下单
             └─ P6 支付
                 ├─ P7 后台订单生产
                 └─ P10 定时任务与收尾
```
