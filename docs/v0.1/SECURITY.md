# v0.1 安全自查记录

- 检查日期：2026-08-30
- 检查范围：`TECH_SPEC.md` §14、客户端与后台 API、支付回调、上传、构建产物与依赖
- 自动化入口：先执行生产构建，再执行 `pnpm security:audit`
- 结果：通过，无已知中高危依赖漏洞

## 检查结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| Service Role 与支付私钥不进入客户端 | 通过 | `.next/static` 自动扫描无 `SERVICE_ROLE`、支付私钥名或 PEM 私钥 |
| 敏感文件不入库 | 通过 | Git 跟踪文件中无非示例 `.env`、`.pem`、`.key`、`.p12` 或 `.pfx` |
| API 入参严格校验 | 通过 | JSON Route 统一经 `parseJsonBody` + Zod；购物车 schema 补齐 `.strict()` 并增加未知字段回归测试 |
| 用户资源隔离 | 通过 | 地址、购物车、订单、订单试算与支付查询均以当前 `userId` 组合资源 ID 查询 |
| 后台鉴权与审计 | 通过 | 后台 Route 按权限码调用 `requirePermission`；修改操作与 `admin_operation_logs` 同事务写入 |
| OTP 防滥用 | 通过 | 同手机号 60 秒、同 IP 每小时 10 次，键值仅保存 SHA-256 摘要 |
| 支付回调 | 通过 | RSA2 验签、`app_id`、支付单、精确金额、状态与幂等性均校验；业务变更在同一数据库事务内 |
| 富文本与结构化数据 | 通过 | 商品 Markdown 使用 `rehype-sanitize`；JSON-LD 在注入前转义 `<` |
| 文件上传 | 通过 | 校验权限、扩展名、体积、JPEG/PNG/WebP/GLB magic number 与 GLB 2.0 声明长度 |
| 依赖漏洞 | 通过 | 将 `postcss`、`urllib`、`esbuild` 间接依赖约束到已修复版本，`pnpm audit` 无已知漏洞 |

## 本次修复

1. 购物车新增与数量修改的 Zod schema 改为 strict object，防止未知字段被静默丢弃。
2. 通过 pnpm workspace overrides 修复 PostCSS 文件读取、urllib 跨域重定向凭据泄漏与 esbuild 开发服务器跨站访问问题。
3. 新增可重复执行的敏感文件、凭据、客户端构建产物、API 入参边界和依赖安全检查。

## 运行前提

`security:audit` 必须在生产构建之后运行，否则不会对过期或缺失的客户端 bundle 给出误导性结论。依赖审计显式使用 npm 官方安全端点，因默认 npmmirror 不提供 audit API。
