import { test, expect } from '@playwright/test';
import { fixtureIds as ids } from './fixtures';
import { signAdminToken } from '../../src/lib/auth/admin-token';

test('style/color selection switches pictures and handles multi-color shortages on mobile', async ({
  page,
}) => {
  let dualStock = 0;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route('**/_next/image?*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e5e7eb"/><text x="150" y="300" fill="#334155" font-size="30">Local image fixture</text></svg>',
    }),
  );
  await page.route('**/api/cart', (route) =>
    route.fulfill({ json: { code: 0, data: { items: [] }, message: 'ok' } }),
  );
  await page.route('**/api/products/e2e-colorways/availability', (route) =>
    route.fulfill({
      json: {
        code: 0,
        data: {
          variants: [
            { variantId: ids.black, availableQty: 3 },
            { variantId: ids.dual, availableQty: dualStock },
            { variantId: ids.standBlack, availableQty: 1 },
          ],
        },
        message: 'ok',
      },
    }),
  );
  await page.goto('/products/e2e-colorways?device=unrelated');
  await expect(page.getByRole('link', { name: /切换机型/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /3D|模型/ })).toHaveCount(0);
  await page.getByRole('button', { name: '标准款', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '黑白拼色（库存不足）', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '黑色', exact: true }).click();
  const mainImage = page
    .getByRole('button', { name: '放大查看商品图片' })
    .locator('img');
  await expect(mainImage).toHaveAttribute('src', /black\.png/);
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '查看第 2 张商品图片' }).click();
  await expect(mainImage).toHaveAttribute('src', /gallery\.png/);
  await page.getByRole('button', { name: '支架款', exact: true }).click();
  await expect(mainImage).toHaveAttribute('src', /stand\.png/);
  await expect(
    page.getByRole('button', { name: '黑白拼色（此款不提供）', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '增加数量', exact: true }),
  ).toBeDisabled();
  dualStock = 2;
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await page.getByRole('button', { name: '标准款', exact: true }).click();
  await page.getByRole('button', { name: '黑白拼色', exact: true }).click();
  await expect(mainImage).toHaveAttribute('src', /dual\.png/);
  await expect(page.getByText('已选：标准款 / 黑白拼色 / 1 件')).toBeVisible();
  await page.getByRole('button', { name: '放大查看商品图片' }).click();
  await expect(
    page.getByRole('dialog', { name: '商品图片大图' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const buy = page.getByRole('button', { name: '立即购买', exact: true });
  const box = await buy.boundingBox();
  expect(box && box.y + box.height <= 800).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/product-colorways-360.png',
    fullPage: false,
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(
    page.locator('footer').getByRole('link', { name: '鲁ICP备2026057815号' }),
  ).toBeInViewport();
});

test('admin saves a style with all materials and a merged multi-color BOM through real local APIs', async ({
  page,
}) => {
  const token = await signAdminToken({
    sub: ids.admin,
    name: '本地测试',
    roleCode: 'e2e-v031-editor',
    permissions: ['product:edit'],
  });
  await page.context().addCookies([
    {
      name: 'admin_token',
      value: token,
      url: 'http://127.0.0.1:5103',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  await page.goto(`/admin/products/${ids.adminStyleProduct}`);
  await page.getByRole('button', { name: '添加款式', exact: true }).click();
  const editor = page.getByRole('region', { name: '款式与配色编辑器' });
  await editor.getByLabel('款式名称', { exact: true }).fill('标准款');
  await editor.getByLabel('售价（元）', { exact: true }).fill('29.00');
  await editor.getByLabel('成品重量（g）', { exact: true }).fill('30.00');
  await editor
    .getByLabel('单色耗材用量（g/件）', { exact: true })
    .fill('35.00');
  await editor.getByLabel('单色耗材模式', { exact: true }).selectOption('all');
  await editor.getByLabel('启用此款式', { exact: true }).check();
  await editor
    .getByRole('button', { name: '添加预设配色', exact: true })
    .click();
  await editor.getByLabel('配色名称', { exact: true }).fill('黑白拼色');
  await editor.getByLabel('耗材', { exact: true }).selectOption(ids.material);
  await editor.getByLabel('用量（g/件）', { exact: true }).fill('20.00');
  await editor
    .getByRole('button', { name: '添加配色耗材', exact: true })
    .click();
  await editor
    .getByLabel('耗材', { exact: true })
    .nth(1)
    .selectOption(ids.whiteMaterial);
  await editor.getByLabel('用量（g/件）', { exact: true }).nth(1).fill('10.00');
  await editor
    .getByRole('button', { name: '保存款式与配色及基础修改', exact: true })
    .click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await page.reload();
  await expect(editor.getByLabel('款式名称', { exact: true })).toHaveValue(
    '标准款',
  );
  await expect(editor.getByLabel('单色耗材模式', { exact: true })).toHaveValue(
    'all',
  );
  await expect(editor.getByLabel('配色名称', { exact: true })).toHaveValue(
    '黑白拼色',
  );
  await expect(
    editor.getByLabel('用量（g/件）', { exact: true }).nth(1),
  ).toHaveValue('10.00');
  await page.screenshot({
    path: 'test-results/admin-product-styles.png',
    fullPage: true,
  });
});
