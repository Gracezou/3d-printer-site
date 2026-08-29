'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CirclePlay,
  LoaderCircle,
  PackageOpen,
  RefreshCcw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface JobMaterial {
  id: string;
  name: string;
  colorHex: string | null;
  requiredGrams: string;
  stockGrams: string;
  warning: boolean;
}

interface PrintJob {
  id: string;
  orderNo: string;
  orderCreatedAt: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  quantity: number;
  status: string;
  printerName: string | null;
  failedCount: number;
  remark: string | null;
  materials: JobMaterial[];
}

interface ProductionResponse {
  list: PrintJob[];
  total: number;
  materialOptions: Array<{
    id: string;
    name: string;
    colorHex: string | null;
  }>;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

const columns = [
  { status: 'queued', label: '待排产', tone: 'bg-slate-100 text-slate-700' },
  { status: 'printing', label: '打印中', tone: 'bg-blue-100 text-blue-700' },
  {
    status: 'post_processing',
    label: '后处理',
    tone: 'bg-violet-100 text-violet-700',
  },
  { status: 'done', label: '已完成', tone: 'bg-emerald-100 text-emerald-700' },
  { status: 'failed', label: '失败', tone: 'bg-rose-100 text-rose-700' },
] as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
    cache: 'no-store',
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (response.status === 401) {
    window.location.assign('/admin/login');
    throw new Error('后台登录已失效');
  }
  if (!response.ok || body.data === null)
    throw new Error(body.message || '请求失败');
  return body.data;
}

export function ProductionBoard({ canUpdate }: { canUpdate: boolean }) {
  const [data, setData] = useState<ProductionResponse | null>(null);
  const [materialId, setMaterialId] = useState('');
  const [printerNames, setPrinterNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (materialId) params.set('materialId', materialId);
      setData(
        await apiRequest<ProductionResponse>(
          `/api/admin/print-jobs?${params.toString()}`,
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '生产任务加载失败');
    }
  }, [materialId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function action(
    job: PrintJob,
    operation: 'start' | 'post-process' | 'done' | 'fail',
  ): Promise<void> {
    let body: Record<string, string> | undefined;
    if (operation === 'start') {
      const printerName = (printerNames[job.id] ?? '').trim();
      if (!printerName) {
        setError('请先填写打印机名称');
        return;
      }
      body = { printerName };
    }
    if (operation === 'fail') {
      const deduction = job.materials
        .map((item) => `${item.name} ${item.requiredGrams}g`)
        .join('、');
      const remark = window.prompt(
        `标记失败会立即额外扣减：${deduction || '该任务未记录耗材'}。\n请输入失败原因：`,
      );
      if (!remark?.trim()) return;
      if (
        !window.confirm(`确认额外扣减 ${deduction || '任务耗材'} 并重新排产？`)
      )
        return;
      body = { remark: remark.trim() };
    }
    setBusy(job.id);
    setError('');
    try {
      const result = await apiRequest<{ warning?: boolean }>(
        `/api/admin/print-jobs/${job.id}/${operation}`,
        {
          method: 'POST',
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      setNotice(
        result.warning
          ? '操作成功，但部分耗材库存已为负数，请尽快补货'
          : '生产任务状态已更新',
      );
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      {notice ? (
        <div className="fixed top-5 right-5 z-[90] rounded-2xl bg-[#151816] px-5 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">
            PRODUCTION
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            生产看板
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            按生产阶段推进任务，打印失败会按订单 BOM 再次扣减完整耗材。
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            className="h-10 min-w-48 rounded-xl border border-black/8 bg-white px-3 text-sm"
          >
            <option value="">全部耗材</option>
            {data?.materialOptions.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="grid size-10 place-items-center rounded-xl border border-black/8 bg-white"
            aria-label="刷新"
          >
            <RefreshCcw className="size-4" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      ) : null}

      {!data ? (
        <div className="grid min-h-[50vh] place-items-center text-sm text-neutral-400">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="mt-7 grid items-start gap-4 xl:grid-cols-5">
          {columns.map((column) => {
            const jobs = data.list.filter(
              (job) => job.status === column.status,
            );
            return (
              <section
                key={column.status}
                className="min-w-0 rounded-2xl border border-black/6 bg-white/60 p-3"
              >
                <div className="flex items-center justify-between px-1 py-1">
                  <h2 className="font-semibold">{column.label}</h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${column.tone}`}
                  >
                    {jobs.length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {jobs.map((job) => (
                    <article
                      key={job.id}
                      className="rounded-xl border border-black/6 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {job.productName}
                          </p>
                          <p className="mt-1 truncate text-xs text-neutral-500">
                            {job.variantName} × {job.quantity}
                          </p>
                        </div>
                        {job.failedCount ? (
                          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">
                            失败 {job.failedCount} 次
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-[11px] text-neutral-400">
                        {job.orderNo} · {formatDate(job.orderCreatedAt)}
                      </p>
                      <div className="mt-3 space-y-1.5 rounded-lg bg-neutral-50 p-2.5">
                        {job.materials.map((material) => (
                          <div
                            key={material.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="flex min-w-0 items-center gap-1.5 truncate text-neutral-600">
                              <span
                                className="size-2.5 shrink-0 rounded-full border border-black/10"
                                style={{
                                  backgroundColor: material.colorHex ?? '#ddd',
                                }}
                              />
                              {material.name}
                            </span>
                            <span className="shrink-0 font-medium">
                              {material.requiredGrams}g
                            </span>
                          </div>
                        ))}
                      </div>
                      {job.printerName ? (
                        <p className="mt-3 text-xs text-blue-700">
                          打印机：{job.printerName}
                        </p>
                      ) : null}
                      {canUpdate && job.status === 'queued' ? (
                        <div className="mt-3">
                          <input
                            value={printerNames[job.id] ?? ''}
                            onChange={(event) =>
                              setPrinterNames((current) => ({
                                ...current,
                                [job.id]: event.target.value,
                              }))
                            }
                            maxLength={50}
                            placeholder="打印机名称，如 P1S-01"
                            className="h-9 w-full rounded-lg border border-black/8 px-2.5 text-xs"
                          />
                          <button
                            disabled={busy !== ''}
                            onClick={() => void action(job, 'start')}
                            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            <CirclePlay className="size-3.5" /> 开始打印
                          </button>
                        </div>
                      ) : null}
                      {canUpdate && job.status === 'printing' ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            disabled={busy !== ''}
                            onClick={() => void action(job, 'post-process')}
                            className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-violet-600 text-[11px] font-semibold text-white disabled:opacity-50"
                          >
                            <Sparkles className="size-3.5" /> 后处理
                          </button>
                          <button
                            disabled={busy !== ''}
                            onClick={() => void action(job, 'fail')}
                            className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-700 disabled:opacity-50"
                          >
                            <RotateCcw className="size-3.5" /> 打印失败
                          </button>
                        </div>
                      ) : null}
                      {canUpdate && job.status === 'post_processing' ? (
                        <button
                          disabled={busy !== ''}
                          onClick={() => void action(job, 'done')}
                          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="size-3.5" /> 标记完成
                        </button>
                      ) : null}
                    </article>
                  ))}
                  {!jobs.length ? (
                    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-black/8 text-xs text-neutral-400">
                      <span className="text-center">
                        <PackageOpen className="mx-auto mb-2 size-4" />
                        暂无任务
                      </span>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
