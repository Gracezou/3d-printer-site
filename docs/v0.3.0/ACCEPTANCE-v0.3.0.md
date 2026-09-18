# v0.3.0 自动化验收记录

- 验收日期：2026-09-18
- 分支：`release-v0.3.0`
- 数据库：本机 PostgreSQL 17（`127.0.0.1:55440/b4_acceptance`）
- 入口：`DATABASE_URL=postgres://postgres@127.0.0.1:55440/b4_acceptance pnpm test:acceptance`
- 结果：通过；入口先执行 v0.1 全套，再执行 v0.3.0 的退款、返库与售后申请脚本

> 本记录只列自动化证据。支付宝沙箱真实付款与退款尚待 Grace 按 [沙箱回归手册](./ALIPAY-SANDBOX-REFUND-RUNBOOK.md) 执行，不因本地 mock Provider 通过而标记完成。

## §8 验收对照

| # | 验收项 | 测试脚本 / 用例 | 结果与证据 |
|---:|---|---|---|
| 1 | 分摊精确性 | `refund-allocation.test.ts`：`returns the exact paid amount after three item-level refunds`；`test:refunds` 主订单三次逐件退款 | 通过。三件不同单价、满减与 8 元运费逐件退完，退款头与明细累计均为实付 `111.00`。 |
| 2 | 运费规则 | `refund-allocation.test.ts`：`puts shipping only on the final refunded unit`、`does not invent shipping on a free-shipping order`；`test:refunds` 三段退款 | 通过。前两笔 `shippingShare=0.00`，最后一笔为 `8.00`；不补收跌破包邮门槛的费用。 |
| 3 | 库存返还 | `test:refund-items`：partial BOM return / availability / idempotency；`test:refunds` 可售视图断言 | 通过。库存流水逐条以 `refund_item` 为 `ref_id`，部分返库后可售数 `18 → 19`（引擎用例 `900 → 901`），重放不重复返库。 |
| 4 | 打印队列联动 | `test:refunds`：quantity-aware queue linkage、打印中先退 1 后回队列再退 2 | 通过。`queued` 数量按“购买量－累计成功退款量”重算至 0；`printing`、`post_processing`、`done` 不被自动取消。 |
| 5 | 订单状态 | `test:refunds`：partial-state regression / full refund | 通过。部分退款保持原 `paid`/`in_production` 状态，覆盖 `96126c5` 语义；全部退完为 `refunded`。 |
| 6 | 两路径一致 | `test:return-requests`：shared refund accounting | 通过。后台直接退款与申请审核通过的退款金额、逐件库存流水、退款审计动作逐项相等，且审核复用 `refundOrder`。 |
| 7 | 幂等与并发 | `test:refunds`：same-key and item concurrency / replay；`test:return-requests`：concurrent approval | 通过。同商品并发仅一次成功、同幂等键只调用渠道一次、重放不新增退款明细/库存流水，并发审批只出款一次。 |
| 8 | 不可超额 | `refund-allocation.test.ts`：`rejects over-refunding and inconsistent order totals`；`test:refunds` over-refund | 通过。超购买量或可退余额返回 40918，渠道调用次数保持 0。 |
| 9 | 客户端准入 | `test:return-requests`：printing 普通原因、同订单重复申请 | 通过。分别返回 40916 与 40915；已批准但退款未终结也阻止新申请。 |
| 10 | 尺寸不符例外 | `test:return-requests`：done + `size_mismatch` 审核 | 通过。非 `queued` 商品能提交例外申请并由后台完成退款。 |
| 11 | 权限隔离 | `test:return-requests`：客户所有权隔离、审核 403、批准双权限 | 通过。他人订单/申请不可创建、查看或撤销；无 `return:review` 不可看审核队列，仅有该权限不可批准。 |
| 12 | 准入可配置 | `test:return-requests`：运行时替换 `RETURN_RULES` 后提交普通原因 | 通过。测试只修改集中规则配置，不修改 API/页面/服务代码即可改变准入结果。 |
| 13 | 既有链路 | `run-acceptance-v03.sh`：v0.1 14 组 + v0.3 3 组；Vitest 全量与质量门禁 | 通过。`test:acceptance` 输出 `All acceptance checks passed` 与 `All v0.3 acceptance checks passed`；完整质量门禁见下节。 |

## 质量门禁

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm test` | 通过，38 个文件 / 114 个测试 |
| `pnpm build` | 通过 |
| `pnpm security:audit` | 通过；已知 4 个 moderate 依赖告警属于既定发布遗留，不在本版本范围 |
| `pnpm test:acceptance` | 通过，v0.1 14 组 + v0.3 `refunds` / `refund-items` / `return-requests` |

## 数据库与安全门禁

- 0000–0008 已在全新本地 PostgreSQL 17 执行；0007→0008 增量路径已在 B2/B3 验证。本批无新迁移。
- `test:acceptance` 开头执行数据库主机守卫；以非本地主机连接串试跑会在连接数据库前失败。
- 本次 B4 回归未连接共用 Supabase，也未调用真实或沙箱支付宝。

