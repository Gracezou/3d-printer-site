# Playwright 快速上手（面向本项目）

> 用途：v0.2.3 将引入 Playwright 做端到端（E2E）测试。本文档是给团队的最短上手路径，不是官方文档的替代品。
> 适用：Next.js 15 + pnpm，本地端口 `5003`
> 创建日期：2026-09-09

---

## 1. 它和现有测试的分工

项目已经有 vitest（35+ 项单元测试）和 `test:acceptance`（数据库层全链路验收）。Playwright **不替代它们**，补的是唯一的空白：**真实浏览器里的用户行为**。

| 层 | 工具 | 验证什么 | 例子 |
|---|---|---|---|
| 单元 / 服务 | vitest | 业务逻辑与数据正确性 | 并发扣料恰好 5 成功、折扣计算 |
| 全链路验收 | `test:acceptance` | 跨表事务与状态流转 | 支付幂等、重打扣料 |
| **端到端** | **Playwright** | **用户在浏览器里能不能完成任务** | 筛选后刷新条件还在吗、切换规格会不会卡死 |

判断标准：**只有"必须打开浏览器才能发现的问题"才写 Playwright**。业务规则用 vitest，快得多也稳得多。

---

## 2. 安装

```bash
pnpm create playwright        # 交互式初始化，选 TypeScript、tests 目录、不装 GitHub Actions（我们自己配）
pnpm exec playwright install  # 下载浏览器内核，约几百 MB
```

生成 `playwright.config.ts` 与 `tests/` 目录。

---

## 3. 只需要先掌握四个概念

### 3.1 test / expect

```ts
import { test, expect } from '@playwright/test';

test('首页展示品牌主张', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

`page` 是自动注入的**夹具（fixture）**，每个 test 拿到一个干净的浏览器上下文，测试之间不共享 cookie 和 storage。

### 3.2 Locator 与自动等待（最重要）

Playwright 的 locator 是**惰性**的：它描述"怎么找到元素"，直到真正操作时才去找，并**自动等待元素出现、可见、可点击**。

```ts
await page.getByRole('button', { name: '加入购物车' }).click();
```

这一行内部会重试到元素可点击为止，**所以不需要 `sleep`**。

> ⚠️ 项目里最容易犯的错：写 `await page.waitForTimeout(1000)`。任何固定等待都是测试不稳定的根源。需要等状态变化就断言那个状态：
> ```ts
> await expect(page.getByTestId('cart-count')).toHaveText('2');
> ```

**选择器优先级**（从好到差）：
1. `getByRole('button', { name: '结算' })` —— 语义化，同时验证了可访问性
2. `getByLabel('收货人姓名')` / `getByPlaceholder(...)` / `getByText(...)`
3. `getByTestId('cart-count')` —— 需要在组件上加 `data-testid`
4. CSS / XPath —— 尽量不用，改样式就会挂

这条优先级和 v0.2.2 的 T130（可访问性）是同一件事：**把 a11y 做好，E2E 选择器自然就稳**。

### 3.3 Projects（多视口）

`playwright.config.ts` 里用 projects 一次跑多个视口，正好对应验收要求的四档：

```ts
export default defineConfig({
  use: { baseURL: 'http://localhost:5003' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5003',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobile-360',  use: { viewport: { width: 360,  height: 780 } } },
    { name: 'mobile-390',  use: { viewport: { width: 390,  height: 844 } } },
    { name: 'tablet-768',  use: { viewport: { width: 768,  height: 1024 } } },
    { name: 'desktop-1440',use: { viewport: { width: 1440, height: 900 } } },
  ],
});
```

`webServer` 会在测试前自动起 dev server，测完关掉。

### 3.4 Trace Viewer（调试神器）

配置里加 `use: { trace: 'on-first-retry' }`，失败时会录下完整快照。然后：

```bash
pnpm exec playwright show-trace trace.zip
```

打开一个时间轴界面：每一步的 DOM 快照、网络请求、控制台日志、截图，可以回放。**排查失败几乎只需要这一个工具。**

---

## 4. 两个最省时间的命令

```bash
pnpm exec playwright codegen http://localhost:5003
```
打开浏览器，你手动操作，它实时生成测试代码。**写第一版测试用它，能省一半时间**，然后再手工把选择器换成 `getByRole`。

```bash
pnpm exec playwright test --ui
```
可视化运行器：勾选用例、看每步执行、失败即时回放。日常开发用这个，不用 `--headed`。

---

## 5. 本项目的示例：规格选择不卡死

对应 v0.2.3 的 T134。用几何氛围灯这类稀疏 SKU 作为场景：

```ts
test('稀疏 SKU 可从任意有效组合切换到另一有效组合', async ({ page }) => {
  await page.goto('/products/geometric-lamp');

  await page.getByRole('radio', { name: '大号' }).click();
  await page.getByRole('radio', { name: '拼色' }).click();
  await expect(page.getByRole('button', { name: '加入购物车' })).toBeEnabled();

  // 切到一个与当前颜色不兼容的尺寸，系统应自动清除冲突属性而不是把用户锁死
  await page.getByRole('radio', { name: '小号' }).click();
  await expect(page.getByText('请选择颜色')).toBeVisible();

  await page.getByRole('radio', { name: '黑色' }).click();
  await expect(page.getByRole('button', { name: '加入购物车' })).toBeEnabled();
});
```

注意这个测试**只验证浏览器里的交互**，不验证价格计算——那是 vitest 的事。

---

## 6. 测试数据怎么办

E2E 必须跑在一个可预期的数据集上。本项目已经有现成的：

- 本地跑：`pnpm demo:seed` 生成固定 ID 的完整虚构数据
- **绝不对预生产或生产库跑 E2E**
- 需要登录态的用例，用 Playwright 的 `storageState` 把登录结果存下来复用，避免每个用例都走一遍邮箱 OTP：

```ts
// 一次性登录并保存
await page.context().storageState({ path: 'tests/.auth/user.json' });
// 之后在 project 里 use: { storageState: 'tests/.auth/user.json' }
```

`tests/.auth/` 必须进 `.gitignore`。

---

## 7. 接入 CI 时的注意点

- E2E 比单元测试慢得多。建议**不要**加进现有的 `release-image.yml` 主流水线阻塞发布，先作为独立 workflow 或手动触发
- CI 里设 `retries: 2`（本地设 0），配合 `trace: 'on-first-retry'`
- 上传 `playwright-report/` 作为 artifact，失败时能下载回来看
- 容器里跑需要 `pnpm exec playwright install --with-deps chromium`

---

## 8. 常见坑速查

| 症状 | 原因 | 解法 |
|---|---|---|
| 偶发失败、重跑就好 | 用了 `waitForTimeout` 或断言了瞬时状态 | 改成断言最终状态 |
| 改个 class 名测试全挂 | 用了 CSS 选择器 | 换 `getByRole` / `getByTestId` |
| 本地过 CI 挂 | 视口、时区、动画差异 | 固定 viewport；CI 里禁用动画 |
| 登录用例特别慢 | 每个用例都走一遍 OTP | 用 `storageState` |
| 测试之间互相影响 | 共享了数据库状态 | 每个用例用独立数据，或测前重置 |

---

## 9. 官方资源

- 文档：https://playwright.dev/docs/intro
- Locator 指南：https://playwright.dev/docs/locators
- Trace Viewer：https://playwright.dev/docs/trace-viewer
- 最佳实践：https://playwright.dev/docs/best-practices

**最短路径建议**：先跑一遍 `codegen` 录一个加购流程，再用 `--ui` 跑起来，然后读一遍 Locator 指南。这三步之后就能写本项目的用例了。
