'use client';

import { AlertTriangle, LoaderCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface ApiResponse<T> {
  code: number;
  data: T | null;
  message: string;
}

interface CreatedPayment {
  outTradeNo: string;
  payUrl: string;
  amount: string;
  reservedUntil: string;
}

export function PaymentLauncher({ orderNo }: { orderNo: string }) {
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNo }),
        });
        const result = (await response.json()) as ApiResponse<CreatedPayment>;
        if (response.status === 401) {
          window.location.assign(
            `/auth/login?next=${encodeURIComponent(`/checkout/pay/${orderNo}`)}`,
          );
          return;
        }
        if (!response.ok || !result.data) throw new Error(result.message);
        window.sessionStorage.setItem(
          `payment:${result.data.outTradeNo}`,
          JSON.stringify({
            orderNo,
            amount: result.data.amount,
            reservedUntil: result.data.reservedUntil,
          }),
        );
        window.location.assign(result.data.payUrl);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : '支付创建失败');
      }
    })();
  }, [orderNo]);

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-rose-500" />
        <h2 className="mt-4 text-xl font-semibold text-rose-900">
          无法发起支付
        </h2>
        <p className="mt-2 text-sm text-rose-700">{error}</p>
        <Link
          href="/checkout"
          className="mt-6 inline-flex h-10 items-center rounded-full bg-[#17251c] px-5 text-sm font-bold text-white"
        >
          返回结算页
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-stone-900/8 bg-white p-10 text-center shadow-sm">
      <LoaderCircle className="mx-auto size-10 animate-spin text-[#3d6247]" />
      <h2 className="mt-5 text-2xl font-semibold">正在创建安全支付</h2>
      <p className="mt-2 text-sm text-stone-500">订单号：{orderNo}</p>
      <p className="mt-6 inline-flex items-center gap-2 text-xs text-stone-400">
        <ShieldCheck className="size-4" /> 即将跳转到支付宝收银台
      </p>
    </div>
  );
}
