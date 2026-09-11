'use client';

import { CheckCircle2, Clock3, LoaderCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface ApiResponse<T> {
  code: number;
  data: T | null;
  message: string;
}

interface PaymentStatus {
  status: 'pending' | 'success' | 'closed';
  orderStatus: string;
  orderNo: string;
  reservedUntil: string | null;
}

function readLocalPayment(outTradeNo: string): {
  amount?: string;
  reservedUntil?: string;
} {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(`payment:${outTradeNo}`) ?? '{}',
    ) as { amount?: string; reservedUntil?: string };
  } catch {
    return {};
  }
}

export function PaymentResult({ outTradeNo }: { outTradeNo: string }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [error, setError] = useState('');
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    const local = readLocalPayment(outTradeNo);
    setAmount(local.amount ?? '');
    setDeadline(local.reservedUntil ?? null);
  }, [outTradeNo]);

  useEffect(() => {
    if (!deadline) return;
    const update = () =>
      setRemainingSeconds(
        Math.max(
          0,
          Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000),
        ),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/payments/${encodeURIComponent(outTradeNo)}/status`,
          { cache: 'no-store' },
        );
        const result = (await response.json()) as ApiResponse<PaymentStatus>;
        if (response.status === 401) {
          router.replace(
            `/auth/login?next=${encodeURIComponent(`/checkout/pay/result?outTradeNo=${outTradeNo}`)}`,
          );
          return;
        }
        if (!response.ok || !result.data) throw new Error(result.message);
        if (!active) return;
        setPayment(result.data);
        setDeadline((value) => value ?? result.data?.reservedUntil ?? null);
        setPolls((value) => value + 1);
        if (
          result.data.status === 'pending' &&
          Date.now() - startedAt < 5 * 60_000
        ) {
          timer = window.setTimeout(poll, 3000);
        }
      } catch (caught: unknown) {
        if (active)
          setError(
            caught instanceof Error ? caught.message : '支付状态查询失败',
          );
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [outTradeNo, router]);

  const countdown = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [remainingSeconds]);

  if (payment?.status === 'success') {
    return (
      <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
        <h2 className="mt-5 text-3xl font-semibold">支付成功</h2>
        <p className="mt-3 text-sm text-stone-500">
          订单 {payment.orderNo} 已进入生产流程
        </p>
        <Link
          href={`/account/orders/${payment.orderNo}`}
          className="bg-store-ink mt-7 inline-flex h-11 items-center rounded-full px-6 text-sm font-bold text-white"
        >
          查看订单进度
        </Link>
      </div>
    );
  }

  if (
    payment?.status === 'closed' ||
    (deadline && new Date(deadline).getTime() <= Date.now())
  ) {
    return (
      <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
        <XCircle className="mx-auto size-14 text-stone-400" />
        <h2 className="mt-5 text-2xl font-semibold">订单已关闭或支付超时</h2>
        <p className="mt-3 text-sm text-stone-500">请重新选购并创建订单</p>
        <Link
          href="/products"
          className="bg-store-ink mt-7 inline-flex h-11 items-center rounded-full px-6 text-sm font-bold text-white"
        >
          返回商品列表
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-stone-900/8 bg-white p-10 text-center shadow-sm">
      <LoaderCircle className="text-store-success mx-auto size-12 animate-spin" />
      <h2 className="mt-5 text-2xl font-semibold">等待支付结果</h2>
      {amount ? <p className="mt-3 text-4xl font-semibold">¥{amount}</p> : null}
      <p className="mt-4 text-sm text-stone-500">支付单号：{outTradeNo}</p>
      <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
        <Clock3 className="size-4" />
        剩余 {countdown}
      </p>
      <p className="mt-4 text-xs text-stone-400">
        每 3 秒查询一次，以异步通知结果为准
        {polls ? ` · 已查询 ${polls} 次` : ''}
      </p>
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
