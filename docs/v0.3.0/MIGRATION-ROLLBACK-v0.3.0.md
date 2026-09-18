# v0.3.0 数据库迁移与回滚

## 范围与兼容性

| 迁移 | 内容 | 旧应用兼容性 |
|---|---|---|
| 0004 | 新增 `refund_items`、`return_requests`、`return_request_items`、约束、索引与 RLS/授权 | 仅新增对象；旧应用可继续读写原订单级退款，但**不得**对已有 `refund_items` 记录的订单用旧版退款（会整单重复返库），回滚前须结案所有 pending 退款与 pending/approved 申请 |
| 0005 | 新增按 `refund_item` 的库存流水唯一索引 | 仅新增索引，旧库存流水不受影响 |
| 0006 | 新增售后审核人、退款关联索引 | 仅新增索引 |
| 0007 | `refunds` 新增幂等键、渠道确认、人工复核、订单原状态字段 | 新列可空或有默认值，旧应用可继续运行 |
| 0008 | 幂等唯一范围改为“订单 + 键”，新增处理租约 token/截止时间 | 新列可空；旧应用不使用租约，但回滚应用前必须停止新退款 |

0004–0008 均为前向兼容迁移，不修改 `payments` 结构。本版本生产发布与 v0.2.3 境内迁移、备案和流量切换是两个独立变更窗口，不能捆绑执行或相互视为前置成功证明。

## 执行前门禁

1. 停止退款和售后写入，确认没有任何 `pending` 退款；所有 `pending` 退款与 `pending`/`approved` 售后申请必须先结案。
2. 对完整数据库（不只是 `public`）建立可恢复备份，并实际验证备份可读取；记录恢复点、目标 host、数据库名与操作者。
3. 对比生产 `__drizzle_migrations` 与仓库 0000–0008，先在生产快照副本演练前向迁移和应用启动。
4. 本地迁移默认只允许 `localhost`/`127.0.0.1`。远程正式迁移必须同时设置以下两项，并让第二位审核人核对终端打印的目标 host：

```bash
ALLOW_REMOTE_DATABASE_MIGRATION=true \
CONFIRM_REMOTE_DATABASE_HOST=<exact-host> \
pnpm db:migrate
```

`drizzle.config.ts` 同样执行守卫，因此 `pnpm exec drizzle-kit migrate/push` 不能绕过。若未来改用会解释 URL `?host=` 参数的 `pg` 驱动，须同步校验实际连接主机后才能继续使用此守卫。

## 前向执行与验证

1. 打印目标 host，双人确认与恢复点编号。
2. 执行 `pnpm db:migrate`，核对迁移表最新为 0008。
3. 运行 schema/索引/RLS 检查，再部署应用。
4. 在隔离验证数据上执行 `pnpm test:acceptance`；生产只做只读与经批准的小额验证，不写演示数据。
5. 在确认部署版本至少包含提交 `861b490`（对象路径持久化与可推进分页清理）后，才允许启用 `cleanup-return-evidence` cron。

## 回滚原则与步骤

Drizzle 迁移没有自动 down 脚本。**首选恢复执行前的完整数据库恢复点**，不要在存在真实退款/申请后直接删表或删列。

1. 立即停止退款、售后申请、审核与 `cleanup-return-evidence` cron，保留应用和渠道日志。
2. 对迁移后的数据库再做一次取证备份；核对渠道已成功但本地未完成的退款，先用原 `out_request_no` 完成人工对账。
3. 回滚应用到不早于其数据库契约可兼容的版本。旧应用可以在 0004–0008 schema 上运行，因此若故障在应用层，优先只回滚应用并保留新表/新列。回滚到 v0.2.2 时还须遵守以下业务约束：
   - 回滚前所有 `pending` 退款与 `pending`/`approved` 售后申请必须先结案；不得带未结案退款/申请回滚（前置条件见「执行前门禁」）。
   - 回滚期间**禁止**对已有商品级退款记录（`refund_items`）的订单使用旧版退款：v0.2.2 全额退款调用 `fn_refund_return_stock`（`src/lib/db/migrations/0001_p1_database_objects.sql:200`，按 `required_grams × 整单全部数量` 逐条回补，触发点见 v0.2.2 代码 `git show master:src/lib/services/refund.service.ts` 第 203–213 行），会按**整单全部数量**回补耗材，与 v0.3 已做的商品级返库（`src/lib/services/refund-stock.service.ts:136`，`ref_type='refund_item'`）重复，导致可售数虚高、可能超卖；两套流水的唯一索引（`src/lib/db/migrations/0005_sloppy_charles_xavier.sql`）只覆盖 `ref_type='refund_item'`，互不拦截。
   - 回滚期间旧版产生的**部分退款逐笔登记**：v0.2.2 部分退款不产生 `refund_items` 明细；升级回 v0.3 后，这些订单会命中「历史部分退款无商品明细」拦截（`src/lib/services/refund.service.ts:272-289`），需转人工对账。
   - v0.2.2 无售后界面（无 `return_requests` 相关代码），回滚期间的在途申请无人处理。
4. 只有数据库迁移本身损坏且变更窗口内没有产生新业务数据时，才从执行前恢复点整体恢复；恢复后核对订单、支付、退款累计金额、库存流水和打印任务。
5. 如必须手工逆向，须另开经审查的变更单，按 0008→0004 的逆序处理索引/约束/列/表；导出 `refund_items` 与 `return_requests*` 后才能删除。禁止在发布命令中临时拼接 `DROP TABLE`。
6. 恢复后运行既有链路验收，并逐笔核对变更窗口内的支付宝退款；未确认前不得恢复真实资金入口。

## 已验证路径

- 全新本地 PostgreSQL 17：0000→0008 通过。
- 本地增量：0007→0008 通过。
- B4 未新增迁移，完整 `test:acceptance` 在 `127.0.0.1` 隔离库通过。
- 本文不授权执行生产迁移，也不授权连接共用 Supabase。

