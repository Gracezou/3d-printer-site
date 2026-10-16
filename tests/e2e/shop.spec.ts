import { test, expect, type Page, type Route } from '@playwright/test';
import { addresses, cartItems, device, fixtureIds, preview } from './fixtures';

const envelope = (data: unknown) => ({ code: 0, data, message: 'ok' });
async function respond(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    json:
      status === 200
        ? envelope(data)
        : { code: 50001, data: null, message: '模拟网络失败' },
  });
}
async function mockShop(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/cart') return respond(route, { items: cartItems });
    if (path === '/api/auth/me')
      return respond(route, {
        email: 'test@example.invalid',
        nickname: '测试买家',
        phone: '',
        phoneVerified: false,
      });
    if (path === '/api/addresses') return respond(route, { addresses });
    if (path === '/api/orders/preview') return respond(route, preview);
    if (path === '/api/orders/E2E-ORDER')
      return respond(route, {
        orderNo: 'E2E-ORDER',
        status: 'paid',
        statusText: '已支付',
        itemsAmount: '50.00',
        discountAmount: '0.00',
        shippingAmount: '6.00',
        payableAmount: '56.00',
        paidAmount: '56.00',
        refundedAmount: '0.00',
        discountCode: null,
        buyerRemark: null,
        reservedUntil: null,
        paidAt: '2026-10-16T00:00:00Z',
        createdAt: '2026-10-16T00:00:00Z',
        shippedAt: null,
        completedAt: null,
        cancelledAt: null,
        shipment: null,
        receiver: {
          name: '测试收件人',
          phone: '13800000000',
          address: '上海市浦东新区测试地址',
        },
        items: cartItems.map((item) => ({
          ...item,
          printStatus: null,
          printStatusText: null,
          printerName: null,
          refundedQuantity: 0,
          refundableQuantity: 1,
          ordinaryReturnAllowed: true,
          exceptionReturnAllowed: true,
        })),
        returnRequests: [
          {
            requestNo: 'E2E-RETURN',
            status: 'pending',
            reasonCode: 'quality_issue',
            reasonText: null,
            reviewRemark: null,
            createdAt: '2026-10-16T00:00:00Z',
            reviewedAt: null,
          },
        ],
      });
    if (path.endsWith('/availability'))
      return respond(route, {
        variants: [fixtureIds.small, fixtureIds.large].map((variantId) => ({
          variantId,
          availableQty: 10,
        })),
      });
    if (path === '/api/orders' && route.request().method() === 'GET')
      return respond(route, {
        list: [
          {
            orderNo: 'E2E-ORDER',
            status: 'pending_payment',
            statusText: '待支付',
            payableAmount: '26.00',
            paidAmount: '0.00',
            refundedAmount: '0.00',
            latestReturn: null,
            createdAt: '2026-10-16T00:00:00Z',
            items: cartItems,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    return respond(route, { cartCount: 2, quantity: 1 });
  });
}
async function setCheckout(page: Page) {
  await page.addInitScript(
    ({ variantId }) =>
      sessionStorage.setItem(
        'checkout-selection',
        JSON.stringify({ items: [{ variantId, quantity: 1 }], fromCart: true }),
      ),
    { variantId: fixtureIds.small },
  );
}

test.beforeEach(async ({ page }) => {
  await mockShop(page);
});

test('home product cards contain only the main image link', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.locator('footer').getByRole('link', { name: '鲁ICP备2026057815号' }),
  ).toHaveAttribute('href', 'https://beian.miit.gov.cn/');
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('link', { name: '查看X3 测试保护壳' }) });
  await expect(card).toHaveCount(1);
  await expect(card.locator('h3')).toHaveCount(0);
  await expect(card.getByRole('link')).toHaveCount(1);
  await expect(page.getByText('选择你的机型', { exact: true })).toBeVisible();
});

test('filters keep URL history and update without reloading the document', async ({
  page,
}) => {
  await page.goto('/products');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).navigationMarker =
      'retained';
  });
  await page
    .getByRole('combobox', { name: '适配机型', exact: true })
    .selectOption(fixtureIds.model);
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page).toHaveURL(new RegExp(`deviceModelId=${fixtureIds.model}`));
  await expect(
    page.getByRole('button', { name: '移除条件：浏览器测试 X3' }),
  ).toBeVisible();
  await page.getByLabel('搜索作品', { exact: true }).fill('没有这件商品');
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.getByText('没有找到符合条件的作品')).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('搜索作品', { exact: true })).toHaveValue('');
  await expect(
    page.getByRole('combobox', { name: '适配机型', exact: true }),
  ).toHaveValue(fixtureIds.model);
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).navigationMarker,
    ),
  ).toBe('retained');
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: '适配机型', exact: true }),
  ).toHaveValue(fixtureIds.model);
});

