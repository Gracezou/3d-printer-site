import { test, expect, type Page } from '@playwright/test';
import { signAdminToken } from '../../src/lib/auth/admin-token';
import { fixtureIds } from './fixtures';

async function openEditor(page: Page, fail: 'base' | 'variants' | null = null) {
  const token = await signAdminToken({
    sub: fixtureIds.admin,
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
  let detail = {
    id: fixtureIds.product,
    categoryId: null,
    name: '编辑测试商品',
    slug: 'e2e-edit',
    subtitle: null,
    description: null,
    mainImageUrl: null,
    gallery: [],
    modelPreviewUrl: null,
    specs: {},
    status: 'draft',
    isFeatured: false,
    sortOrder: 0,
    minPrice: '20.00',
    variants: [
      {
        id: fixtureIds.small,
        skuCode: 'E2E',
        name: '小号',
        attributes: {},
        price: '20.00',
        comparePrice: null,
        weightGrams: '10.00',
        printHours: null,
        imageUrl: null,
        isActive: false,
        sortOrder: 0,
        availableQty: 0,
        bom: [],
      },
    ],
  };
  const writes: string[] = [];
  await page.route('**/api/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const reply = (data: unknown) =>
      route.fulfill({ json: { code: 0, data, message: 'ok' } });
    if (path === '/api/admin/categories' || path === '/api/admin/materials')
      return reply({ list: [] });
    if (path.startsWith(`/api/admin/products/${fixtureIds.product}`)) {
      if (method === 'PATCH' || method === 'PUT') {
        const kind = method === 'PATCH' ? 'base' : 'variants';
        writes.push(kind);
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (fail === kind)
          return route.fulfill({
            status: 500,
            json: { code: 50000, data: null, message: '模拟保存失败' },
          });
        detail = { ...detail, ...route.request().postDataJSON() };
      }
      return reply(detail);
    }
    return reply({ list: [], total: 0 });
  });
  await page.goto(`/admin/products/${fixtureIds.product}`);
  await expect(page.locator('#product-base input').first()).toHaveValue(
    '编辑测试商品',
  );
  return writes;
}

async function expectLeavePrompt(page: Page, expected: string | null) {
  const messages: string[] = [];
  page.once('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.dismiss();
  });
  // Cancel navigation at bubble phase, after the production capture-phase guard.
  await page
    .getByRole('link', { name: '返回商品列表', exact: true })
    .evaluate((anchor) => {
      anchor.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        { once: true },
      );
      (anchor as HTMLAnchorElement).click();
    });
  expect(messages).toEqual(expected ? [expected] : []);
}

test('saving only variants clears the leave guard', async ({ page }) => {
  const writes = await openEditor(page);
  await page.getByLabel('启用', { exact: true }).check();
  await page
    .getByRole('button', { name: '保存变体与 BOM', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('变体与 BOM 已保存');
  expect(writes).toEqual(['variants']);
  await expectLeavePrompt(page, null);
});

test('bottom save persists both dirty sections and clears the leave guard', async ({
  page,
}) => {
  const writes = await openEditor(page);
  await page.locator('#product-base input').first().fill('已更新商品');
  await page.getByLabel('启用', { exact: true }).check();
  await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已全部保存');
  expect(writes).toEqual(['base', 'variants']);
  await expectLeavePrompt(page, null);
});

test('base failure stops variant write and retains both dirty sections', async ({
  page,
}) => {
  const writes = await openEditor(page, 'base');
  await page.locator('#product-base input').first().fill('未保存商品');
  await page.getByLabel('启用', { exact: true }).check();
  await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
  await expect(page.locator('.admin-page').getByRole('alert')).toContainText(
    '模拟保存失败',
  );
  expect(writes).toEqual(['base']);
  await expectLeavePrompt(
    page,
    '基础信息、变体与 BOM尚未保存，确定放弃并离开吗？',
  );
});

test('variant failure retains the variant guard after base was saved', async ({
  page,
}) => {
  const writes = await openEditor(page, 'variants');
  await page.locator('#product-base input').first().fill('已保存基础信息');
  await page.getByLabel('启用', { exact: true }).check();
  await page.getByRole('button', { name: '保存全部修改', exact: true }).click();
  await expect(page.locator('.admin-page').getByRole('alert')).toContainText(
    '基础信息已保存',
  );
  expect(writes).toEqual(['base', 'variants']);
  await expect(page.getByLabel('启用', { exact: true })).toBeChecked();
  await expectLeavePrompt(page, '变体与 BOM尚未保存，确定放弃并离开吗？');
});

test('saving only base information keeps the unsaved variant guard', async ({
  page,
}) => {
  await openEditor(page);
  await page.locator('#product-base input').first().fill('已保存基础信息');
  await page.getByLabel('启用', { exact: true }).check();
  await page
    .getByRole('button', { name: '保存基础信息', exact: true })
    .first()
    .click();
  await expect(page.getByRole('status')).toContainText('商品基础信息已保存');
  await expectLeavePrompt(page, '变体与 BOM尚未保存，确定放弃并离开吗？');
});
