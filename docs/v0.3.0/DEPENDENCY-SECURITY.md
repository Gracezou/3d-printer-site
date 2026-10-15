# v0.3.0 发布前依赖安全修复

日期：2026-10-15。状态：**可用补丁与本地深度防护完成；用户已批准 Stage 专用受限例外，生产环境不放行**。

## Stage 受限例外（用户确认后追加）

`security-audit.sh` 最后一步改由 `scripts/audit-dependencies.ts` 执行官方 registry JSON 审计，而非跳过依赖审计。只有显式 `DEPLOY_ENVIRONMENT=stage` 才可使用例外；CI 已按 Environment 注入该变量。普通本地检查及生产检查仍阻断此高危。

例外必须同时满足：

- 公告为 `GHSA-vfj7-8cjw-p6xm`，包为 `braces@3.0.3`，严重度为 high；所有命中都属于批准的 ESLint 开发依赖链，新增运行时路径不放行。
- 补丁文件 SHA-256 为 `2962f685a3f13f9e5c4e32cac93783a84d9a60b6e4ee8993845d79d79fb7900b`，workspace 注册与 lockfile 补丁哈希一致。
- 当次审计重新运行实际安装包的 11 项安全回归并成功，不能复用旧测试结果。
- 当前时间早于 **2026-11-15 00:00 UTC**；届时须重新评审或升级官方修复包。

所有其他 high/critical 仍失败；网络错误、无效 JSON、缺字段、审计计数不一致均失败。输出保留原始漏洞计数及例外说明，不宣称零漏洞。新增 17 项审计策略回归，全量共 51 文件 / 209 项测试。Stage 专用安全审计已通过，仍记录 1 high（受限例外）及 9 moderate。

本地验证命令：`DEPLOY_ENVIRONMENT=stage pnpm security:audit`。历史修复过程和验证记录如下；下述“未放行”描述的是用户批准前状态。

## 本次变更

保留应用源码、Next.js 15.5.24、Vitest 3.2.7 和 Supabase 客户端版本。使用 `pnpm-workspace.yaml` 的定向 overrides，并更新锁文件；不修改审计阈值，不增加忽略项。

| 依赖 | 原版本 | 修复版本 | 依赖链/兼容性 |
|---|---|---|---|
| undici | 7.29.0 | 7.29.1 | alipay-sdk → urllib；保持 7.x |
| sharp | 0.35.4 | 0.35.5 | Next.js 图片处理；同步更新平台二进制与 libvips |
| source-map-js | 1.2.1 | 1.2.2 | PostCSS/Tailwind 构建链 |
| brace-expansion | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.20 / 2.1.6 / 5.0.11 | 分别保持原有主版本，避免 CommonJS/ESM 兼容变化 |
| tinypool | 1.1.1 | 2.1.2 | 仅覆盖 Vitest 的依赖；2.x 移除 Node 18 支持，项目已经要求 Node >=20 |

上游依据：[Tinypool 修复说明](https://github.com/tinylibs/tinypool/releases/tag/v2.1.2)、[Sharp 发布记录](https://github.com/lovell/sharp/releases)、[Undici 发布记录](https://github.com/nodejs/undici/releases)。具体版本也已通过 npm 官方 registry 元数据核对，依赖从官方 registry 安装。

## braces 本地缓解与审计限制

- `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687`：深层花括号模式导致递归栈耗尽。
- 当前实际版本为 3.0.3，仅由开发依赖 `eslint-config-next → fast-glob → micromatch → braces` 引入（含 eslint-import-resolver-typescript 的路径）。
- npm audit 返回修复范围 `>=3.0.4`，但官方 registry 查询 `braces/3.0.4` 返回 404，`latest` 仍为 3.0.3；[官方公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 标明暂无修复版本。不能把不存在的版本写入锁文件。
- 按用户确认，通过 pnpm `patchedDependencies` 注册 `patches/braces@3.0.3.patch`，保持真实版本号，不伪装成官方修复版本。锁文件记录补丁哈希，新安装会自动应用；无法应用时不得静默跳过。
- 解析花括号/圆括号（含混合嵌套）时限制 128 层；`compile`、`expand`、`stringify` 的 AST 递归及展开辅助递归增加同类防护。超限抛出 `SyntaxError`，错误码 `BRACES_DEPTH_LIMIT`，不依赖可被调用者调大的长度/范围参数。
- 超深字符串在解析阶段拒绝，直接传入深层 AST 的路径也做保护。正常 glob、嵌套选项、数值区间、转义和字面量保持原行为。该补丁针对公告描述的深度/栈问题，不宣称修复所有组合爆炸、任意循环对象或其他资源耗尽风险；调用者仍需处理无效模式异常。
- Docker 安装依赖前复制 `patches/`；`.dockerignore` 新增 `.local`，避免临时补丁源码、环境备份或密钥进入构建上下文。
- 没有替换 ESLint/Next.js 工具链，没有修改审计脚本或新增忽略项。npm audit 只按版本判定，不识别本地修复内容，仍返回 1 项高危并阻止发布。
- 后续：等待正式修复包后移除本地补丁，或单独评审“仅对此公告、仅在补丁哈希和回归验证通过时放行”的受限审计例外。任何例外须先批准，本轮没有实施；禁止整体跳过安全审计。

## 验证结果

- 官方 registry 审计：修复前 2 critical / 11 high / 14 moderate / 3 low；修复后 **0 critical / 1 high / 9 moderate / 0 low**。中危项仍未全部修复，不宣称零漏洞。
- `pnpm typecheck`：通过。
- `pnpm lint`：独立复跑通过、无警告（与测试并行的首次运行会扫到测试临时文件，因此以独立运行结果为准）。
- `pnpm test`：50 个文件、192 项测试通过，新增 11 项补丁/构建配置回归。
- `pnpm exec vitest run --pool=threads`：依赖升级阶段的 181 项通过；本地补丁新增测试另经全量默认进程池验证。
- `pnpm build`：通过，65 个静态页面生成完成。
- Sharp 内存位图及 SVG 缩放为 PNG：通过，实际加载版本 0.35.5。
- `pnpm install --frozen-lockfile --offline --ignore-scripts`：通过，配置与锁文件一致。
- 在项目外全新临时目录，用 pnpm 11.22.0 安装 `braces@3.0.3` 与本补丁；首次离线安装和冻结锁文件复装成功，实际导入包可触发 `BRACES_DEPTH_LIMIT`。未直接修改 node_modules 作为交付方式。
- 对照验证：子进程 `--stack-size=256` 下原版编译 4000 层模式发生 `RangeError: Maximum call stack size exceeded`；补丁版提前返回带错误码的 `SyntaxError`。恶意输入测试使用独立子进程及 3 秒超时。
- `pnpm security:audit`：前四项源码/凭据/产物检查通过，最终依赖审计仍因 braces 高危退出失败，**不能发布**。

本轮修改本地依赖配置、锁文件、补丁、测试、构建配置及文档；未连接或修改数据库、未部署 Stage、未修改生产服务器。验证环境为本机 Node 26.9.0；CI 的 Node 22 和 Linux 镜像尚未执行，不用本地测试替代目标平台验收。
