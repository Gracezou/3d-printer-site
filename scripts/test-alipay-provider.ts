import assert from 'node:assert/strict';

import { AlipayPageProvider } from '@/lib/services/payment/alipay.provider';

async function main(): Promise<void> {
  const notifyUrl = process.env.ALIPAY_NOTIFY_URL?.trim();
  const returnUrl = process.env.ALIPAY_RETURN_URL?.trim();
  assert(notifyUrl, 'ALIPAY_NOTIFY_URL 未配置');
  assert(returnUrl, 'ALIPAY_RETURN_URL 未配置');

  const provider = new AlipayPageProvider();
  const outTradeNo = `MIGRATION${Date.now()}`;
  const payment = await provider.createPayment({
    outTradeNo,
    amount: '0.01',
    subject: '支付迁入检查',
    notifyUrl,
    returnUrl,
  });
  const payUrl = new URL(payment.payUrl);
  const bizContent = JSON.parse(
    payUrl.searchParams.get('biz_content') ?? '{}',
  ) as Record<string, unknown>;
  assert.equal(payUrl.searchParams.get('method'), 'alipay.trade.page.pay');
  assert.equal(payUrl.searchParams.get('notify_url'), notifyUrl);
  assert.equal(payUrl.searchParams.get('return_url'), returnUrl);
  assert.equal(bizContent.out_trade_no, outTradeNo);
  assert.equal(bizContent.total_amount, '0.01');
  assert.equal(bizContent.product_code, 'FAST_INSTANT_TRADE_PAY');
  assert(payUrl.searchParams.get('sign'), '签名不能为空');

  const query = await provider.queryPayment(outTradeNo);
  assert.equal(query.status, 'pending');
  process.stdout.write(
    'Alipay provider check passed: signed page-pay parameters and sandbox query are valid.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Alipay provider check failed: ${message}\n`);
  process.exitCode = 1;
});
