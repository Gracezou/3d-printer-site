import { describe, expect, it, vi } from 'vitest';

import { BizError } from '@/lib/errors';

import { AlipayPageProvider } from './alipay.provider';

function providerWith(result: Record<string, unknown>) {
  const exec = vi.fn().mockResolvedValue(result);
  return {
    exec,
    provider: new AlipayPageProvider({ exec } as never),
  };
}

const refundParams = {
  outTradeNo: 'ORDER-001',
  outRefundNo: 'REFUND-001',
  amount: '18.80',
  reason: '商品退款',
};

describe('AlipayPageProvider refund result classification', () => {
  it('treats code 10000 without refund_status as not found', async () => {
    const { provider } = providerWith({ code: '10000', msg: 'Success' });
    await expect(provider.queryRefund(refundParams)).resolves.toEqual({
      status: 'not_found',
    });
  });

  it('accepts REFUND_SUCCESS only when refund amount matches', async () => {
    const { provider } = providerWith({
      code: '10000',
      refundStatus: 'REFUND_SUCCESS',
      refundAmount: '18.80',
      outRequestNo: 'REFUND-001',
      tradeNo: 'TRADE-MUST-NOT-BE-USED',
    });
    await expect(provider.queryRefund(refundParams)).resolves.toEqual({
      status: 'success',
      providerRefundId: 'REFUND-001',
    });
  });

  it('rejects REFUND_SUCCESS with a mismatched amount', async () => {
    const { provider } = providerWith({
      code: '10000',
      refundStatus: 'REFUND_SUCCESS',
      refundAmount: '18.79',
    });
    await expect(provider.queryRefund(refundParams)).rejects.toBeInstanceOf(
      BizError,
    );
  });

  it('maps TRADE_NOT_EXIST to not found', async () => {
    const { provider } = providerWith({
      code: '40004',
      subCode: 'ACQ.TRADE_NOT_EXIST',
    });
    await expect(provider.queryRefund(refundParams)).resolves.toEqual({
      status: 'not_found',
    });
  });

  it.each([
    { code: '40004', subCode: 'ACQ.SYSTEM_ERROR' },
    { code: '20000', subCode: 'isp.unknow-error' },
  ])('throws for an indeterminate query result %#', async (result) => {
    const { provider } = providerWith(result);
    await expect(provider.queryRefund(refundParams)).rejects.toBeInstanceOf(
      BizError,
    );
  });

  it('classifies code 10000 with fund_change N as unknown', async () => {
    const { provider } = providerWith({
      code: '10000',
      fundChange: 'N',
    });
    await expect(provider.refund(refundParams)).resolves.toMatchObject({
      status: 'unknown',
    });
  });

  it.each([
    { code: '40004', subCode: 'ACQ.SYSTEM_ERROR' },
    { code: '20000', subCode: 'isp.unknow-error' },
  ])('keeps an ambiguous refund response unknown %#', async (result) => {
    const { provider } = providerWith(result);
    await expect(provider.refund(refundParams)).resolves.toMatchObject({
      status: 'unknown',
    });
  });

  it('classifies a documented deterministic business error as rejected', async () => {
    const { provider } = providerWith({
      code: '40004',
      subCode: 'ACQ.TRADE_HAS_CLOSE',
      subMsg: '交易已关闭',
    });
    await expect(provider.refund(refundParams)).resolves.toMatchObject({
      status: 'rejected',
      providerCode: 'ACQ.TRADE_HAS_CLOSE',
    });
  });

  it('accepts a refund only when fund_change is Y', async () => {
    const { provider } = providerWith({
      code: '10000',
      fundChange: 'Y',
      outRequestNo: 'REFUND-001',
      tradeNo: 'TRADE-MUST-NOT-BE-USED',
    });
    await expect(provider.refund(refundParams)).resolves.toMatchObject({
      status: 'success',
      providerRefundId: 'REFUND-001',
    });
  });
});
