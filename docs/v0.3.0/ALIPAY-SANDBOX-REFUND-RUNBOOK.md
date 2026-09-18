# 支付宝沙箱：商品级部分退款回归手册

本手册交由 Grace 执行。目标是用支付宝沙箱验证“付款 → 退 1 件 → 退剩余商品”的真实渠道时序，并用只读脚本核对本地账、库存与打印队列。**只能连接本地 PostgreSQL；不得复用 `.env.dev` 或共用 Supabase。**

## 1. 准备

> **⚠️ 安全红线（必读）**：`.env.sandbox` 里的 Supabase 配置**必须指向本地 Supabase（`supabase start`）或专用沙箱项目**，**严禁从 `.env.dev` / `.env.production` 复制**任何 Supabase URL / 密钥；`ADMIN_JWT_SECRET` **必须新生成**（示例：`openssl rand -base64 48`），禁止复用现网值。
>
> 违反的后果：应用会用这些配置在**现网 Supabase Auth 创建测试买家、发送真实验证码邮件**，并把售后凭证/商品图片**上传到现网存储桶**，污染生产数据。
>
> 支付宝网关（`ALIPAY_GATEWAY`）必须是沙箱域名（`*.alipaydev.com`，以支付宝官方沙箱文档为准，见 <https://opendocs.alipay.com/common/02kkv7>）。**留空会默认走生产网关**（`https://openapi.alipay.com/gateway.do`），导致测试退款打到生产渠道。

1. 启动一套隔离本地 PostgreSQL，记下 `127.0.0.1` 或 `localhost` 连接串。
2. 启动本地 Supabase（`supabase start`），或准备专用沙箱项目；记下其 URL、anon key、service_role key 与 storage bucket。
3. 复制模板：`cp .env.sandbox.example .env.sandbox`，把文件权限设为 `0600`。
4. 填入 Supabase 相关键（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_STORAGE_BUCKET`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`），**只指向第 2 步的本地/沙箱项目**；`ADMIN_JWT_SECRET` 用 `openssl rand -base64 48` 新生成。
5. 填入支付宝沙箱应用 ID、应用私钥、支付宝公钥、**沙箱网关（`*.alipaydev.com`）**、通知/返回 URL；`ENABLE_MOCK_PAYMENT` 必须为 `false`。
6. 先人工打印并核对数据库主机，确认是 `127.0.0.1`/`localhost`，然后执行迁移、播种和应用启动。不要设置 `ALLOW_REMOTE_TEST_DATABASE`。

```bash
pnpm exec dotenv -e .env.sandbox -- tsx scripts/assert-local-test-database.ts
pnpm exec dotenv -e .env.sandbox -- tsx scripts/migrate-db.ts
pnpm exec dotenv -e .env.sandbox -- tsx scripts/seed.ts
pnpm exec dotenv -e .env.sandbox -- next dev --turbopack --port 5003
```

预期：第一条命令打印 `Acceptance database guard passed: host=127.0.0.1`（或 `localhost`）；迁移为 0000–0008；应用付款渠道显示支付宝而非 mock。

## 2. 付款与退款

1. 用沙箱买家创建并支付一笔至少包含同一商品 2 件、最好同时包含多个不同单价商品的订单；记录订单号与 `out_trade_no`。
2. 在后台对其中一件执行商品级退款，记录退款 ID、`out_request_no`、金额和操作时间；确认订单不是 `refunded`，且部分退款不含运费。
3. **等待至少 10 秒**，再执行第 3 节的渠道查询。不要用新幂等键替代结果不明的退款。
4. 确认第一笔退款成功后，退掉全部剩余可退商品；记录第二个 `out_request_no`。
5. 再等待至少 10 秒，查询第二笔；订单最终应为 `refunded`，累计退款额应等于实付金额，最后一笔才包含剩余运费。

## 3. 延迟查询与本地对账

每笔退款发起至少 10 秒后，用对应 `out_request_no` 查询；脚本只读本地数据库，并调用支付宝查询接口，不修改业务记录：

```bash
pnpm sandbox:refund-check -- --order-no=<ORDER_NO> --query-provider=<OUT_REQUEST_NO>
```

预期：

- `providerQuery.status` 为 `success`，`providerRefundId` 等于原 `out_request_no`；
- 支付宝原始结果必须具有 `refund_status=REFUND_SUCCESS`，且返回退款金额与本地退款头金额一致；
- `totals.paid = totals.refundHeaders = totals.refundItems`；至少存在两条成功退款头；
- 每个退款头等于其明细之和，库存流水以唯一 `refund_item` 追溯且无重复；
- `queued` 打印数量不大于仍未退款数量，已全退的 queued 任务不存在。

> **红线：**若退款后等待 ≥10 秒仍拿不到 `refund_status=REFUND_SUCCESS`，或金额不一致，不得把结果认定为成功或换新幂等键重试。记录原始响应与 `traceId`，保留本地 `pending + needs_manual_review`，通过原退款 ID 续记或人工复核。该现象意味着当前 Provider 会把此类结果归入 unknown，生产上线前必须解决。

## 4. 请求超时场景

> **为什么不用浏览器限速**：浏览器限速只影响「浏览器 → 应用服务器」这一段，**测不到应用服务器调用支付宝网关的超时**；只有「退款请求已发出、渠道结果未知」才会进入「续记 / 人工复核」路径，浏览器侧超时无法复现这条路径。因此必须在**应用服务器与支付宝网关之间**制造延迟（应用侧渠道调用超时阈值为 10 秒，见 `src/lib/services/payment/alipay.provider.ts`）。

1. 仅在沙箱环境，在应用服务器与支付宝网关之间加一层**本地 HTTP 代理**，对发往支付宝网关（`*.alipaydev.com`）的请求注入延迟（例如 12 秒，超过应用侧 10 秒超时阈值），让**服务端**调用渠道超时；不要取消服务端进程，也不要修改 `out_request_no`。
   - 思路：启动一个本地代理（如 `mitmproxy` 的延迟注入，或自写最小转发代理、转发前 `sleep`），把应用的支付宝出站请求指向该代理；具体凭据、端口与工具参数不在此文档中，按工具文档配置即可。
   - 目标是让**应用服务器**感知到渠道超时，而不是让浏览器页面超时。
2. 记录超时发生时间、退款 ID、`out_request_no`、应用日志中的安全错误摘要与支付宝 `traceId`。
3. 等待至少 10 秒，用第 3 节命令查询原退款号。
4. 若查询成功，后台用原退款 ID“续记”落账；若仍未知，保持人工复核。严禁新建另一退款号试探。

## 5. 失败取证与交付

保存以下脱敏材料：订单号、两个退款 ID/`out_request_no`、每步时间、后台状态截图、脚本 JSON 输出、支付宝查询响应中的 `code/sub_code/refund_status/refund_amount/traceId`。不得保存或发送应用私钥、签名、完整请求参数、买家登录名。

执行完成后，在 `TASKS-v0.3.0.md` 勾选沙箱回归，并把实际结果补入 `ACCEPTANCE-v0.3.0.md`；执行前该项保持未完成。
