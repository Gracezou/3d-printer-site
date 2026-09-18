'use client';

import {
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { notifyAdminUnauthorized } from '@/lib/admin-session-client';

interface ReturnItem {
  orderItemId: string;
  requestedQuantity: number;
  purchasedQuantity: number;
  productName: string;
  variantName: string;
  printStatus: string | null;
  refundedQuantity: number;
  refundableQuantity: number;
  refundedAmount: string;
  refundableAmount: string | null;
}

interface ReturnRequest {
  id: string;
  requestNo: string;
  orderId: string;
  orderNo: string;
  userEmail: string;
  reasonCode: string;
  reasonText: string | null;
  images: string[];
  status: string;
  reviewRemark: string | null;
  internalNotes: Array<{
    action: 'approve' | 'reject' | 'void';
    note: string;
    adminName: string;
    createdAt: string;
  }>;
  refundId: string | null;
  isException: boolean;
  createdAt: string;
  items: ReturnItem[];
}

interface Result {
  list: ReturnRequest[];
  total: number;
  page: number;
  pageSize: number;
}

interface Envelope<T> {
  code: number;
  data: T | null;
  message: string;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
    cache: 'no-store',
  });
  const body = (await response.json()) as Envelope<T>;
  if (response.status === 401) notifyAdminUnauthorized();
  if (!response.ok || body.data === null) {
    throw new Error(body.message || '请求失败');
  }
  return body.data;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const statuses = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

export function ReturnsManager() {
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [restock, setRestock] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (status) params.set('status', status);
      setResult(await apiRequest<Result>(`/api/admin/returns?${params}`));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '售后队列加载失败');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => void load(), [load]);

  async function approve(request: ReturnRequest): Promise<void> {
    const reviewRemark = window.prompt('审核说明（可选）', '') ?? undefined;
    setBusy(request.id);
    setError('');
    try {
      await apiRequest(`/api/admin/returns/${request.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          reviewRemark,
          items: request.items.map((item) => ({
            orderItemId: item.orderItemId,
            restock: restock[`${request.id}:${item.orderItemId}`] ?? false,
          })),
        }),
      });
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '审核通过失败');
    } finally {
      setBusy('');
    }
  }

  async function reject(request: ReturnRequest): Promise<void> {
    const reviewRemark = window.prompt('请输入驳回原因');
    if (!reviewRemark?.trim()) return;
    setBusy(request.id);
    setError('');
    try {
      await apiRequest(`/api/admin/returns/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewRemark }),
      });
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '驳回失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="p-5 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-neutral-400">
            AFTER SALES
          </p>
          <h1 className="mt-2 text-2xl font-semibold">售后审核</h1>
          <p className="mt-2 text-sm text-neutral-500">
            按件核对打印状态、可退余额与返库选择。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-black/8 bg-white p-2.5"
          aria-label="刷新"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setStatus('')}
          className={`rounded-full px-4 py-2 text-xs ${!status ? 'bg-[#151816] text-white' : 'bg-white'}`}
        >
          全部
        </button>
        {statuses.map((value) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={`rounded-full px-4 py-2 text-xs ${status === value ? 'bg-[#151816] text-white' : 'bg-white'}`}
          >
            {value}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          <CircleAlert className="size-4" /> {error}
        </div>
      ) : null}

      {loading && !result ? (
        <div className="grid min-h-80 place-items-center">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : result?.list.length ? (
        <div className="mt-6 space-y-4">
          {result.list.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{request.requestNo}</h2>
                    {request.isException ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                        <ShieldAlert className="size-3" /> 尺寸/装配例外
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    订单 {request.orderNo} · {request.userEmail} ·{' '}
                    {formatTime(request.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold">
                  {request.status}
                </span>
              </div>
              <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm leading-6">
                {request.reasonCode}：{request.reasonText || '未填写说明'}
              </p>
              {request.images.length ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {request.images.map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-black/8 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                      查看凭证 {index + 1}
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 space-y-2">
                {request.items.map((item) => {
                  const key = `${request.id}:${item.orderItemId}`;
                  return (
                    <div
                      key={item.orderItemId}
                      className="rounded-xl border border-black/6 p-3 text-sm"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">
                          {item.productName} · {item.variantName}
                        </span>
                        <span className="text-xs text-neutral-500">
                          打印：{item.printStatus ?? '无任务'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-neutral-500">
                        申请 {item.requestedQuantity} 件 · 已退{' '}
                        {item.refundedQuantity} 件 / ¥{item.refundedAmount} ·
                        可退 {item.refundableQuantity} 件 /{' '}
                        {item.refundableAmount === null
                          ? '—'
                          : `¥${item.refundableAmount}`}
                      </p>
                      {request.status === 'pending' ? (
                        <label className="mt-3 flex items-center gap-2 text-xs font-medium">
                          <input
                            type="checkbox"
                            checked={restock[key] ?? false}
                            onChange={(event) =>
                              setRestock((current) => ({
                                ...current,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                          退款成功后返还该商品耗材库存
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {request.reviewRemark ? (
                <p className="mt-3 text-xs text-neutral-500">
                  客户可见状态：{request.reviewRemark}
                </p>
              ) : null}
              {request.internalNotes.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-semibold">内部处理记录（仅后台可见）</p>
                  <ul className="mt-2 space-y-1.5">
                    {request.internalNotes.map((note) => (
                      <li key={`${note.action}:${note.createdAt}`}>
                        {formatTime(note.createdAt)} · {note.adminName} ·{' '}
                        {note.action === 'approve'
                          ? '审核'
                          : note.action === 'reject'
                            ? '驳回'
                            : '作废'}
                        ：{note.note}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {request.status === 'pending' ? (
                <div className="mt-4 flex gap-3">
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => void approve(request)}
                    className="h-10 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {busy === request.id ? '处理中…' : '通过并退款'}
                  </button>
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => void reject(request)}
                    className="h-10 rounded-xl border border-rose-200 px-5 text-sm font-semibold text-rose-700 disabled:opacity-40"
                  >
                    驳回
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-white p-12 text-center text-sm text-neutral-400">
          暂无售后申请
        </div>
      )}
    </div>
  );
}
