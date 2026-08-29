'use client';

import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

interface ApiResponse<T> {
  code: number;
  data: T | null;
  message: string;
}

export function MockPaymentConfirm({
  outTradeNo,
  amount,
}: {
  outTradeNo: string;
  amount: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/payments/mock/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outTradeNo }),
      });
      const result = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok || !result.data) throw new Error(result.message);
      window.location.assign(
        `/checkout/pay/result?outTradeNo=${encodeURIComponent(outTradeNo)}`,
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '确认支付失败');
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-dashed border-[#3d6247]/30 bg-white p-10 text-center shadow-sm">
      <CheckCircle2 className="mx-auto size-12 text-[#3d6247]" />
      <p className="mt-3 text-xs font-bold tracking-[0.18em] text-[#59705f]">
        MOCK PAYMENT
      </p>
      <h2 className="mt-3 text-3xl font-semibold">模拟支付确认</h2>
      <p className="mt-5 text-4xl font-semibold">¥{amount}</p>
      <p className="mt-3 text-xs text-stone-400">{outTradeNo}</p>
      <button
        disabled={busy}
        onClick={() => void confirm()}
        className="mt-8 inline-flex h-12 min-w-48 items-center justify-center rounded-full bg-[#17251c] px-7 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : (
          '模拟支付成功'
        )}
      </button>
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      <p className="mt-5 text-xs text-stone-400">
        仅在 ENABLE_MOCK_PAYMENT=true 时可用
      </p>
    </div>
  );
}