test('sparse SKU change clears conflicting color and guards incompatible device', async ({
  page,
}) => {
  await page.goto(`/products/e2e-v031-case?device=${device.id}`);
  await page.getByRole('button', { name: '小号', exact: true }).click();
  await page.getByRole('button', { name: '黑色', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '大号', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '黑色', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '拼色', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '重新选择规格' }).click();
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeDisabled();
  await page.goto('/products/e2e-v031-case?device=unrelated');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    '未关联你选择的机型',
  );
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeDisabled();
});

test('cart serializes rapid edits and restores only a failed row', async ({
  page,
}) => {
  const writes: number[] = [];
  await page.route('**/api/cart/items/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return respond(route, null, 500);
    }
    writes.push(route.request().postDataJSON().quantity);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return respond(route, { cartCount: 1, quantity: writes.at(-1) });
  });
  await page.goto('/cart');
  const first = page.locator('article').filter({ hasText: '小号黑色' });
  const second = page.locator('article').filter({ hasText: '大号拼色' });
  await first
    .getByRole('button', { name: '增加数量' })
    .click({ clickCount: 3 });
  await expect(first).toContainText('¥80.00');
  await expect(page.getByRole('button', { name: '正在保存…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '去结算' })).toBeVisible();
  expect(writes.at(-1)).toBe(4);
  await second.getByRole('button', { name: '删除 X3 拼色保护壳' }).click();
  await expect(second).toHaveCount(0);
  await expect(page.locator('main').getByRole('alert')).toContainText(
    '已恢复该商品',
  );
  await expect(first).toContainText('¥80.00');
  await expect(second).toContainText('¥30.00');
  await expect(
    page.getByRole('link', { name: '购物车，当前 5 件商品' }),
  ).toBeVisible();
});

test('checkout invalidates failed previews and prevents duplicate submit', async ({
  page,
}) => {
  await setCheckout(page);
  let failPreview = false;
  let submissions = 0;
  await page.route('**/api/orders/preview', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return failPreview ? respond(route, null, 500) : respond(route, preview);
  });
  await page.route('**/api/orders', async (route) => {
    submissions++;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return respond(route, {
      orderNo: 'E2E-CREATED',
      payableAmount: '26.00',
      reservedUntil: '2026-10-17T00:00:00Z',
    });
  });
  await page.goto('/checkout');
  await expect(
    page.getByRole('button', { name: '提交订单', exact: true }),
  ).toBeEnabled();
  failPreview = true;
  await page.getByRole('radio').nth(1).check();
  await expect(
    page.getByRole('button', { name: '提交订单', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    '模拟网络失败',
  );
  failPreview = false;
  await page.getByRole('button', { name: '重新试算' }).click();
  await expect(
    page.getByRole('button', { name: '提交订单', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: '提交订单', exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(page.getByText('订单创建成功')).toBeVisible();
  expect(submissions).toBe(1);
});

test('address dialog traps focus, supports Escape and restores the opener', async ({
  page,
}) => {
  await page.goto('/account/addresses?next=%2Fcheckout');
  const opener = page.getByRole('button', { name: '新增地址', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '新增收货地址' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '保存地址', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: '关闭地址表单' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByRole('link', { name: '返回结算' })).toBeVisible();
});

test('login returns to the intended checkout path', async ({ page }) => {
  await setCheckout(page);
  await page.goto('/auth/login?next=%2Fcheckout');
  await page
    .getByLabel('邮箱地址', { exact: true })
    .fill('test@example.invalid');
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByLabel('邮箱验证码', { exact: true }).fill('12345678');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(
    page.getByRole('button', { name: '提交订单', exact: true }),
  ).toBeEnabled();
});

test('order links and action buttons share size and shape', async ({
  page,
}) => {
  await page.goto('/account/orders');
  const actions = [
    page.getByRole('link', { name: '查看详情', exact: true }),
    page.getByRole('button', { name: '取消订单', exact: true }),
    page.getByRole('link', { name: '去支付', exact: true }),
  ];
  const dimensions = [];
  for (const action of actions) {
    await expect(action).toBeVisible();
    dimensions.push(
      await action.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.height, style.borderRadius, style.fontSize];
      }),
    );
  }
  expect(dimensions).toEqual(Array(3).fill(['44px', '8px', '14px']));
});

for (const width of [360, 390, 768, 1440]) {
  test(`shop layouts fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setCheckout(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of [
      '/',
      '/products',
      '/devices/e2e-v031/x3',
      '/cart',
      '/checkout',
      '/account/orders',
      '/account/orders/E2E-ORDER',
      '/account/profile',
      '/account/addresses',
    ]) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(
        page.getByRole('link', { name: '购物车，当前 2 件商品' }),
      ).toBeVisible();
      const overflowing = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflowing, `${path} must fit ${width}px`).toBe(false);
    }
    expect(errors).toEqual([]);
    await page.goto('/cart');
    await expect(page.locator('article')).toHaveCount(2);
    await page.screenshot({
      path: `test-results/cart-${width}.png`,
      fullPage: true,
    });
  });
}
