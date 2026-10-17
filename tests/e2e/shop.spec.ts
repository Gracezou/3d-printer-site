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
  await page.route('**/_next/image?*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e5e7eb"/></svg>',
    }),
  );
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
        variants: (path.includes('e2e-colorways')
          ? [fixtureIds.black, fixtureIds.dual, fixtureIds.standBlack]
          : [fixtureIds.small, fixtureIds.large]
        ).map((variantId) => ({
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

test('style change clears incompatible colors without a device confirmation step', async ({
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
  await expect(page.getByRole('button', { name: /^黑色/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: '拼色', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '重新选择规格' }).click();
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeDisabled();
  await page.goto('/products/e2e-v031-case?device=unrelated');
  await expect(page.getByRole('link', { name: '切换机型' })).toHaveCount(0);
  await page.getByRole('button', { name: '小号', exact: true }).click();
  await page.getByRole('button', { name: '黑色', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '立即购买', exact: true }),
  ).toBeEnabled();
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

test('adding a selected SKU locks duplicate clicks and updates the cart badge', async ({
  page,
}) => {
  let writes = 0;
  await page.route('**/api/cart/items', async (route) => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({
      variantId: fixtureIds.small,
      quantity: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await respond(route, { id: 'cart-a', quantity: 2, cartCount: 4 });
  });
  await page.goto('/products/e2e-v031-case');
  await page.getByRole('button', { name: '小号', exact: true }).click();
  await page.getByRole('button', { name: '黑色', exact: true }).click();
  await page.getByRole('button', { name: '增加数量', exact: true }).click();
  await page
    .getByRole('button', { name: '加入购物车', exact: true })
    .evaluate((node) => {
      (node as HTMLButtonElement).click();
      (node as HTMLButtonElement).click();
    });
  await expect(
    page.getByText('已加入购物车，购物车内共 2 件', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '购物车，当前 4 件商品' }),
  ).toBeVisible();
  expect(writes).toBe(1);
});

test('coupon entry stays collapsed and recalculates discount and delivery locally', async ({
  page,
}) => {
  await setCheckout(page);
  const requests: Array<string | null> = [];
  await page.route('**/api/orders/preview', async (route) => {
    const code = route.request().postDataJSON().discountCode ?? null;
    requests.push(code);
    await respond(
      route,
      code
        ? {
            ...preview,
            discountAmount: '2.00',
            shippingAmount: '0.00',
            payableAmount: '18.00',
            discount: { code, name: '受控优惠', type: 'fixed_amount' },
            shipping: {
              ruleName: '普通配送',
              freeThreshold: null,
              reason: 'discount_code',
            },
          }
        : preview,
    );
  });
  await page.goto('/checkout');
  await expect(
    page.getByRole('button', { name: '提交订单', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('textbox', { name: '折扣码', exact: true }),
  ).toBeHidden();
  await page.getByText('有折扣码？', { exact: true }).click();
  await page
    .getByRole('textbox', { name: '折扣码', exact: true })
    .fill('private2');
  await page.getByRole('button', { name: '使用', exact: true }).click();
  await expect(page.getByText('已使用：受控优惠（PRIVATE2）')).toBeVisible();
  await expect(page.getByText('¥18.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText('¥26.00', { exact: true })).toBeVisible();
  expect(requests).toEqual([null, 'PRIVATE2', null]);
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

test('payment launch returns to the result page and waits for authoritative success', async ({
  page,
}) => {
  let payments = 0;
  let queries = 0;
  await page.route('**/api/payments', async (route) => {
    payments++;
    expect(route.request().postDataJSON()).toEqual({ orderNo: 'E2E-ORDER' });
    await respond(route, {
      outTradeNo: 'E2E-PAYMENT',
      payUrl: '/checkout/pay/result?outTradeNo=E2E-PAYMENT',
      amount: '56.00',
      reservedUntil: new Date(Date.now() + 600_000).toISOString(),
    });
  });
  await page.route('**/api/payments/E2E-PAYMENT/status', (route) => {
    queries++;
    return respond(route, {
      status: queries > 1 ? 'success' : 'pending',
      orderStatus: queries > 1 ? 'in_production' : 'pending_payment',
      orderNo: 'E2E-ORDER',
      reservedUntil: new Date(Date.now() + 600_000).toISOString(),
    });
  });
  await page.goto('/checkout/pay/E2E-ORDER');
  await expect(page).toHaveURL(
    /\/checkout\/pay\/result\?outTradeNo=E2E-PAYMENT$/,
  );
  await expect(
    page.getByRole('heading', { name: '等待支付结果' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '支付成功', exact: true }),
  ).toBeVisible();
  expect(payments).toBe(1);
  await page.getByRole('link', { name: '查看订单进度' }).click();
  await expect(page).toHaveURL(/\/account\/orders\/E2E-ORDER$/);
});

test('closed payment never displays success and missing references are handled', async ({
  page,
}) => {
  await page.route('**/api/payments/E2E-CLOSED/status', (route) =>
    respond(route, {
      status: 'closed',
      orderStatus: 'cancelled',
      orderNo: 'E2E-ORDER',
      reservedUntil: null,
    }),
  );
  await page.goto('/checkout/pay/result?outTradeNo=E2E-CLOSED');
  await expect(
    page.getByRole('heading', { name: '订单已关闭或支付超时' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '支付成功', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: '返回商品列表' }).click();
  await expect(page).toHaveURL(/\/products$/);
  await page.goto('/checkout/pay/result');
  await expect(
    page.getByRole('heading', { name: '缺少支付单号' }),
  ).toBeVisible();
});

test('payment result with an expired session restores its exact login destination', async ({
  page,
}) => {
  await page.route('**/api/payments/E2E-EXPIRED/status', (route) =>
    respond(route, null, 401),
  );
  await page.goto('/checkout/pay/result?outTradeNo=E2E-EXPIRED');
  await expect(page).toHaveURL(/\/auth\/login\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(
    '/checkout/pay/result?outTradeNo=E2E-EXPIRED',
  );
});

test('after-sales uploads evidence, retains a failed draft and shows the successful request', async ({
  page,
}) => {
  let attempts = 0;
  let uploaded = 0;
  let submitted = false;
  await page.route('**/api/orders/E2E-RETURN-ORDER', (route) =>
    respond(route, {
      ...orderFixture('E2E-RETURN-ORDER', 'completed'),
      itemsAmount: '50.00',
      discountAmount: '0.00',
      shippingAmount: '6.00',
      buyerRemark: null,
      discountCode: null,
      paidAt: null,
      shippedAt: null,
      completedAt: null,
      cancelledAt: null,
      shipment: null,
      receiver: {
        name: '测试收件人',
        phone: '13800000000',
        address: '上海市本地测试地址',
      },
      items: [
        {
          ...cartItems[0],
          printStatus: null,
          printStatusText: null,
          printerName: null,
          refundedQuantity: 0,
          refundableQuantity: submitted ? 0 : 1,
          ordinaryReturnAllowed: true,
          exceptionReturnAllowed: true,
        },
      ],
      returnRequests: submitted
        ? [
            {
              requestNo: 'E2E-RETURN-SUCCESS',
              reasonCode: 'quality_issue',
              reasonText: '外壳边缘有破损',
              status: 'pending',
              reviewRemark: null,
              createdAt: new Date().toISOString(),
              reviewedAt: null,
            },
          ]
        : [],
    }),
  );
  await page.route('**/api/returns/upload', (route) => {
    uploaded++;
    expect(route.request().headers()['content-type']).toContain(
      'multipart/form-data',
    );
    return respond(route, { url: 'https://browser-test.invalid/evidence.png' });
  });
  await page.route('**/api/returns', async (route) => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({
      orderNo: 'E2E-RETURN-ORDER',
      reasonCode: 'quality_issue',
      reasonText: '外壳边缘有破损',
      images: ['https://browser-test.invalid/evidence.png'],
      items: [{ orderItemId: cartItems[0].id, quantity: 1 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (attempts === 1) return respond(route, null, 500);
    submitted = true;
    return respond(route, { requestNo: 'E2E-RETURN-SUCCESS' });
  });
  await page.goto('/account/orders/E2E-RETURN-ORDER');
  await expect(
    page.getByRole('button', { name: '提交申请', exact: true }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: '申请退款' }).check();
  await page
    .getByRole('textbox', { name: '售后问题说明' })
    .fill('外壳边缘有破损');
  await page.getByLabel('凭证图片', { exact: false }).setInputFiles({
    name: 'evidence.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(page.getByRole('button', { name: '提交中…' })).toBeDisabled();
  await expect(page.locator('main')).toContainText('模拟网络失败');
  await expect(page.getByRole('textbox', { name: '售后问题说明' })).toHaveValue(
    '外壳边缘有破损',
  );
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(
    page.getByText('E2E-RETURN-SUCCESS', { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  expect(uploaded).toBe(2);
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

const orderFixture = (orderNo: string, status = 'pending_payment') => ({
  orderNo,
  status,
  statusText:
    status === 'pending_payment'
      ? '待支付'
      : status === 'shipped'
        ? '待收货'
        : '已完成',
  payableAmount: '56.00',
  paidAmount: status === 'pending_payment' ? '0.00' : '56.00',
  refundedAmount: '0.00',
  latestReturn: null,
  reservedUntil: null,
  createdAt: '2026-10-16T00:00:00Z',
  items: cartItems,
});

test('order filters, pagination and detail return retain URL state', async ({
  page,
}) => {
  await page.route('**/api/orders?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    await respond(route, {
      list: [
        orderFixture(
          'E2E-ORDER',
          params.get('status') === 'shipped' ? 'shipped' : 'pending_payment',
        ),
      ],
      total: 20,
      page: Number(params.get('page')),
      pageSize: 10,
    });
  });
  await page.goto('/account/orders');
  await page.getByRole('button', { name: '待收货', exact: true }).click();
  await page.getByRole('button', { name: '下一页订单' }).click();
  await expect(page).toHaveURL(/status=shipped&page=2/);
  await page.reload();
  await expect(
    page.getByRole('button', { name: '待收货', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '查看详情', exact: true }).click();
  await page.getByRole('link', { name: '返回订单列表', exact: true }).click();
  await expect(page).toHaveURL(/status=shipped&page=2/);
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/orders$/);
  await page.goBack();
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
});

test('order cards expand items, distinguish refunded money and have one primary action', async ({
  page,
}) => {
  await page.route('**/api/orders?*', (route) =>
    respond(route, {
      list: [
        {
          ...orderFixture('E2E-MULTI', 'completed'),
          refundedAmount: '12.00',
          items: [...cartItems, { ...cartItems[0], productName: '第三件商品' }],
        },
        orderFixture('E2E-PENDING'),
        orderFixture('E2E-SHIPPED', 'shipped'),
      ],
      total: 3,
      page: 1,
      pageSize: 10,
    }),
  );
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/account/orders');
  const card = page.locator('article').filter({ hasText: 'E2E-MULTI' });
  await expect(card.getByText('第三件商品')).toHaveCount(0);
  await card.getByRole('button', { name: '展开全部 3 款商品' }).click();
  await expect(card.getByText('第三件商品')).toBeVisible();
  await expect(card).toContainText('实付');
  await expect(card).toContainText('¥56.00');
  await expect(card).toContainText('已退款');
  await expect(card).toContainText('¥12.00');
  for (const item of await page.locator('article').all())
    await expect(
      item.locator('a.bg-store-ink, button.bg-store-ink'),
    ).toHaveCount(1);
  await card.getByRole('button', { name: '收起商品' }).click();
  await expect(card.getByText('第三件商品')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/orders-360.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(page.locator('article')).toHaveCount(3);
  await page.screenshot({
    path: 'test-results/orders-1440.png',
    fullPage: false,
  });
  await page.locator('article').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/orders-1440-bottom.png' });
});

test('order mutations only lock their own card and failures retry locally', async ({
  page,
}) => {
  let cancelCalls = 0;
  let confirmed = false;
  let cancelled = false;
  await page.route('**/api/orders?*', (route) =>
    respond(route, {
      list: [
        orderFixture('E2E-CANCEL', cancelled ? 'cancelled' : 'pending_payment'),
        orderFixture('E2E-CONFIRM', confirmed ? 'completed' : 'shipped'),
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    }),
  );
  await page.route('**/api/orders/E2E-CANCEL/cancel', async (route) => {
    cancelCalls++;
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (cancelCalls === 1) return respond(route, null, 500);
    cancelled = true;
    return respond(route, { success: true });
  });
  await page.route('**/api/orders/E2E-CONFIRM/confirm', (route) => {
    confirmed = true;
    return respond(route, { success: true });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/account/orders');
  const first = page.locator('article').filter({ hasText: 'E2E-CANCEL' });
  const second = page.locator('article').filter({ hasText: 'E2E-CONFIRM' });
  await first.getByRole('button', { name: '取消订单', exact: true }).click();
  await expect(first.getByRole('button', { name: '处理中…' })).toBeDisabled();
  await expect(first.getByRole('link', { name: '去支付' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(second.getByRole('button', { name: '确认收货' })).toBeEnabled();
  await second.getByRole('button', { name: '确认收货' }).click();
  await expect(second.getByRole('status')).toContainText('已确认收货');
  await expect(first.getByRole('alert')).toContainText('模拟网络失败');
  await expect(second.getByRole('alert')).toHaveCount(0);
  await first.getByRole('button', { name: '重试此操作' }).click();
  await expect(first.getByRole('status')).toContainText('订单已取消');
  expect(cancelCalls).toBe(2);
  await expect(
    first.getByRole('button', { name: '取消订单', exact: true }),
  ).toHaveCount(0);
});

test('out-of-range order pages recover after the final item disappears', async ({
  page,
}) => {
  await page.route('**/api/orders?*', (route) =>
    respond(route, { list: [], total: 0, page: 1, pageSize: 10 }),
  );
  await page.goto('/account/orders?status=pending_payment&page=2');
  await expect(page).toHaveURL(/\/account\/orders\?status=pending_payment$/);
  await expect(page.getByText('当前分类暂无订单')).toBeVisible();
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
      '/products/e2e-v031-case',
      '/products/e2e-colorways',
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
